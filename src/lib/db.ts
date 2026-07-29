import { PrismaClient } from "@prisma/client";

// ─── DATA-EGRESS RULES (read before adding queries) ────────────────────────────
// Neon's free tier has a 5 GB/month NETWORK TRANSFER allowance. DexCompare has
// killed two databases by violating it; both incidents had the same shape: a
// per-request query pulling an unbounded dataset (the games pool, then the
// whole sealed table). The rules:
//
//   1. Per-REQUEST queries must be per-entity scoped (one card, one page of
//      rows) — never a whole table.
//   2. Anything that genuinely needs a big dataset must go through a
//      globalThis TTL memo (see lib/sealed-import.ts getSealedGroups). NOT
//      unstable_cache: it silently no-ops above 2 MB and every request then
//      hits the database.
//
//      VERIFIED against the Next.js source (server/lib/incremental-cache/
//      index.ts, IncrementalCache.set): entries over 2 MB are dropped — in
//      development it THROWS, in production it logs a console.warn and returns
//      without caching, so the loader silently re-runs against Postgres on every
//      request. unstable_cache definitely takes that path (it calls set() with
//      fetchCache: true).
//
//      THE REAL CEILING IS LOWER THAN 2 MB. unstable_cache stores
//      `body: JSON.stringify(result)` — a string — and the limit check then runs
//      JSON.stringify() over the whole entry, so the payload is DOUBLE-ENCODED
//      and every quote becomes \". A ~1.3-1.6 MB raw payload can trip the 2 MB
//      check. Budget ~1.2 MB raw as the safe maximum, not 2 MB.
//   3. Always `select` only the fields you use, and `take` a cap when the row
//      count is unbounded.
//   4. Whole-table reads belong in workflows/scripts (daily refresh, seeds),
//      never in request handlers.
//
// The egress guard below makes violations VISIBLE: any single query returning
// a ~1 MB+ payload logs loudly to the Vercel function logs instead of silently
// burning the allowance.
// ────────────────────────────────────────────────────────────────────────────────

const BIG_RESULT_ROWS = 500; // only size-check results at least this long (CPU)
const BIG_RESULT_BYTES = 1_000_000;

// RM3 is the CURRENT operational Neon project (cut over 2026-07-29, after
// DATABASE_URL_2 exhausted its free-tier monthly network-transfer allowance —
// itself the replacement for the original DATABASE_URL, which did the same).
// Prefer it the moment it's set (in both Vercel and GitHub Actions), same
// pattern as db-history.ts's fallback chain.
//
// The older vars are kept ONLY as fallbacks so a deploy can't hard-fail if RM3
// is momentarily missing from one environment; treat them as dead/read-only,
// never the primary target. Once RM3 is confirmed live everywhere and the data
// is verified across (see the migrate-main-db task in maintenance.yml), they
// can be deleted and this collapsed back to a single var.
//
// NOTE the ordering rule for any future rotation: the NEWEST project goes
// first. Getting this backwards silently keeps the site on the exhausted
// database while looking correct.
const OPERATIONAL_URL =
  process.env.RM3 || process.env.DATABASE_URL_2 || process.env.DATABASE_URL;

// Ensure a generous connect_timeout (the standard libpq/Postgres connection
// param, in seconds) is set. WHY: Neon's pooled compute suspends when idle and
// takes a moment to resume on the next connection; if that resume takes longer
// than the driver's default timeout, the very next build/request can see
// "P1001: Can't reach database server" even though the database is actually
// fine — it just hadn't finished waking up yet. This is not hypothetical here:
// db-history.ts's own history records exactly this error ("P1001, connection
// refused") as the reason a previous history-DB project was swapped out
// entirely, when a longer timeout might have ridden out a cold start instead.
// Additive only — a URL that already sets its own connect_timeout is untouched.
function withConnectTimeout(url: string | undefined, seconds: number): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connect_timeout")) u.searchParams.set("connect_timeout", String(seconds));
    return u.toString();
  } catch {
    return url; // never let a URL-parsing edge case break startup over a timeout tweak
  }
}

// Which var actually won, by NAME (never the value — it contains credentials).
// A Neon P1001 ("Can't reach database server at ep-…") names only the host, and
// with three fallback vars plus a separate history database in play there is no
// way to tell from the error alone WHICH client was pointed where. Logging the
// winning var name once at module init makes the next P1001 self-diagnosing —
// in particular it distinguishes "RM3 is down" from "RM3 is unset in this
// environment, so we silently fell back to the exhausted old database".
export const OPERATIONAL_URL_SOURCE = process.env.RM3
  ? "RM3"
  : process.env.DATABASE_URL_2
  ? "DATABASE_URL_2"
  : process.env.DATABASE_URL
  ? "DATABASE_URL"
  : "NONE";

if (OPERATIONAL_URL_SOURCE !== "RM3") {
  console.warn(
    `[db] operational database resolved from ${OPERATIONAL_URL_SOURCE}, not RM3. ` +
      `RM3 is the current project; the others are exhausted/read-only fallbacks kept only so a ` +
      `deploy can't hard-fail. If this appears in a Vercel build log, RM3 is missing from that environment.`
  );
}

function makeClient() {
  const base = new PrismaClient({
    datasourceUrl: withConnectTimeout(OPERATIONAL_URL, 15),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const res = await query(args);
          if (Array.isArray(res) && res.length >= BIG_RESULT_ROWS) {
            try {
              const bytes = JSON.stringify(res).length;
              if (bytes >= BIG_RESULT_BYTES) {
                console.warn(
                  `[egress-guard] ${model}.${operation} returned ~${(bytes / 1e6).toFixed(1)} MB ` +
                    `(${res.length} rows). If this runs per-request, memoize it (globalThis TTL) ` +
                    `or slim the select — this access pattern has burned Neon allowances before.`
                );
              }
            } catch {
              /* sizing is best-effort — never break the query */
            }
          }
          return res;
        },
      },
    },
  });
}

type Client = ReturnType<typeof makeClient>;

// Reuse a single PrismaClient across hot reloads in development to avoid
// exhausting database connections.
const globalForPrisma = globalThis as unknown as {
  prisma: Client | undefined;
};

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
