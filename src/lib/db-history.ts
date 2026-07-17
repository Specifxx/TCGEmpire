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

// HISTORY_DATABASE_URL is the CURRENT history project (a fresh free-tier Neon DB,
// swapped in 2026-07-17 after _3 exhausted its monthly transfer allowance and became
// unreachable — P1001). _2/_3 are kept ONLY as fallbacks for anything not yet
// migrated; they should be treated as read-only/near-exhausted, never the primary
// target. Once _2's remaining data is copied across (see scripts/migrate-history.ts)
// and nothing references _2/_3 anymore, those vars can be removed entirely.
const HISTORY_URL =
  process.env.HISTORY_DATABASE_URL ||
  process.env.HISTORY_DATABASE_URL_2 ||
  process.env.HISTORY_DATABASE_URL_3 ||
  process.env.DATABASE_URL;

// True when the history tables live in their OWN database. When split, PriceHistory's
// Card foreign key means card rows must exist there too — see ensureHistoryCards().
export const historyIsSplit = HISTORY_URL !== process.env.DATABASE_URL;

function makeClient() {
  const base = new PrismaClient({
    datasourceUrl: HISTORY_URL,
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
