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
// SAFE BY DEFAULT: falls back to the same database as db.ts when NO history
// variable is set at all, so this ships as a NO-OP (same physical database,
// identical behaviour) until a second Neon project is provisioned and the
// current history variable — HISTORY_DATABASE_URL, see the chain below — is
// added to Vercel + GitHub secrets. The schema
// (prisma/schema.prisma) is unchanged and shared — run `prisma db push` against
// the new URL once to create the tables there too (the unused Card/RetailerPrice/
// etc. tables it also creates cost negligible storage empty; only PriceHistory /
// ClickEvent get real traffic).

// HISTORY_DATABASE_URL is the CURRENT history project — cut over 2026-08-11
// when RH7 came within reach of its own allowance, a week after RH7 replaced RH6
// for the same reason (RH6 replaced RH5 on 2026-07-31; _4 went unreachable with
// P1001 before that, and _3/_2/base before it).
//
// THE CHAIN IS CURRENT-FIRST, NOT NEWEST-FIRST, AND THIS ENTRY IS WHY. Every
// previous rotation moved forward onto a freshly provisioned project, so "newest
// first" and "current first" happened to mean the same thing and the comments
// here said "newest". This one moves BACKWARD, onto the OLDEST project in the
// list: Neon's caps are per project and per month, HISTORY_DATABASE_URL was
// retired long enough ago that its allowance has reset, and re-using rested
// capacity we already own beats provisioning an RH8 and beats paying. The head
// of this list is therefore whichever project is in service TODAY — read it as a
// precedence order, never as a timeline.
//
// A recycled name carries one trap the forward rotations never had: the older
// vars are also migration SOURCES in .github/workflows/maintenance.yml, so a
// name that is both the target and a listed source would make a migration
// silently no-op while reporting every row count as matching. HISTORY_DATABASE_URL
// has been removed from every source list for that reason — grep it before
// rotating again.
//
// SIX PROJECTS IN ~TWO WEEKS IS A READ-PATTERN PROBLEM, NOT A CAPACITY ONE. A
// fresh project buys roughly four days at the current burn rate, so treat the
// next exhaustion as a signal to find the query, not to provision RH8. The
// egress guard below already logs any single history query returning ≥1 MB —
// grep the Vercel logs for "[egress-guard:history]" and it will name the
// model/operation. One known offender to check first: getEmptyCardIds() in
// lib/card-price-state.ts groups the ENTIRE PriceHistory table with no `where`,
// no `take` and no cache, so its payload grows every day forever.
//
// RH7 is kept as the rollback fallback and every older var below it is a
// read-only fallback/migration source; treat them as dead, never the primary
// target. Once everything's copied across (see the `migrate-history-db-to-hdu`
// task in .github/workflows/maintenance.yml) and nothing references the older
// vars anymore, they can be removed entirely.
//
// ORDER MATTERS AND IS LOAD-BEARING: this list is duplicated, by necessity, in
// several places that cannot import this module (GitHub Actions `env:` blocks,
// scripts/build-db-push.sh). When you add a new project here, grep for the
// PREVIOUS variable name across the whole repo and update every hit — a chain
// that silently stops at an exhausted project is exactly how this repo has lost
// a day to an "unexplained" P1001 more than once.
const HISTORY_URL =
  process.env.HISTORY_DATABASE_URL ||
  process.env.RH7 ||
  process.env.RH6 ||
  process.env.RH5 ||
  process.env.HISTORY_DATABASE_URL_4 ||
  process.env.HISTORY_DATABASE_URL_2 ||
  process.env.HISTORY_DATABASE_URL_3 ||
  process.env.DATABASE_URL;

// Names the winning variable (never its value — it's a credential) so a P1001
// in the logs immediately answers "which database did it actually try?".
// Mirrors the same diagnostic in scripts/build-db-push.sh and lib/db.ts.
export const HISTORY_URL_SOURCE =
  process.env.HISTORY_DATABASE_URL ? "HISTORY_DATABASE_URL"
  : process.env.RH7 ? "RH7"
  : process.env.RH6 ? "RH6"
  : process.env.RH5 ? "RH5"
  : process.env.HISTORY_DATABASE_URL_4 ? "HISTORY_DATABASE_URL_4"
  : process.env.HISTORY_DATABASE_URL_2 ? "HISTORY_DATABASE_URL_2"
  : process.env.HISTORY_DATABASE_URL_3 ? "HISTORY_DATABASE_URL_3"
  : "DATABASE_URL (no history project set — history shares the operational DB)";

if (HISTORY_URL_SOURCE !== "HISTORY_DATABASE_URL") {
  console.warn(
    `[db-history] history DB resolved to ${HISTORY_URL_SOURCE}, not HISTORY_DATABASE_URL — the current ` +
      `history project is missing from this environment. RH7 is kept only as a rollback and is near its ` +
      `allowance; everything older is exhausted. Expect P1001 or writes landing in the wrong place.`
  );
}

// True when the history tables live in their OWN database. When split, PriceHistory's
// Card foreign key means card rows must exist there too — see ensureHistoryCards().
// Compared against the RESOLVED operational URL, not bare DATABASE_URL. db.ts
// resolves the operational database as RM3 || DATABASE_URL_2 || DATABASE_URL,
// so comparing to DATABASE_URL alone got this wrong in a specific, quiet way:
// with RM3 set and no history variable at all, HISTORY_URL falls through to
// DATABASE_URL, which is NOT the operational database — yet this returned
// false ("not split"). ensureHistoryCards() then no-ops, and the next
// price-import's createMany fails PriceHistory's Card foreign key, swallowed by
// its try/catch as a single warning line.
//
// Resolved inline rather than imported from db.ts on purpose: db.ts constructs
// the operational PrismaClient at module scope, so importing it here eagerly
// would spin up a second client in every context that only wants history.
const OPERATIONAL_URL = process.env.RM3 || process.env.DATABASE_URL_2 || process.env.DATABASE_URL;
export const historyIsSplit = HISTORY_URL !== OPERATIONAL_URL;

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
