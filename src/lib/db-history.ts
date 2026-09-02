import { PrismaClient } from "@prisma/client";
import { HISTORY_VARS, OPERATIONAL_VARS, resolveUrl, resolveVar } from "./db-chains";

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

// RH6 is the CURRENT history project — cut over 2026-09-02 when RH11 reached its
// 5 GB monthly network-transfer allowance, two days after taking over from RH10
// (which served from 2026-08-28; RH10 replaced RH9, which served from 2026-08-25;
// RH9 replaced RH8, which served from 2026-08-23; RH8 replaced
// HISTORY_DATABASE_URL_4, which served from 2026-08-21; _4 replaced _3, which
// replaced _2 on 2026-08-19; _2 replaced HISTORY_DATABASE_URL; that replaced RH7
// on 2026-08-16; RH7 replaced RH6 on 2026-08-04; RH6 replaced RH5 on 2026-07-31).
//
// THE CHAIN IS CURRENT-FIRST, NOT NEWEST-FIRST. Read the head as "in service
// today", never as a timeline — several rotations went BACKWARDS onto recycled
// names (_2, _3, _4 are among the oldest in the list, and now RH6 itself) because
// Neon's caps are per project per month, so a long-retired project has a fully
// reset allowance.
//
// RH6 IS RECYCLED, UNLIKE RH8 THROUGH RH11 — AND THAT IS A DELIBERATE, VERIFIED
// EXCEPTION, NOT A REVERSION. RH8 through RH11 were each provisioned NEW after
// the 2026-08-23 incident: RH5, the intended target of that rotation, turned out
// to hold User=85, CollectionCard=374, Order=4 and RetailerPrice=39,635 — a full
// OPERATIONAL snapshot from an early term. The migration's User-row guard refused
// it; without that guard the TRUNCATE ... CASCADE would have destroyed real
// account data. RH6 itself is a NAME that was previously in service (2026-07-31
// to 2026-08-04) and had been sitting as a drained migration source since — not
// an untouched recycled name assumed safe by default. It was chosen for THIS
// cutover only after a 2026-09-02 probe-databases run confirmed it reports
// User=0 (a real history project, unlike RH5), and migrate-history-db-to-rh6
// re-checked that live, immediately before truncating it, rather than trusting
// the probe's memory. Before recycling ANY name — RH6 included, on some future
// rotation — re-run probe-databases and confirm User=0 fresh; never assume a
// prior probe still holds.
//
// A recycled name carries a second trap: the older vars are also migration
// SOURCES in .github/workflows/maintenance.yml, so a name that is both target
// and listed source makes a migration silently no-op while reporting every row
// count as matching. migrate-history-db-to-rh6's task pins SOURCE = RH11 only,
// never a fallback chain that could resolve back to RH6 itself — and the
// migrate-history top-up task ran FIRST, draining RH6's own pre-cutover rows
// (249,155 of them, its deep 2026-06-06..08-04 history) forward into RH11 so the
// TRUNCATE that follows loses nothing.
//
// TWELVE PROJECTS IN ~FIVE WEEKS IS A READ-PATTERN PROBLEM, NOT A CAPACITY ONE —
// and THIS rotation is the proof: recycling RH6 instead of provisioning RH12 is
// exactly what the note below has been arguing for since the RH11 cutover. A
// fresh (or recycled) project still buys only a few days at the current burn
// rate, so treat the next exhaustion as a signal to find the query, not to
// rotate again. getEmptyCardIds() in lib/card-price-state.ts and
// getRisingCards() in lib/top-deals.ts — both named as prime suspects on prior
// rotations — were rewritten to stop grouping/scanning the whole PriceHistory
// table per request (see those functions' own comments). The egress guard below
// still logs any single history query returning ≥1 MB — grep the Vercel logs for
// "[egress-guard:history]" if the allowance still drains fast; that names the
// next offender, and measuring it (scripts/audit-egress.ts) beats a thirteenth project.
//
// RH11 is kept as the rollback fallback and every older var below it is a
// read-only fallback/migration source; treat them as dead, never the primary
// target. Once everything's copied across (see the `migrate-history-db-to-rh6`
// task in .github/workflows/maintenance.yml) and nothing references the older
// vars anymore, they can be removed entirely.
//
// ORDER MATTERS AND IS LOAD-BEARING: this list is duplicated, by necessity, in
// a few places that cannot import this module (scripts/build-db-push.sh runs
// pre-build as a raw shell script; scripts/migrate-history.ts,
// scripts/probe-history-dbs.ts and scripts/repair-history-card-ids.ts are
// standalone scripts with their own resolution/inventory). GitHub Actions
// `env:` blocks are NOT part of this — every script here imports dbHistory
// from this module, so as long as a workflow step passes the var through
// (regardless of YAML order), this one chain decides precedence for all of
// them. When you add a new project here, grep for the PREVIOUS variable name
// across the whole repo and update every hit in the files above — a chain that
// silently stops at an exhausted project is exactly how this repo has lost a
// day to an "unexplained" P1001 more than once.
const HISTORY_URL = resolveUrl(HISTORY_VARS);

// Names the winning variable (never its value — it's a credential) so a P1001
// in the logs immediately answers "which database did it actually try?".
// Mirrors the same diagnostic in scripts/build-db-push.sh and lib/db.ts.
export const HISTORY_URL_SOURCE =
  resolveVar(HISTORY_VARS) === "DATABASE_URL" || resolveVar(HISTORY_VARS) === null
    ? "DATABASE_URL (no history project set — history shares the operational DB)"
    : resolveVar(HISTORY_VARS)!;

if (HISTORY_URL_SOURCE !== "RH6") {
  console.warn(
    `[db-history] history DB resolved to ${HISTORY_URL_SOURCE}, not RH6 — the current ` +
      `history project is missing from this environment. RH11 is the rollback (served ` +
      `2026-08-31 to 2026-09-02, at/near its allowance); RH10/RH9/RH8/_2/_3/_4 are spent. ` +
      `Expect P1001 or writes landing in the wrong place.`
  );
}

// True when the history tables live in their OWN database. When split, PriceHistory's
// Card foreign key means card rows must exist there too — see ensureHistoryCards().
// Compared against the RESOLVED operational URL, and it must stay that way even
// now that DATABASE_URL is itself the head of the operational chain. The two are
// not the same thing: this resolves "the operational database", which today
// happens to be the DATABASE_URL project — but the equality below has to keep
// comparing resolved-to-resolved, or the next rotation (onto a name that is NOT
// DATABASE_URL) silently reintroduces the original bug: HISTORY_URL falls
// through to DATABASE_URL, which is then NOT the operational database, and this
// returns false ("not split"). ensureHistoryCards() then no-ops, and the next
// price-import's createMany fails PriceHistory's Card foreign key — swallowed by
// its try/catch as a single warning line.
//
// THIS LIST HAD ITSELF DRIFTED once already, which is the same bug one level up:
// it stopped at RM3 while db.ts had moved on. So with RM5 serving and RM3 still
// set as a fallback, "the operational database" resolved here to RM3 — a
// different, dead project — and any comparison against it was answering about
// the wrong database. Harmless at the time (the history project is a distinct
// URL either way, so historyIsSplit stayed true), but a chain that is
// wrong-but-currently-harmless is exactly how this repo has lost a day to a
// P1001 more than once. Mirrors src/lib/db.ts's OPERATIONAL_URL, and
// tests/db-chain.test.ts fails if the two lists ever diverge again.
//
// Resolved inline rather than imported from db.ts on purpose: db.ts constructs
// the operational PrismaClient at module scope, so importing it here eagerly
// would spin up a second client in every context that only wants history.
// Imported from the same place db.ts uses, so the two can no longer disagree
// about which project "the operational database" means — a drift that once made
// ensureHistoryCards() silently no-op.
const OPERATIONAL_URL = resolveUrl(OPERATIONAL_VARS);
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
// Returns the ids that are CONFIRMED present in the history DB, so the caller can
// drop any card it could not copy instead of losing the whole batch to one FK
// violation. null means "not a split setup" — nothing to filter against.
export async function ensureHistoryCards(cardIds: string[]): Promise<Set<string> | null> {
  if (!historyIsSplit || cardIds.length === 0) return null;
  const { prisma } = await import("./db");
  const have = await dbHistory.card.findMany({ where: { id: { in: cardIds } }, select: { id: true } });
  const haveSet = new Set(have.map((c) => c.id));
  const missing = cardIds.filter((id) => !haveSet.has(id));
  if (missing.length === 0) return haveSet;
  const rows = await prisma.card.findMany({ where: { id: { in: missing } } });
  // Upsert BY ID rather than createMany({ skipDuplicates: true }) — createMany
  // silently drops a row that collides with ANY unique field, not just id. That
  // is exactly what happens for a card whose id changed in a catalogue rebuild
  // but whose slug/externalId still belongs to a stale row left behind in this
  // history-only Card table: the row we actually need for the FK never gets
  // inserted, this logged as if every row succeeded (it counted rows ATTEMPTED,
  // not rows actually written), and the next PriceHistory write for that card
  // then failed its FK check — silently, every day, since the snapshot write
  // is best-effort (see the try/catch around it in price-import.ts). Upsert by
  // id either creates the row we need or throws a specific, diagnosable error
  // (caught by that same try/catch) instead of a silent no-op.
  let inserted = 0;
  let repaired = 0;
  let failed = 0;
  for (const row of rows) {
    // Strip nothing else — Card has no outgoing FKs, so the full row upserts cleanly.
    try {
      await dbHistory.card.upsert({ where: { id: row.id }, create: row, update: row });
      inserted++;
    } catch (err) {
      // P2002 = one of Card's OTHER unique columns (slug, externalId) is already
      // held by a DIFFERENT, older row in this history-only table. Upserting by
      // id finds no match, falls through to CREATE, and collides.
      //
      // This is the same catalogue-rebuild drift the comment above describes,
      // and switching to upsert only made it VISIBLE — it still threw, and
      // because that throw escaped this loop it aborted the whole snapshot, so
      // NO card got a PriceHistory row. Production sat frozen at 2026-08-09 for
      // eleven days while every import reported success.
      if (!isUniqueConflict(err)) {
        failed++;
        console.warn(`History DB: could not copy card ${row.id}:`, err);
        continue;
      }
      // Free the contested value from whichever stale row holds it. Nulling is
      // safe and lossless here: Postgres allows many NULLs in a unique column,
      // this table exists ONLY to satisfy PriceHistory's foreign key, and
      // nothing reads its slug/externalId — whereas DELETING the stale row
      // would cascade away the price history attached to it.
      try {
        for (const field of ["slug", "externalId"] as const) {
          const value = row[field];
          if (!value) continue;
          await dbHistory.card.updateMany({
            where: { [field]: value, id: { not: row.id } },
            data: { [field]: null },
          });
        }
        await dbHistory.card.upsert({ where: { id: row.id }, create: row, update: row });
        inserted++;
        repaired++;
      } catch (err2) {
        failed++;
        console.warn(`History DB: card ${row.id} still unresolvable after freeing its unique fields:`, err2);
      }
    }
  }
  const extra = [repaired ? `${repaired} after clearing a stale row's unique fields` : "", failed ? `${failed} FAILED` : ""]
    .filter(Boolean)
    .join(", ");
  console.log(
    `History DB: copied ${inserted}/${missing.length} missing card rows (FK for PriceHistory)${extra ? ` — ${extra}` : ""}.`
  );
  // Re-read rather than assuming: the caller uses this to decide which rows are
  // safe to write, and a wrong assumption here costs the entire day's snapshot.
  const present = await dbHistory.card.findMany({ where: { id: { in: cardIds } }, select: { id: true } });
  return new Set(present.map((c) => c.id));
}

// Prisma's unique-constraint violation. Checked by code rather than by message so
// a Prisma version bump can't silently turn the repair path above back into a
// hard failure.
function isUniqueConflict(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === "P2002";
}
