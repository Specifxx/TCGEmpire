/**
 * WHERE IS THE 2 GB/DAY GOING? Read-only egress forensics on the operational
 * database.
 *
 * WHY THIS EXISTS. Nine Neon projects have now been burned through in sequence,
 * each dying 2–3 days after it was cut over to:
 *
 *   DATABASE_URL   → 4 GB in 2 days   (rotated 2026-08-14)
 *   DATABASE_URL_2 → 4.8 GB in 3 days (rotated 2026-08-17)
 *   RM6            → 5 GB in 3 days   (rotated 2026-08-20)
 *   RM7            → 5 GB in 2 days   (rotated 2026-08-22, took the site down)
 *
 * The 2026-08-14 sweep pinned ONE cause — the segment-TTL inversion in
 * EbayCardPanel, which regenerated /card/[id] 288× a day (see the egress rules
 * at the top of src/lib/db.ts and tests/segment-ttl-inversion.test.ts). Fixing
 * it did not change the rate: RM6 and RM7 died on the same clock afterwards. So
 * the inversion was A cause, not THE cause, and the remaining burn has never
 * actually been measured — only hypothesised.
 *
 * This script measures it. It writes nothing and reads only statistics views.
 *
 * ── WHAT THE NUMBERS MEAN, AND WHERE THEY LIE ───────────────────────────────
 * Postgres does not expose "bytes sent to clients", which is the thing Neon
 * bills. Three views get progressively closer to it:
 *
 *   pg_stat_database.tup_returned  — rows examined by scans. A seq scan that
 *       feeds a count(*) inflates this hugely while sending 8 bytes. UPPER
 *       BOUND on work, NOT egress.
 *   pg_stat_user_tables.seq_tup_read / idx_tup_fetch — the same, per table.
 *       Its value is ATTRIBUTION: it says which table is being churned, which
 *       is what you need to find the query.
 *   pg_stat_statements.rows — rows RETURNED BY THE STATEMENT, per query shape.
 *       This is the honest proxy: rows × the table's average row width ≈ the
 *       bytes that crossed the wire. It needs the extension; Neon preloads it,
 *       but the CREATE EXTENSION still has to have happened.
 *
 * Row width is taken from pg_relation_size/n_live_tup (heap only — no indexes,
 * no TOAST). Wire format is not disk format, so treat every byte figure here as
 * an order of magnitude, not an invoice. The RANKING is what to act on.
 *
 * ── READING THE OUTPUT ──────────────────────────────────────────────────────
 * Rates are normalised to per-day using the stats_reset timestamp, so a short
 * window still extrapolates. A window under ~1 hour is labelled as unreliable —
 * one import run inside a 20-minute window looks like a catastrophe when
 * annualised.
 *
 * ── TWO MODES ───────────────────────────────────────────────────────────────
 * CUMULATIVE (default) — everything the counters have accumulated. Honest, but
 * it includes whatever one-off work happened in the window: the first run of
 * this script on RM8 was dominated by that morning's pg_restore (a COPY of
 * 157,908 rows) and a full price import, neither of which is steady-state
 * traffic. Good for finding pathological SHAPES, useless as a rate.
 *
 * DELTA (--sample=N) — snapshot, wait N minutes, snapshot again, report only
 * what moved. This is the one that answers "how fast is the site burning the
 * allowance RIGHT NOW", and it needs no stats_reset, which Neon leaves NULL.
 * Run it with N large enough to span normal traffic (10+ minutes); a window
 * that lands on a cron tick will attribute that cron's whole cost to the rate.
 *
 * ── DO NOT SAMPLE WHILE A DEPLOY IS IN FLIGHT ───────────────────────────────
 * This is the trap that has already produced one wrong answer, so it is worth
 * being blunt about. A Vercel build runs generateStaticParams and PRERENDERS
 * ~770 pages — 200 of them card pages — against this same database. Those
 * renders are indistinguishable from traffic in here, and they do NOT appear in
 * Vercel's function-invocation metrics, so nothing on the Vercel side
 * contradicts the inflated number afterwards.
 *
 * On 2026-08-22 a --sample=15 opened two minutes after a push to main. It read
 * 820 calls of the card page's set-median query and that extrapolated to ~79,000
 * renders a day; Vercel Observability for the same 24 hours showed 1.8K function
 * invocations and ~3.5K ISR writes for the route. The sample had measured a
 * build.
 *
 * So: check that no deploy is running, and that none is triggered during the
 * window, before believing a delta. The cron schedule matters too — see
 * .github/workflows for refresh-prices (07:00, 19:00 UTC) and the rest.
 *
 * ── 2026-09-11: THE ANSWER, AND WHY THIS SCRIPT COULD NOT SEE IT ────────────
 * The 2026-08-22/23 delta samples put the app's steady-state traffic at
 * ~0.12 GB/day (recorded in maintenance.yml's RH8 rotation note). Against an
 * observed ~2 GB/day, that leaves ~1.9 GB/day unexplained — and it was exactly
 * the traffic the rule above says to exclude. main was receiving 10–30 commits
 * a day; each one was a Vercel production build that prerenders ~770
 * database-backed pages against BOTH projects and, per Next.js's own docs,
 * clears the Full Route Cache — so every ISR page then re-rendered from the
 * database on its next hit. "Do not sample while a deploy is in flight" was
 * sound advice for measuring the app and a blindfold for measuring the burn.
 * The fix (vercel.json ignoreCommand + .github/workflows/production-deploy.yml)
 * batches production builds to one a day; see DECISIONS.md for the account.
 *
 * Note for future readers of a delta: a build inside the window is no longer a
 * contamination to discard — at one build a day it IS a steady-state cost, and
 * a window that catches it is telling you what that build costs.
 *
 * ── WHICH DATABASE ──────────────────────────────────────────────────────────
 * `--db=history` audits the HISTORY project (PriceHistory/ClickEvent — the one
 * that has rotated even faster than the operational one, RH9 lasting a single
 * day). Until this flag existed the history side had NEVER been measured, only
 * hypothesised at; every rotation note said "measure next time". Default is
 * the operational project.
 *
 * Usage:
 *   npx tsx scripts/audit-egress.ts                           # cumulative, operational
 *   npx tsx scripts/audit-egress.ts --sample=10               # 10-minute delta (a real rate)
 *   npx tsx scripts/audit-egress.ts --db=history --sample=20  # the history project
 *
 * Run in CI via .github/workflows/egress-audit.yml (weekly, both projects, plus
 * a "Run workflow" button) or maintenance.yml (task: audit-egress, operational).
 */
import { Prisma } from "@prisma/client";
import { prisma, OPERATIONAL_URL_SOURCE } from "../src/lib/db";
import { dbHistory, HISTORY_URL_SOURCE, historyIsSplit } from "../src/lib/db-history";

const MONTHLY_ALLOWANCE_GB = 5;

// --db=history switches every read below to the history project's client. The
// two clients are the same extended PrismaClient shape (src/lib/db.ts and
// db-history.ts build them identically), so one binding serves both.
const AUDIT_HISTORY = process.argv.some((a) => a === "--db=history");
const db = (AUDIT_HISTORY ? dbHistory : prisma) as typeof prisma;
const DB_LABEL = AUDIT_HISTORY
  ? `history (${HISTORY_URL_SOURCE})${historyIsSplit ? "" : " — NOT split: this is the operational database"}`
  : `operational (${OPERATIONAL_URL_SOURCE})`;

// --sample=N runs the delta mode described in the header. 0 = cumulative.
const SAMPLE_MINUTES = (() => {
  const arg = process.argv.find((a) => a.startsWith("--sample"));
  if (!arg) return 0;
  const n = Number(arg.split("=")[1] ?? "10");
  return Number.isFinite(n) && n > 0 ? n : 10;
})();

// Full statement text matters: the shape is what names the calling code, and
// truncating at a column width hides the WHERE clause that identifies it.
const QUERY_CHARS = 240;

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
function mb(bytes: number): string {
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
function num(n: number | bigint): string {
  return Number(n).toLocaleString("en-US");
}
function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

// Neon auto-suspends when idle; the first connection after a cold start can
// exceed Prisma's connect timeout. Same knock-politely loop as db-audit.ts.
async function wakeDb(tries = 6, delayMs = 10_000): Promise<void> {
  for (let i = 1; i <= tries; i++) {
    try {
      await db.$queryRaw`SELECT 1`;
      return;
    } catch (e) {
      if (i === tries) throw e;
      console.log(`  …database cold (attempt ${i}/${tries}), retrying in ${delayMs / 1000}s`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

type DbStat = {
  datname: string;
  xact_commit: bigint;
  tup_returned: bigint;
  tup_fetched: bigint;
  blks_read: bigint;
  blks_hit: bigint;
  stats_reset: Date | null;
};

type TableStat = {
  relname: string;
  n_live_tup: bigint;
  seq_scan: bigint;
  seq_tup_read: bigint;
  idx_scan: bigint | null;
  idx_tup_fetch: bigint | null;
  heap_bytes: bigint;
  total_bytes: bigint;
};

// Counters only — no statement text. Keyed by pg_stat_statements' own queryid
// (stable for a shape across snapshots, unlike a text prefix), and summed over
// the (userid, dbid, toplevel) rows that can share one queryid.
type StatementStat = {
  queryid: bigint;
  calls: bigint;
  rows: bigint;
  total_exec_time: number;
};

type Snapshot = {
  at: number;
  tables: Map<string, TableStat>;
  statements: Map<string, StatementStat>; // key: String(queryid)
  db: DbStat | undefined;
};

// Column count per table, for the projection-width correction in costOf().
async function readColumnCounts(): Promise<{ table_name: string; n: bigint }[]> {
  return db.$queryRaw`
    SELECT table_name, COUNT(*) AS n
    FROM information_schema.columns
    WHERE table_schema = 'public'
    GROUP BY table_name
  `;
}

async function readTables(): Promise<TableStat[]> {
  return db.$queryRaw<TableStat[]>`
    SELECT relname,
           n_live_tup,
           seq_scan,
           seq_tup_read,
           idx_scan,
           idx_tup_fetch,
           pg_relation_size(relid)       AS heap_bytes,
           pg_total_relation_size(relid) AS total_bytes
    FROM pg_stat_user_tables
  `;
}

// Neon's own monitoring hammers pg_stat_activity and neon.neon_perf_counters
// from inside the endpoint. Those are not the application's traffic and not
// something this repo can change, so they are excluded from the app rankings —
// but they are COUNTED and reported separately, because silently dropping rows
// from a burn-rate audit is how you end up chasing a number that never adds up.
function isPlatformNoise(q: string): boolean {
  return /pg_stat_activity|neon_perf_counters|pg_settings|pg_database|pg_stat_replication|pg_catalog\.|information_schema/i.test(q);
}

// COUNTERS FOR EVERY SHAPE, TEXT FOR NONE. This script now runs on a schedule,
// and an audit that pulled every shape's full statement text twice per run
// (pg_stat_statements can hold thousands; Prisma's IN(...) arities multiply
// them; each text runs to a couple of KB) would be a measurable slice of the
// very allowance it audits. But the cheap thing and the complete thing are the
// same thing: (queryid, calls, rows, time) is ~40 bytes a row, so BOTH snapshots
// can hold every shape, and a delta is computed over all of them. Only after
// the ranking is known does readStatementText() fetch text — for the handful
// of shapes that will actually be printed.
//
// Why not just `ORDER BY rows DESC LIMIT n` here: that cutoff would rank by the
// ALL-TIME counter, so a newly hot shape whose cumulative total still sits
// below n historical heavy-hitters would be missing from both snapshots and
// invisible to the delta — precisely the shape a burn audit exists to find.
async function readStatements(): Promise<StatementStat[]> {
  // SUM(bigint) is numeric in Postgres and would come back as a Decimal; the
  // casts keep the arithmetic below in BigInt/number as declared.
  return db.$queryRaw<StatementStat[]>`
    SELECT queryid,
           SUM(calls)::bigint            AS calls,
           SUM(rows)::bigint             AS rows,
           SUM(total_exec_time)::float8  AS total_exec_time
    FROM pg_stat_statements
    WHERE queryid IS NOT NULL
    GROUP BY queryid
  `;
}

// Statement text for the shapes that made the report, capped at 1,500 chars —
// enough to keep a wide Prisma projection list intact for costOf()'s column
// count (~25 chars per column) while bounding the read.
async function readStatementText(ids: bigint[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.$queryRaw<{ queryid: bigint; query: string }[]>`
    SELECT queryid, max(left(query, 1500)) AS query
    FROM pg_stat_statements
    WHERE queryid::text IN (${Prisma.join(ids.map(String))})
    GROUP BY queryid
  `;
  return new Map(rows.map((r) => [String(r.queryid), r.query]));
}

async function snapshot(): Promise<Snapshot> {
  const [dbRows, tables, statements] = await Promise.all([
    db.$queryRaw<DbStat[]>`
      SELECT datname, xact_commit, tup_returned, tup_fetched, blks_read, blks_hit, stats_reset
      FROM pg_stat_database WHERE datname = current_database()
    `,
    readTables(),
    readStatements().catch(() => [] as StatementStat[]),
  ]);
  return {
    at: Date.now(),
    db: dbRows[0],
    tables: new Map(tables.map((t) => [t.relname, t])),
    statements: new Map(statements.map((s) => [String(s.queryid), s])),
  };
}

async function main() {
  await wakeDb();

  console.log(`Database under audit: ${DB_LABEL}`);
  console.log(`Wall clock: ${new Date().toISOString()}`);

  // Creating the extension is what makes the NEXT run useful on a fresh project;
  // it is a no-op once it exists. Neon preloads the library, so this is the only
  // step needed.
  let pgssError = "";
  try {
    await db.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
  } catch (e) {
    pgssError = e instanceof Error ? e.message.split("\n")[0] : String(e);
  }

  const first = await snapshot();
  let windowDays: number;
  let tables: TableStat[];
  let statements: StatementStat[];
  let windowLabel: string;

  if (SAMPLE_MINUTES > 0) {
    // ── DELTA MODE ──────────────────────────────────────────────────────────
    section("Measurement window");
    console.log(`  DELTA mode: sampling for ${SAMPLE_MINUTES} minute(s) of live traffic.`);
    console.log("  Only counters that MOVE in this window are reported, so a restore or a");
    console.log("  one-off import that ran earlier cannot inflate the rate.");
    console.log("");
    console.log("  ⚠ A VERCEL BUILD INSIDE THIS WINDOW WILL INVALIDATE THE RESULT. Builds");
    console.log("    prerender ~770 pages (200 of them card pages) against this database, and");
    console.log("    they do NOT show up in Vercel's function-invocation metrics — so nothing");
    console.log("    downstream will contradict the inflated figure. Confirm no deploy is in");
    console.log("    flight before trusting anything below. See the header for the time this");
    console.log("    exact mistake was made and what it produced.");
    await new Promise((r) => setTimeout(r, SAMPLE_MINUTES * 60_000));
    const second = await snapshot();

    windowDays = (second.at - first.at) / 86_400_000;
    windowLabel = `${SAMPLE_MINUTES} min of live traffic`;

    // Table deltas. A table that vanished between samples is impossible here;
    // a NEW one starts from zero, which is what `?? 0n` gives it.
    tables = [...second.tables.values()].map((t) => {
      const a = first.tables.get(t.relname);
      return {
        ...t,
        seq_scan: t.seq_scan - (a?.seq_scan ?? 0n),
        seq_tup_read: t.seq_tup_read - (a?.seq_tup_read ?? 0n),
        idx_scan: (t.idx_scan ?? 0n) - (a?.idx_scan ?? 0n),
        idx_tup_fetch: (t.idx_tup_fetch ?? 0n) - (a?.idx_tup_fetch ?? 0n),
      };
    });
    statements = [...second.statements.values()].map((st) => {
      const a = first.statements.get(String(st.queryid));
      return {
        ...st,
        calls: st.calls - (a?.calls ?? 0n),
        rows: st.rows - (a?.rows ?? 0n),
        total_exec_time: st.total_exec_time - (a?.total_exec_time ?? 0),
      };
      // pg_stat_statements evicts entries under memory pressure; an evicted-then-
      // readmitted shape reads as a big positive delta. Over a short window that
      // is rare, and it can only OVERSTATE, never hide, a burn.
    });
    // Sizes come from the second sample (deltas are meaningless for a size).
    const sizes = new Map([...second.tables].map(([k, v]) => [k, v]));
    for (const t of tables) {
      const live = sizes.get(t.relname);
      if (live) {
        t.n_live_tup = live.n_live_tup;
        t.heap_bytes = live.heap_bytes;
        t.total_bytes = live.total_bytes;
      }
    }
  } else {
    // ── CUMULATIVE MODE ─────────────────────────────────────────────────────
    const resetAt = first.db?.stats_reset ?? null;
    const windowMs = resetAt ? Date.now() - resetAt.getTime() : 0;
    windowDays = windowMs / 86_400_000;
    windowLabel = resetAt ? `since ${resetAt.toISOString()}` : "since the endpoint started (unknown)";

    section("Measurement window");
    if (!resetAt) {
      // Neon resets statistics whenever the compute endpoint restarts, and leaves
      // stats_reset NULL until something does. A null means the window is "since
      // this endpoint started" and is unknowable from in here, so every rate below
      // would be a guess.
      console.log("  ✗ pg_stat_database.stats_reset is NULL — cannot normalise to a per-day rate.");
      console.log("    Row COUNTS below are valid; every per-day column will read '-'.");
      console.log("    For a real rate, re-run with --sample=10 (delta mode).");
    } else {
      console.log(`  stats_reset: ${resetAt.toISOString()}`);
      console.log(`  window:      ${windowDays.toFixed(2)} days (${(windowDays * 24).toFixed(1)}h)`);
      if (windowDays * 24 < 1) {
        console.log("  ⚠ WINDOW UNDER ONE HOUR — one import run inside it dominates the extrapolation.");
      }
    }
    console.log("  NOTE: cumulative counters include one-off work (a pg_restore, a full");
    console.log("  import). Use --sample=N for a steady-state rate.");
    tables = [...first.tables.values()];
    statements = [...first.statements.values()];
  }

  const perDay = (v: number | bigint) => (windowDays > 0 ? Number(v) / windowDays : NaN);
  const rate = (bytes: number) => (windowDays > 0 ? mb(perDay(bytes)) : "-");

  // ── Database-wide ─────────────────────────────────────────────────────────
  const dbStat = first.db;
  section("Database-wide (pg_stat_database, cumulative)");
  if (dbStat) {
    console.log(`  transactions committed : ${num(dbStat.xact_commit)}`);
    console.log(`  tuples returned by scans: ${num(dbStat.tup_returned)}`);
    console.log(`  tuples fetched          : ${num(dbStat.tup_fetched)}`);
    const hitRate = Number(dbStat.blks_hit) / Math.max(1, Number(dbStat.blks_hit) + Number(dbStat.blks_read));
    console.log(`  buffer cache hit rate   : ${(hitRate * 100).toFixed(1)}%`);
    console.log("  NOTE: tuples returned is scan WORK, not client egress — see the header.");
  }

  // ── Per-table attribution ─────────────────────────────────────────────────
  const widthOf = (t: TableStat) =>
    Number(t.n_live_tup) > 0 ? Number(t.heap_bytes) / Number(t.n_live_tup) : 0;

  tables.sort((a, b) => Number(b.seq_tup_read) - Number(a.seq_tup_read));

  section(`Per-table scan attribution (${windowLabel})`);
  console.log(
    "  " + "table".padEnd(22) + "rows".padStart(10) + "row B".padStart(8) +
      "seq scans".padStart(11) + "seq rows read".padStart(15) + "idx rows".padStart(14) + "≈read/day".padStart(14)
  );
  let churnTotal = 0;
  for (const t of tables) {
    const read = Number(t.seq_tup_read) + Number(t.idx_tup_fetch ?? 0);
    churnTotal += read * widthOf(t);
    if (read === 0) continue;
    console.log(
      "  " + t.relname.padEnd(22) + num(t.n_live_tup).padStart(10) + widthOf(t).toFixed(0).padStart(8) +
        num(t.seq_scan).padStart(11) + num(t.seq_tup_read).padStart(15) +
        num(t.idx_tup_fetch ?? 0).padStart(14) + rate(read * widthOf(t)).padStart(14)
    );
  }
  console.log(`\n  Total scan churn: ${gb(churnTotal)}` + (windowDays > 0 ? `  →  ${gb(perDay(churnTotal))}/day` : ""));
  console.log("  UPPER BOUND — count(*) and aggregates read rows they never send.");
  // A table whose seq_scan count times its row count equals seq_tup_read is being
  // FULLY scanned every time, which is the signal worth acting on: it means no
  // index is being used at all, and the cost grows with the table forever.
  const fullScanned = tables.filter(
    (t) => Number(t.seq_scan) > 50 && Number(t.n_live_tup) > 1000 &&
      Number(t.seq_tup_read) > Number(t.seq_scan) * Number(t.n_live_tup) * 0.8
  );
  if (fullScanned.length) {
    console.log("\n  ⚠ FULL-TABLE SCANNED (seq_tup_read ≈ seq_scan × row count — no index in play):");
    for (const t of fullScanned) {
      console.log(`      ${t.relname}: ${num(t.seq_scan)} scans × ~${num(t.n_live_tup)} rows`);
    }
  }

  // ── Per-statement: the honest proxy ───────────────────────────────────────
  const columnCounts = await readColumnCounts().catch(() => [] as { table_name: string; n: bigint }[]);
  const widths = new Map(tables.map((t) => [t.relname.toLowerCase(), widthOf(t)]));
  const colCounts = new Map(columnCounts.map((c) => [c.table_name.toLowerCase(), Number(c.n)]));

  // Cost a statement's rows in bytes. Two corrections matter, and getting either
  // wrong changes the ranking, not just the magnitude:
  //
  //   TABLE — the first known table name in the query text wins. Crude on
  //   purpose: a join across two wide tables is UNDER-counted, never over.
  //
  //   WIDTH — a table's average row width is pg_relation_size/n_live_tup, i.e.
  //   the width of a WHOLE row. Most of these statements project a handful of
  //   columns out of a wide table, so charging them the full width overstates
  //   them badly. Card averages 1,622 bytes a row, but the card page's set-median
  //   query selects two columns and gets ~40. Scaling by the fraction of columns
  //   selected is still an approximation (columns are not equal widths — one TEXT
  //   description dwarfs ten ints), but it is far closer than not scaling at all,
  //   and it stops a narrow projection from a fat table dominating the ranking
  //   for no reason.
  const costOf = (q: string, rows: bigint) => {
    const lower = q.toLowerCase();
    for (const [name, w] of widths) {
      if (!lower.includes(`\"${name}\"`) && !lower.includes(` ${name} `)) continue;
      const total = colCounts.get(name) ?? 0;
      // Count the projected columns: `"public"."Table"."col"` occurrences, which
      // is how Prisma writes every select. A raw `SELECT *`, an aggregate, or a
      // hand-written query has none of those and is charged the full width.
      const projected = new Set([...q.matchAll(/\.\"(\w+)\"(?=\s*(?:,|FROM))/gi)].map((m) => m[1])).size;
      const fraction = total > 0 && projected > 0 ? Math.min(1, projected / total) : 1;
      return Number(rows) * w * fraction;
    }
    return 0;
  };

  // Rank EVERY active shape by rows over the window, then fetch text for the
  // top slice only. 60 rather than 20 because platform noise is recognised by
  // its text and can occupy top slots; what is left after filtering is what
  // gets printed (up to 20).
  const TEXT_FOR = 60;
  const active = statements.filter((st) => Number(st.calls) > 0).sort((a, b) => Number(b.rows) - Number(a.rows));
  const top = active.slice(0, TEXT_FOR);
  const texts = await readStatementText(top.map((st) => st.queryid)).catch(() => new Map<string, string>());
  const ranked = top.map((st) => ({
    ...st,
    query:
      texts.get(String(st.queryid)) ??
      "(statement text unavailable — evicted from pg_stat_statements between the snapshot and this lookup)",
  }));
  const app = ranked.filter((st) => !isPlatformNoise(st.query));
  const noise = ranked.filter((st) => isPlatformNoise(st.query));

  section(`Application statements by rows returned (${windowLabel})`);
  if (!app.length) {
    console.log(`  ✗ pg_stat_statements unavailable${pgssError ? `: ${pgssError}` : " (no application rows in this window)"}`);
    console.log("    Without it this can say WHICH TABLE is churning but not WHICH QUERY.");
    console.log("    The CREATE EXTENSION above is what makes the next run useful; on a");
    console.log("    fresh project it needs a traffic window before the view fills.");
  } else {
    console.log(`  (${num(active.length)} shapes moved in this window; text fetched for the top ${Math.min(TEXT_FOR, active.length)}.)`);
    let egressTotal = 0;
    for (const st of app.slice(0, 20)) {
      const q = st.query.replace(/\s+/g, " ").trim();
      const bytes = costOf(q, st.rows);
      egressTotal += bytes;
      const perCall = Number(st.rows) / Number(st.calls);
      console.log(
        `\n  calls ${num(st.calls)} · rows ${num(st.rows)} · ${perCall.toFixed(1)}/call · ≈${rate(bytes)}/day`
      );
      console.log(`    ${q.slice(0, QUERY_CHARS)}`);
    }

    section("Estimated client egress");
    // THE WINDOW TOTAL IS THE MEASUREMENT. Everything below it is arithmetic on
    // an assumption, so it is printed second and labelled as such.
    console.log(`  MEASURED — top 20 application statements over this window: ${gb(egressTotal)}`);
    console.log("  Top 20 only, and joins are attributed to ONE table — this is a FLOOR.");
    if (windowDays > 0) {
      const daily = perDay(egressTotal);
      const monthly = daily * 30;
      console.log("");
      console.log("  EXTRAPOLATED — valid ONLY if this window is representative of a whole day:");
      console.log(`    ${gb(daily)}/day · ${gb(monthly)}/month against a ${MONTHLY_ALLOWANCE_GB} GB allowance` +
        ` (${(monthly / (MONTHLY_ALLOWANCE_GB * 1024 ** 3)).toFixed(1)}× the limit)` +
        ` · a fresh project lasts ~${((MONTHLY_ALLOWANCE_GB * 1024 ** 3) / Math.max(1, daily)).toFixed(1)} days.`);
      console.log("");
      // A window holding a batch job is NOT representative, and this line has
      // already misled once. The price import runs twice a day at 07:00 and
      // 19:00 UTC; a 40-minute window spanning one of them measured 0.04 GB and
      // this extrapolation reported 1.31 GB/day — i.e. it billed a twice-daily
      // job as if it ran 36 times. The right arithmetic is:
      //   (window total − trough share of the window) = cost of ONE run
      //   then multiply by how many times a day it ACTUALLY runs.
      console.log("    ⚠ IF A CRON, IMPORT OR BUILD RAN INSIDE THIS WINDOW, THAT LINE IS WRONG.");
      console.log("      It bills a job that runs twice a day as if it ran all day. Instead:");
      console.log("      subtract a trough-window baseline to get the cost of ONE run, then");
      console.log("      multiply by its real daily frequency. Price imports: 07:00 + 19:00 UTC.");
    }

    if (noise.length) {
      const noiseRows = noise.reduce((n, st) => n + Number(st.rows), 0);
      const noiseCalls = noise.reduce((n, st) => n + Number(st.calls), 0);
      console.log(`\n  (Excluded as platform noise among the top ${TEXT_FOR}: ${noise.length} shapes, ${num(noiseCalls)} calls, ` +
        `${num(noiseRows)} rows — Neon's own monitoring of pg_stat_activity/neon_perf_counters. ` +
        `Not the application's traffic and not ours to change, but counted here rather than dropped silently.)`);
    }
  }

  // ── Size context ──────────────────────────────────────────────────────────
  section("Table sizes (what one full scan costs)");
  for (const t of [...tables].sort((a, b) => Number(b.total_bytes) - Number(a.total_bytes)).slice(0, 12)) {
    console.log(`  ${t.relname.padEnd(24)} ${mb(Number(t.heap_bytes)).padStart(10)} heap  ${mb(Number(t.total_bytes)).padStart(10)} with indexes`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
