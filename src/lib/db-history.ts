import { PrismaClient } from "@prisma/client";
import { HISTORY_VARS, OPERATIONAL_VARS, resolveUrl, resolveVar } from "./db-chains";

// A SECOND physical database for the PRIVATE history: ClickEvent, the
// outbound-click log the admin pages read.
//
// PUBLIC PRICE HISTORY IS NOT HERE ANY MORE (2026-10-03). PriceHistory and
// SealedPriceHistory moved to day files in this repository
// (lib/price-history-store.ts, data/price-history/): they are shown on public
// pages anyway, a file read costs no transfer, and as tables they burned this
// project's 5 GB monthly transfer allowance every four or five days. Their rows
// are still in the project, untouched and unread, and nothing writes them. Do
// not read them: the files are the source of truth, and daily since the move.
// Anything private (clicks, anything per-user) must never go to the files.
//
// The rest of this header is the history of why this database exists at all.
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
// current history variable — HISTORY_DATABASE_URL_2, see the chain below — is
// added to Vercel + GitHub secrets. The schema
// (prisma/schema.prisma) is unchanged and shared — run `prisma db push` against
// the new URL once to create the tables there too (the unused Card/RetailerPrice/
// etc. tables it also creates cost negligible storage empty; only PriceHistory /
// ClickEvent get real traffic).

// HISTORY_DATABASE_URL_2 is the CURRENT history project — cut over
// 2026-09-17, once HISTORY_DATABASE_URL (below) reached its own 5 GB monthly
// transfer allowance after five days live. HISTORY_DATABASE_URL_2 is a
// RECYCLED name — retired since the 2026-08-19 HISTORY_DATABASE_URL_3
// cutover. migrate-history-db-hdu-to-hdu2 (.github/workflows/maintenance.yml)
// moved history onto it — a full pg_dump/restore of HISTORY_DATABASE_URL,
// row-count verified (rows=423,999, distinctCards=1426, GLOBAL rows=82,175,
// every count matching exactly), TRUNCATE-then-restore over the real (if
// outdated) numbers HISTORY_DATABASE_URL_2 held from its own prior term
// (rows=45,067, distinctCards=1390 — not zeroes, confirming it really was a
// recycled project and not a freshly re-added empty one).
//
// HISTORY_DATABASE_URL's OWN STINT IN THIS SLOT RAN 2026-09-12..09-17 — its
// longest yet, but still a terminal exhaustion, not a stable resting point.
// It was cut over from RH10 — see git history for the long account of that
// cutover, which is what first carried the GLOBAL-history series (below)
// onto HISTORY_DATABASE_URL.
//
// (HISTORY_DATABASE_URL's second term replaced RH10's second term, which
// served from 2026-09-10; RH10's second term replaced RH9's second term,
// which served from 2026-09-09; RH9's second term replaced RH8's second
// term, which served from 2026-09-06; RH8's second term replaced RH6's
// second term, which served from 2026-09-04; RH6's second term replaced
// RH11, which served from 2026-08-30; RH11 replaced RH10's FIRST term, which
// served from 2026-08-28; RH10's first term replaced RH9's FIRST term, which
// served from 2026-08-25; RH9's first term replaced RH8's FIRST term, which
// served from 2026-08-23; RH8's first term replaced HISTORY_DATABASE_URL_4,
// which served from 2026-08-21; _4 replaced _3, which served from
// 2026-08-19; _3 replaced HISTORY_DATABASE_URL_2's own prior term, which
// served from 2026-08-16; that replaced HISTORY_DATABASE_URL's own prior
// term; that replaced RH7's first term on 2026-08-16; RH7's first term
// replaced RH6's very first term on 2026-08-04; that replaced RH5 on
// 2026-07-31.)
//
// THE CHAIN IS CURRENT-FIRST, NOT NEWEST-FIRST. Read the head as "in service
// today", never as a timeline — several rotations went BACKWARDS onto recycled
// names (HISTORY_DATABASE_URL_2 last served nearly a month ago, and
// RH6/RH7/RH8/RH9/RH10/HISTORY_DATABASE_URL have all now cycled through more
// than once) because Neon's caps are per project per month, so a long-retired
// project has a fully reset allowance.
//
// THE GLOBAL-HISTORY MIGRATION, AND WHY IT STILL MATTERS FOR
// HISTORY_DATABASE_URL_2 SPECIFICALLY: 2026-09-05 shipped a separate
// migration (scripts/backfill-global-history.ts, price-import.ts) collapsing
// every market's PriceHistory rows into one country="GLOBAL" row per card
// per day — historySource() in price-history.ts now ALWAYS reads
// country=GLOBAL, unconditionally. HISTORY_DATABASE_URL_2's own prior term
// (2026-08-04..08-09) predates that migration by nearly a month and never
// held a single GLOBAL row on its own; the pg_dump/restore FROM
// HISTORY_DATABASE_URL is what actually carries the GLOBAL series onto it
// here. Recycling it straight from its own old contents would have hit the
// exact same "site-wide empty chart" trap RH6 itself needed rescuing from
// during the RH7-exhaustion fallback — see the long note on HISTORY_VARS in
// src/lib/db-chains.ts for the full account.
//
// A recycled name carries a trap: the older vars are also migration SOURCES in
// .github/workflows/maintenance.yml, so a name that is both target and listed
// source makes a migration silently no-op while reporting every row count as
// matching. Verify any pg_dump-based step pins its SOURCE explicitly, never a
// fallback chain that could resolve back to the target itself.
//
// EIGHTEEN PROJECT-TERMS IN UNDER SIX WEEKS IS A READ-PATTERN PROBLEM, NOT
// A CAPACITY ONE — and this rotation is another data point, not a new one.
// RH10 lasting two days (not the usual three) makes that more urgent, not
// less: whatever query is driving the burn is getting worse, not holding
// steady. A recycled project still buys only a couple of days at the current
// burn rate if the read pattern hasn't actually improved, so treat the next
// exhaustion as a signal to find the query, not to rotate again.
// getEmptyCardIds() in lib/card-price-state.ts and getRisingCards() in
// lib/top-deals.ts — both named as prime suspects on prior rotations — were
// rewritten to stop grouping/scanning the whole PriceHistory table per
// request (see those functions' own comments). The egress guard below still
// logs any single history query returning ≥1 MB — grep the Vercel logs for
// "[egress-guard:history]" if the allowance still drains fast; that names the
// next offender, and measuring it (scripts/audit-egress.ts) beats an
// eighteenth project.
//
// HISTORY_DATABASE_URL is kept as the rollback fallback and every older var
// below it is a read-only fallback/migration source; treat them as dead,
// never the primary target.
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

if (HISTORY_URL_SOURCE !== "HISTORY_DATABASE_URL_4") {
  console.warn(
    `[db-history] history DB resolved to ${HISTORY_URL_SOURCE}, not HISTORY_DATABASE_URL_4 — the ` +
      `current history project is missing from this environment. HISTORY_DATABASE_URL_3 is the ` +
      `rollback (holds the same GLOBAL series via a row-count-verified pg_dump/restore); ` +
      `RH10/RH9/RH8/RH7/RH6/RH5/HISTORY_DATABASE_URL/_2 are spent, retired, or (RH5) permanently ` +
      `excluded — see the note on HISTORY_VARS in lib/db-chains.ts. Expect P1001 or writes ` +
      `landing in the wrong place.`
  );
}

// True when the history tables live in their OWN database (scripts/audit-egress.ts
// labels its report with it). It mattered most while PriceHistory had a Card
// foreign key here (the removed ensureHistoryCards() copied card rows when split).
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

// ensureHistoryCards() — which copied Card rows into this database so
// PriceHistory's foreign key held — was removed on 2026-10-03 with PriceHistory
// itself: the price history is day files in the repository now
// (lib/price-history-store.ts) and ClickEvent has no foreign key.
