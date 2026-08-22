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
 * Usage:
 *   npx tsx scripts/audit-egress.ts
 *
 * Run in CI via .github/workflows/maintenance.yml (task: audit-egress).
 */
import { prisma, OPERATIONAL_URL_SOURCE } from "../src/lib/db";

const MONTHLY_ALLOWANCE_GB = 5;

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

async function main() {
  await wakeDb();

  console.log(`Operational database: ${OPERATIONAL_URL_SOURCE}`);
  console.log(`Wall clock: ${new Date().toISOString()}`);

  // ── Window ────────────────────────────────────────────────────────────────
  const [db] = await prisma.$queryRaw<DbStat[]>`
    SELECT datname, xact_commit, tup_returned, tup_fetched, blks_read, blks_hit, stats_reset
    FROM pg_stat_database
    WHERE datname = current_database()
  `;

  const resetAt = db?.stats_reset ?? null;
  const windowMs = resetAt ? Date.now() - resetAt.getTime() : 0;
  const windowDays = windowMs / 86_400_000;
  const perDay = (v: number | bigint) => (windowDays > 0 ? Number(v) / windowDays : NaN);

  section("Measurement window");
  if (!resetAt) {
    // Neon resets statistics whenever the compute endpoint restarts, which for a
    // suspend-happy serverless project is often. A null here means the counters
    // have never been reset, so the window is "since this endpoint started" and
    // is unknowable from inside — every rate below would be a guess.
    console.log("  ✗ pg_stat_database.stats_reset is NULL — cannot normalise to a per-day rate.");
    console.log("    Row COUNTS below are still valid; ignore every per-day column.");
  } else {
    console.log(`  stats_reset: ${resetAt.toISOString()}`);
    console.log(`  window:      ${windowDays.toFixed(2)} days (${(windowMs / 3_600_000).toFixed(1)}h)`);
    if (windowMs < 3_600_000) {
      console.log("  ⚠ WINDOW UNDER ONE HOUR — a single import run inside it will dominate");
      console.log("    the extrapolation. Re-run later before believing the per-day figures.");
    }
  }

  // ── Database-wide ─────────────────────────────────────────────────────────
  section("Database-wide (pg_stat_database)");
  if (db) {
    console.log(`  transactions committed : ${num(db.xact_commit)}  (${num(Math.round(perDay(db.xact_commit)))}/day)`);
    console.log(`  tuples returned by scans: ${num(db.tup_returned)}  (${num(Math.round(perDay(db.tup_returned)))}/day)`);
    console.log(`  tuples fetched          : ${num(db.tup_fetched)}  (${num(Math.round(perDay(db.tup_fetched)))}/day)`);
    const hitRate = Number(db.blks_hit) / Math.max(1, Number(db.blks_hit) + Number(db.blks_read));
    console.log(`  buffer cache hit rate   : ${(hitRate * 100).toFixed(1)}%`);
    console.log("  NOTE: tuples returned is scan WORK, not client egress — see the header.");
  }

  // ── Per-table attribution ─────────────────────────────────────────────────
  const tables = await prisma.$queryRaw<TableStat[]>`
    SELECT relname,
           n_live_tup,
           seq_scan,
           seq_tup_read,
           idx_scan,
           idx_tup_fetch,
           pg_relation_size(relid)       AS heap_bytes,
           pg_total_relation_size(relid) AS total_bytes
    FROM pg_stat_user_tables
    ORDER BY seq_tup_read DESC
  `;

  const widthOf = (t: TableStat) =>
    Number(t.n_live_tup) > 0 ? Number(t.heap_bytes) / Number(t.n_live_tup) : 0;

  section("Per-table scan attribution (pg_stat_user_tables)");
  console.log(
    "  " +
      "table".padEnd(22) +
      "rows".padStart(10) +
      "row B".padStart(8) +
      "seq scans".padStart(11) +
      "seq rows read".padStart(15) +
      "idx rows".padStart(12) +
      "≈read/day".padStart(12)
  );
  let churnTotal = 0;
  for (const t of tables) {
    const read = Number(t.seq_tup_read) + Number(t.idx_tup_fetch ?? 0);
    const bytes = read * widthOf(t);
    churnTotal += bytes;
    if (read === 0 && Number(t.n_live_tup) === 0) continue;
    console.log(
      "  " +
        t.relname.padEnd(22) +
        num(t.n_live_tup).padStart(10) +
        widthOf(t).toFixed(0).padStart(8) +
        num(t.seq_scan).padStart(11) +
        num(t.seq_tup_read).padStart(15) +
        num(t.idx_tup_fetch ?? 0).padStart(12) +
        (windowDays > 0 ? mb(perDay(bytes)) : "-").padStart(12)
    );
  }
  console.log(`\n  Total scan churn over the window: ${gb(churnTotal)}` +
    (windowDays > 0 ? `  →  ${gb(perDay(churnTotal))}/day` : ""));
  console.log("  This is an UPPER BOUND (count(*) and aggregates read rows they never send).");

  // ── Per-statement: the honest proxy ───────────────────────────────────────
  section("Per-statement rows returned (pg_stat_statements)");
  let statements: StatementStat[] = [];
  let pgssError = "";
  try {
    await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
    statements = await prisma.$queryRaw<StatementStat[]>`
      SELECT query, calls, rows, total_exec_time
      FROM pg_stat_statements
      ORDER BY rows DESC
      LIMIT 25
    `;
  } catch (e) {
    pgssError = e instanceof Error ? e.message.split("\n")[0] : String(e);
  }

  if (!statements.length) {
    console.log(`  ✗ unavailable${pgssError ? `: ${pgssError}` : " (extension present but empty)"}`);
    console.log("    Without it, this script can say WHICH TABLE is churning but not WHICH QUERY.");
    console.log("    On Neon: the extension is preloaded; a fresh project still needs one");
    console.log("    `CREATE EXTENSION pg_stat_statements;` (this script attempts it) and then");
    console.log("    a traffic window before the view has anything in it. Re-run in an hour.");
  } else {
    // Attribute each statement to a table so rows can be costed. Crude on
    // purpose: the first known table name appearing in the query text wins.
    // A join across two wide tables is therefore UNDER-counted, never over.
    const widths = new Map(tables.map((t) => [t.relname.toLowerCase(), widthOf(t)]));
    console.log(
      "  " + "calls".padStart(9) + "rows".padStart(13) + "rows/call".padStart(11) + "≈bytes/day".padStart(12) + "  query"
    );
    let egressTotal = 0;
    for (const s of statements) {
      const q = s.query.replace(/\s+/g, " ").trim();
      let width = 0;
      for (const [name, w] of widths) {
        if (q.toLowerCase().includes(`"${name}"`) || q.toLowerCase().includes(` ${name} `)) {
          width = w;
          break;
        }
      }
      const bytes = Number(s.rows) * width;
      egressTotal += bytes;
      const perCall = Number(s.calls) > 0 ? Number(s.rows) / Number(s.calls) : 0;
      console.log(
        "  " +
          num(s.calls).padStart(9) +
          num(s.rows).padStart(13) +
          perCall.toFixed(1).padStart(11) +
          (windowDays > 0 && width ? mb(perDay(bytes)) : "-").padStart(12) +
          "  " +
          q.slice(0, 110)
      );
    }
    section("Estimated client egress");
    console.log(`  Top-25 statements over the window: ${gb(egressTotal)}` +
      (windowDays > 0 ? `  →  ${gb(perDay(egressTotal))}/day` : ""));
    if (windowDays > 0) {
      const monthly = perDay(egressTotal) * 30;
      console.log(`  Extrapolated monthly: ${gb(monthly)} against a ${MONTHLY_ALLOWANCE_GB} GB allowance` +
        ` (${(monthly / (MONTHLY_ALLOWANCE_GB * 1024 ** 3)).toFixed(1)}× the limit).`);
      const daysLeft = (MONTHLY_ALLOWANCE_GB * 1024 ** 3) / Math.max(1, perDay(egressTotal));
      console.log(`  At this rate a fresh project lasts ~${daysLeft.toFixed(1)} days.`);
    }
    console.log("  Only the top 25 shapes are costed, and joins are attributed to ONE table,");
    console.log("  so this UNDERSTATES the true figure. Treat it as a floor.");
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
