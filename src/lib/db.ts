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
//   5. NEVER give unstable_cache a `revalidate` LOWER than the page's own
//      `export const revalidate`. This rule cost five database projects before
//      anyone found it, and none of the rules above would have caught it,
//      because the offending query was small and correctly cached.
//
//      An unstable_cache revalidate is not scoped to its own entry: Next.js
//      applies it to the whole ROUTE SEGMENT, taking the lower of the two
//      (server/web/spec-extension/unstable-cache.js sets `store.revalidate =
//      options.revalidate` unless the store's is already smaller). So one
//      `{ revalidate: 300 }` inside a component on a `revalidate = 86400` page
//      silently re-ran EVERY query on that page — including all the uncached
//      ones around it — 288× a day instead of once.
//
//      That is exactly what components/EbayCardPanel.tsx did to /card/[id]
//      until 2026-08-14: ~10 uncached round trips × ~60 KB × 288 × ~200 hot
//      card URLs ≈ 2 GB/day, matching the observed burn almost exactly. It is
//      invisible in the source — the only evidence was
//      .next/prerender-manifest.json showing every /card/* route at
//      initialRevalidateSeconds: 300 instead of 86400.
//
//      TO CHECK: after a build, grep that manifest for a route whose
//      initialRevalidateSeconds is lower than the `export const revalidate` in
//      its page.tsx. If freshness genuinely needs a shorter window than the
//      page, fetch it CLIENT-side instead — that is the only way the TTL cannot
//      propagate to the segment.
//
// The egress guard below makes violations VISIBLE: any single query returning
// a ~1 MB+ payload logs loudly to the Vercel function logs instead of silently
// burning the allowance.
// ────────────────────────────────────────────────────────────────────────────────

const BIG_RESULT_ROWS = 500; // only size-check results at least this long (CPU)
const BIG_RESULT_BYTES = 1_000_000;

// RM7 is the CURRENT operational Neon project, cut over 2026-08-20. Ninth
// rotation (DATABASE_URL → DATABASE_URL_2 → RM3 → RM4 → RM5 → DATABASE_URL →
// DATABASE_URL_2 → RM6 → RM7). RM6 exhausted its 5 GB monthly network-transfer
// allowance just THREE DAYS after the 2026-08-17 cutover onto it — the same
// ~2 GB/day burn every prior project has shown.
//
// ⚠ THIS ROTATION IS NOT A FIX, AND THE NEXT ONE WON'T BE EITHER. Seven
// consecutive projects have now been exhausted the same way, which makes this
// a systemic read-volume problem, not bad luck with allowances. Rotating buys
// days; it has never bought a fix. The burn rate itself is the open problem —
// see the note on RetailerPrice below.
//
// SIZE CONTEXT FOR WHOEVER PICKS THIS UP: RetailerPrice is 77,861 rows (counted
// during the 2026-08-14 cutover) against Card's 1,429. Any hot path that reads
// RetailerPrice without a `take`/narrow `select`, or any cache that silently
// stops caching it, moves tens of MB per request — which is the only shape of
// bug that reaches 2 GB/day at this traffic level. Start there.
//
// THE CHAIN IS CURRENT-FIRST, NOT NEWEST-FIRST. Read the head of this list as
// "whichever project is in service TODAY" — a precedence order, never a
// timeline. Same convention as db-history.ts.
//
// THE NAME HAZARD, and it is worth reading before touching anything here.
// prisma/schema.prisma reads env("DATABASE_URL") directly, and nearly every
// script assigns `DATABASE_URL=<something> npx tsx …` to aim Prisma at a
// database. The head of this chain is RM7, so anything that runs Prisma MUST
// copy the winner into DATABASE_URL first or it will talk to a previous
// project while the app talks to the current one. scripts/build-db-push.sh
// does exactly that copy. Locally this all still resolves to the dev Postgres
// in .env.local, which is why local dev is unaffected.
//
// RM4's exhaustion is the sharpest example of what an unplanned rotation costs.
// It went from a clean 43-minute price import at 2026-08-09 19:30 UTC to
// refusing every connection by 04:35 the next morning, and because `next build`
// prerenders 22 database-backed pages, every Vercel deploy failed outright from
// that moment — with a bare `Error: Command "npm run build" exited with 1` and
// nothing in it naming a database.
//
// RM6 IS DELIBERATELY LAST, BELOW EVEN THE LONG-DEAD PROJECTS, and that is not
// an ordering mistake. It holds the freshest data of any fallback — a complete,
// row-count-verified copy as of the 2026-08-20 cutover — but it is also the one
// project KNOWN to have spent its monthly transfer allowance, hours before that
// cutover. A fallback exists to keep the site answering when the head of the
// chain is missing from an environment; an exhausted project refuses
// connections, so promoting RM6 on freshness would hand the site a database
// that cannot serve a single request. Freshness is worth nothing from a project
// that won't connect.
//
// RM8 SITS DIRECTLY BEHIND RM7 as the designated rollback for when RM7 spends
// its allowance — every project before it has, within days. RM5 stays behind
// RM8 as the second rollback: real (if older) data, allowance left as of
// 2026-08-20. Prefer "answers at all" over "answers with the newest rows" —
// that is the whole job of this list. Revisit when RM6's allowance resets at
// the start of the next billing month, at which point it can move back up.
//
// ⚠ TWO THINGS TO KNOW BEFORE RELYING ON RM8.
//
// 1. THIS IS NOT AUTOMATIC FAILOVER. `||` falls through on an UNSET variable,
//    not on an unreachable database. An exhausted RM7 is still SET, so this
//    chain keeps choosing it and the site keeps failing. Promoting RM8 is a
//    deliberate act: UNSET RM7 in Vercel (and GitHub), redeploy, and RM8 takes
//    over. Health-based failover would mean a live connection check on every
//    cold start, which costs a round trip on the very database whose transfer
//    allowance is the problem — so this stays manual on purpose.
//
// 2. AN EMPTY RM8 IS WORSE THAN A STALE RM5. A fallback only helps if it holds
//    data; restoring onto an empty project is exactly how production served
//    404s during the 2026-08-20 cutover. Run maintenance.yml's
//    `migrate-main-db-to-rm8` (RM7 → RM8) and keep re-running it periodically,
//    or RM8 is a fallback to a blank site.
//
// Do NOT delete DATABASE_URL: several scripts and Prisma itself still read that
// literal name, so unsetting it breaks far more than it tidies.
//
// ORDER MATTERS AND IS DUPLICATED: this list is mirrored, by necessity, in
// places that cannot import this module — scripts/build-db-push.sh and the
// `env:` blocks of .github/workflows/{maintenance,refresh-prices,db-audit,
// weekly-promo}.yml. tests/db-chain.test.ts pins the app and build chains to
// each other; the workflow blocks are checked by eye. Rotate them together, or
// the site reads one database while the importers write to another.
const OPERATIONAL_URL =
  process.env.RM7 ||
  process.env.RM8 ||
  process.env.RM5 ||
  process.env.DATABASE_URL_2 ||
  process.env.DATABASE_URL ||
  process.env.RM4 ||
  process.env.RM3 ||
  process.env.RM6;

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
const RESOLVED_SOURCE = process.env.RM7
  ? "RM7"
  : process.env.RM8
  ? "RM8"
  : process.env.RM5
  ? "RM5"
  : process.env.DATABASE_URL_2
  ? "DATABASE_URL_2"
  : process.env.DATABASE_URL
  ? "DATABASE_URL"
  : process.env.RM4
  ? "RM4"
  : process.env.RM3
  ? "RM3"
  : process.env.RM6
  ? "RM6"
  : "NONE";

// DB_SOURCE_NAME: the same answer, supplied by whoever set the URL.
//
// Learned the hard way on 2026-08-10. The chain above can only see variables the
// PROCESS can see, and every workflow in .github/workflows collapses the whole
// chain into ONE `DATABASE_URL:` value before the job starts. Inside Actions
// process.env.RM5 is therefore always undefined and this always reported
// "DATABASE_URL" — regardless of which secret actually won. While diagnosing the
// RM4 outage that read as "we silently fell through to the dead original
// database", which is precisely the failure this diagnostic was written to rule
// out, and it cost a round trip before the always-true-ness was spotted.
//
// So the workflows now also export DB_SOURCE_NAME with the winning variable's
// NAME (never its value), and it wins here when present. On Vercel the real
// variables ARE visible, nothing sets DB_SOURCE_NAME, and this resolves natively
// exactly as before.
export const OPERATIONAL_URL_SOURCE = process.env.DB_SOURCE_NAME || RESOLVED_SOURCE;

if (OPERATIONAL_URL_SOURCE !== "RM7") {
  console.warn(
    `[db] operational database resolved from ${OPERATIONAL_URL_SOURCE}, not RM7. ` +
      `RM7 is the current project (cut over 2026-08-20); RM8 is the designated rollback and RM5 the one behind it; ` +
      `everything below them is exhausted/read-only (RM6 last of all — freshest data, but its ` +
      `allowance is spent, so it cannot serve), kept only so a deploy can't hard-fail. ` +
      `If this appears in a Vercel build log, RM7 is missing from that environment.`
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
