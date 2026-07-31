import { PrismaClient } from "@prisma/client";

// A SECOND physical database, reserved for the write-heavy, ever-growing,
// rarely-fully-queried tables: PriceHistory (daily price snapshots) and
// ClickEvent (outbound-click log).
//
// WHY: Neon's free tier caps are PER PROJECT (storage, compute-hours, egress).
// These two tables grow without bound (new rows every day / every click, and
// PriceHistory is read in bulk to build price-trend charts + the RiftCompare
// Index), so isolating them onto their own Neon project gives them a separate
// allowance instead of competing with the operational data (Card, RetailerPrice,
// users, market reports, etc.) for the same monthly quota. If either database
// nears its limit, only the history/analytics features degrade (price-trend
// charts, the Index) — the core site (browsing, pricing, accounts) is unaffected,
// a far better failure mode than the whole site going down.
//
// SAFE BY DEFAULT: falls back to the same DATABASE_URL as db.ts when
// HISTORY_DATABASE_URL isn't set, so this ships as a NO-OP (same physical
// database, identical behaviour) until a second Neon project is provisioned and
// HISTORY_DATABASE_URL is added to Vercel + GitHub secrets. The schema
// (prisma/schema.prisma) is unchanged and shared — run `prisma db push` against
// the new URL once to create the tables there too (the unused Card/RetailerPrice/
// etc. tables it also creates cost negligible storage empty; only PriceHistory /
// ClickEvent get real traffic).

// RH6 (secrets.RH6) is the CURRENT history project — cut over 2026-07-31 after
// RH5 exhausted its monthly Neon network-transfer allowance (the same way _4
// went unreachable with P1001 before it, and _3/_2/base before that). RH5 and
// every older var are kept ONLY as read-only fallbacks/migration sources;
// treat them as dead, never the primary target. Once everything's copied
// across (see the `migrate-history-db` task in .github/workflows/maintenance.yml)
// and nothing references the older vars anymore, they can be removed entirely.
//
// ORDER MATTERS AND IS LOAD-BEARING: this list is duplicated, by necessity, in
// several places that cannot import this module (GitHub Actions `env:` blocks,
// scripts/build-db-push.sh). When you add a new project here, grep for the
// PREVIOUS variable name across the whole repo and update every hit — a chain
// that silently stops at an exhausted project is exactly how this repo has lost
// a day to an "unexplained" P1001 more than once.
const HISTORY_URL =
  process.env.RH6 ||
  process.env.RH5 ||
  process.env.HISTORY_DATABASE_URL_4 ||
  process.env.HISTORY_DATABASE_URL ||
  process.env.HISTORY_DATABASE_URL_2 ||
  process.env.HISTORY_DATABASE_URL_3 ||
  process.env.DATABASE_URL;

// Names the winning variable (never its value — it's a credential) so a P1001
// in the logs immediately answers "which database did it actually try?".
// Mirrors the same diagnostic in scripts/build-db-push.sh and lib/db.ts.
export const HISTORY_URL_SOURCE =
  process.env.RH6 ? "RH6"
  : process.env.RH5 ? "RH5"
  : process.env.HISTORY_DATABASE_URL_4 ? "HISTORY_DATABASE_URL_4"
  : process.env.HISTORY_DATABASE_URL ? "HISTORY_DATABASE_URL"
  : process.env.HISTORY_DATABASE_URL_2 ? "HISTORY_DATABASE_URL_2"
  : process.env.HISTORY_DATABASE_URL_3 ? "HISTORY_DATABASE_URL_3"
  : "DATABASE_URL (no history project set — history shares the operational DB)";

if (HISTORY_URL_SOURCE !== "RH6") {
  console.warn(
    `[db-history] history DB resolved to ${HISTORY_URL_SOURCE}, not RH6 — RH6 is missing from this ` +
      `environment. Every older project is exhausted/dead; expect P1001 or writes landing in the wrong place.`
  );
}

// True when the history tables live in their OWN database. When split, PriceHistory's
// Card foreign key means card rows must exist there too — see ensureHistoryCards().
export const historyIsSplit = HISTORY_URL !== process.env.DATABASE_URL;

// Ensure a generous connect_timeout (Postgres/libpq connection param, in
// seconds). Neon's pooled compute suspends when idle and can take a moment to
// resume; if that resume takes longer than the default driver timeout, the
// next connection sees "P1001: Can't reach database server" even though the
// database is fine. THIS EXACT ERROR is why HISTORY_DATABASE_URL_4 above got
// swapped for RH5 in the first place ("P1001, connection refused") — a longer
// timeout might have ridden out a cold start instead of needing a full project
// swap. Additive only — a URL that already sets its own connect_timeout wins.
function withConnectTimeout(url: string | undefined, seconds: number): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connect_timeout")) u.searchParams.set("connect_timeout", String(seconds));
    return u.toString();
  } catch {
    return url;
  }
}

function makeClient() {
  const base = new PrismaClient({
    datasourceUrl: withConnectTimeout(HISTORY_URL, 15),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  // Same egress-visibility guard as db.ts, so a runaway history/analytics query
  // shows up loudly instead of silently burning this database's own allowance.
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const res = await query(args);
          if (Array.isArray(res) && res.length >= 500) {
            try {
              const bytes = JSON.stringify(res).length;
              if (bytes >= 1_000_000) {
                console.warn(
                  `[egress-guard:history] ${model}.${operation} returned ~${(bytes / 1e6).toFixed(1)} MB ` +
                    `(${res.length} rows). If this runs per-request, memoize it or slim the select.`
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
// exhausting database connections (mirrors db.ts).
const globalForPrisma = globalThis as unknown as {
  dbHistory: Client | undefined;
};

export const dbHistory = globalForPrisma.dbHistory ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.dbHistory = dbHistory;
}

// PriceHistory.cardId carries a foreign key to Card, and in a split setup the
// history database has its OWN (mostly stub) Card table — a snapshot for a card
// that doesn't exist THERE yet fails the whole createMany. Before writing history
// rows, copy any missing Card rows from the operational DB. No-op when the history
// tables share the main database, and cheap otherwise (id-set diff + tiny insert).
export async function ensureHistoryCards(cardIds: string[]): Promise<void> {
  if (!historyIsSplit || cardIds.length === 0) return;
  const { prisma } = await import("./db");
  const have = await dbHistory.card.findMany({ where: { id: { in: cardIds } }, select: { id: true } });
  const haveSet = new Set(have.map((c) => c.id));
  const missing = cardIds.filter((id) => !haveSet.has(id));
  if (missing.length === 0) return;
  const rows = await prisma.card.findMany({ where: { id: { in: missing } } });
  // Strip nothing — Card has no outgoing FKs, so full rows insert cleanly.
  await dbHistory.card.createMany({ data: rows, skipDuplicates: true });
  console.log(`History DB: copied ${rows.length} missing card rows (FK for PriceHistory).`);
}
