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
 * Usage:
 *   npx tsx scripts/audit-egress.ts              # cumulative
 *   npx tsx scripts/audit-egress.ts --sample=10  # 10-minute delta (a real rate)
 *
 * Run in CI via .github/workflows/maintenance.yml (task: audit-egress).
 */
import { prisma, OPERATIONAL_URL_SOURCE } from "../src/lib/db";

const MONTHLY_ALLOWANCE_GB = 5;

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
      await prisma.$queryRaw`SELECT 1`;
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

type StatementStat = {
  query: string;
  calls: bigint;
  rows: bigint;
  total_exec_time: number;
};

type Snapshot = {
  at: number;
  tables: Map<string, TableStat>;
  statements: Map<string, StatementStat>;
  db: DbStat | undefined;
};

// Column count per table, for the projection-width correction in costOf().
async function readColumnCounts(): Promise<{ table_name: string; n: bigint }[]> {
  return prisma.$queryRaw`
    SELECT table_name, COUNT(*) AS n
    FROM information_schema.columns
    WHERE table_schema = 'public'
    GROUP BY table_name
  `;
}

async function readTables(): Promise<TableStat[]> {
  return prisma.$queryRaw<TableStat[]>`
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

async function readStatements(): Promise<StatementStat[]> {
  return prisma.$queryRaw<StatementStat[]>`
    SELECT query, calls, rows, total_exec_time
    FROM pg_stat_statements
  `;
}

async function snapshot(): Promise<Snapshot> {
  const [dbRows, tables, statements] = await Promise.all([
    prisma.$queryRaw<DbStat[]>`
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
    statements: new Map(statements.map((s) => [s.query, s])),
  };
}

async function main() {
  await wakeDb();

  console.log(`Operational database: ${OPERATIONAL_URL_SOURCE}`);
  console.log(`Wall clock: ${new Date().toISOString()}`);

  // Creating the extension is what makes the NEXT run useful on a fresh project;
  // it is a no-op once it exists. Neon preloads the library, so this is the only
  // step needed.
  let pgssError = "";
  try {
    await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
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
      const a = first.statements.get(st.query);
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
  const db = first.db;
  section("Database-wide (pg_stat_database, cumulative)");
  if (db) {
    console.log(`  transactions committed : ${num(db.xact_commit)}`);
    console.log(`  tuples returned by scans: ${num(db.tup_returned)}`);
    console.log(`  tuples fetched          : ${num(db.tup_fetched)}`);
    const hitRate = Number(db.blks_hit) / Math.max(1, Number(db.blks_hit) + Number(db.blks_read));
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

  const app = statements.filter((st) => Number(st.calls) > 0 && !isPlatformNoise(st.query));
  const noise = statements.filter((st) => Number(st.calls) > 0 && isPlatformNoise(st.query));

  section(`Application statements by rows returned (${windowLabel})`);
  if (!app.length) {
    console.log(`  ✗ pg_stat_statements unavailable${pgssError ? `: ${pgssError}` : " (no application rows in this window)"}`);
    console.log("    Without it this can say WHICH TABLE is churning but not WHICH QUERY.");
    console.log("    The CREATE EXTENSION above is what makes the next run useful; on a");
    console.log("    fresh project it needs a traffic window before the view fills.");
  } else {
    app.sort((a, b) => Number(b.rows) - Number(a.rows));
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
    console.log(`  Top 20 application statements: ${gb(egressTotal)}` +
      (windowDays > 0 ? `  →  ${gb(perDay(egressTotal))}/day` : ""));
    if (windowDays > 0) {
      const daily = perDay(egressTotal);
      const monthly = daily * 30;
      console.log(`  Extrapolated monthly: ${gb(monthly)} against a ${MONTHLY_ALLOWANCE_GB} GB allowance` +
        ` (${(monthly / (MONTHLY_ALLOWANCE_GB * 1024 ** 3)).toFixed(1)}× the limit).`);
      console.log(`  At this rate a fresh project lasts ~${((MONTHLY_ALLOWANCE_GB * 1024 ** 3) / Math.max(1, daily)).toFixed(1)} days.`);
    }
    console.log("  Top 20 only, and joins are attributed to ONE table — this is a FLOOR.");

    if (noise.length) {
      const noiseRows = noise.reduce((n, st) => n + Number(st.rows), 0);
      const noiseCalls = noise.reduce((n, st) => n + Number(st.calls), 0);
      console.log(`\n  (Excluded as platform noise: ${noise.length} shapes, ${num(noiseCalls)} calls, ` +
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
  .finally(() => prisma.$disconnect());
