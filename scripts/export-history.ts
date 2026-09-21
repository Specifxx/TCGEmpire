/**
 * Export PriceHistory (GLOBAL series) from the history Neon project into flat
 * JSON files, published from the `data` orphan branch via jsDelivr
 * (cdn.jsdelivr.net/gh/<owner>/<repo>@<sha>/...). This is the ONLY place that
 * reads PriceHistory in bulk outside a workflow — see the egress rules at the
 * top of src/lib/db.ts, rule 4: whole-table reads belong in workflows, never
 * in request handlers. Every app-side reader goes through
 * src/lib/history-store.ts instead, which fetches these files from the CDN
 * and never opens a Postgres connection for history data.
 *
 * Two modes:
 *   --full   one-off backfill: reads every GLOBAL row ever recorded (~82k
 *            rows today), rebuilds every file from scratch. Run once via the
 *            maintenance.yml `export-history-full` task to seed the `data`
 *            branch, and again only if the branch is ever rebuilt from
 *            scratch (e.g. after a quarterly squash).
 *   (default) incremental: reads ONLY today's Sydney-day GLOBAL rows
 *            (~1,400 rows, one query, entity-unbounded but day-scoped — the
 *            snapshot write itself is idempotent per day, see
 *            price-import.ts's HISTORY_MIN_INTERVAL_DAYS gate, which this
 *            script does not touch), merges the new point into each card's
 *            existing series (read from --out, not from Postgres), and
 *            rewrites the small derived files (windows, records, meta, csv).
 *            Run every day by refresh-prices.yml AFTER the snapshot write.
 *
 * Never called from a request handler. Never imports next/*.
 */
import fs from "node:fs";
import path from "node:path";
import { dbHistory } from "../src/lib/db-history";
import { sydneyDay, GLOBAL_HISTORY_COUNTRY } from "../src/lib/price-history";

const args = process.argv.slice(2);
const FULL = args.includes("--full");
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? args[outIdx + 1] : "history-data";

const CARDS_DIR = path.join(OUT, "cards");
const WINDOW_35_DAYS = 35;
const WINDOW_120_DAYS = 120;
const MS_PER_DAY = 86_400_000;

type SeriesPoint = [number, number]; // [daysSinceEpochUTC, usdCents]

function dayIndex(d: Date): number {
  return Math.floor(d.getTime() / MS_PER_DAY);
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  fs.writeFileSync(file, JSON.stringify(data));
}

async function main() {
  ensureDir(CARDS_DIR);

  const today = sydneyDay();
  const todayIdx = dayIndex(today);

  // 1. Pull rows. --full pulls everything once; the default pulls only the
  //    new day (per-request-equivalent scoping — this IS the workflow the
  //    egress rules reserve whole-table reads for).
  const rows = await dbHistory.priceHistory.findMany({
    where: FULL
      ? { country: GLOBAL_HISTORY_COUNTRY }
      : { country: GLOBAL_HISTORY_COUNTRY, day: today },
    select: { cardId: true, day: true, lowestPriceCents: true },
    orderBy: { day: "asc" },
  });
  console.log(`export-history: read ${rows.length} row(s) (${FULL ? "full" : "incremental"}).`);

  // 2. Group by card, merge into existing per-card files.
  const byCard = new Map<string, SeriesPoint[]>();
  for (const r of rows) {
    const idx = dayIndex(r.day);
    const arr = byCard.get(r.cardId) ?? [];
    arr.push([idx, r.lowestPriceCents]);
    byCard.set(r.cardId, arr);
  }

  const allCardIds = new Set<string>();
  if (FULL) {
    for (const id of byCard.keys()) allCardIds.add(id);
  } else {
    // Incremental: also track every card that already has a file on disk, so
    // window/records files stay complete even for cards with no new point
    // today (e.g. a card the importer skipped — see price-import.ts's
    // "writable" check).
    if (fs.existsSync(CARDS_DIR)) {
      for (const f of fs.readdirSync(CARDS_DIR)) {
        if (f.endsWith(".json")) allCardIds.add(f.slice(0, -5));
      }
    }
    for (const id of byCard.keys()) allCardIds.add(id);
  }

  for (const cardId of allCardIds) {
    const file = path.join(CARDS_DIR, `${cardId}.json`);
    const existing = FULL ? { p: [] as SeriesPoint[] } : readJson<{ p: SeriesPoint[] }>(file, { p: [] });
    const newPoints = byCard.get(cardId) ?? [];
    // Replace any existing point for the same day (idempotent re-run), then
    // append, then sort — cheap at this scale (one point/day/card).
    const byDay = new Map<number, number>();
    for (const [d, c] of existing.p) byDay.set(d, c);
    for (const [d, c] of newPoints) byDay.set(d, c);
    const merged = Array.from(byDay.entries()).sort((a, b) => a[0] - b[0]) as SeriesPoint[];
    writeJson(file, { p: merged });
  }

  // 3. Derived files: windows, records, meta, csv. Built from the per-card
  //    files just written (in-memory for FULL, freshly merged for
  //    incremental) — never a second Postgres read.
  const seriesByCard = new Map<string, SeriesPoint[]>();
  for (const cardId of allCardIds) {
    const file = path.join(CARDS_DIR, `${cardId}.json`);
    seriesByCard.set(cardId, readJson<{ p: SeriesPoint[] }>(file, { p: [] }).p);
  }

  function buildWindow(days: number) {
    const cutoff = todayIdx - days;
    const dayList: number[] = [];
    for (let d = cutoff; d <= todayIdx; d++) dayList.push(d);
    const cards: Record<string, (number | null)[]> = {};
    for (const [cardId, series] of seriesByCard) {
      const byDay = new Map(series.filter(([d]) => d >= cutoff));
      cards[cardId] = dayList.map((d) => byDay.get(d) ?? null);
    }
    return { days: dayList, cards };
  }

  writeJson(path.join(OUT, "window-35.json"), buildWindow(WINDOW_35_DAYS));
  writeJson(path.join(OUT, "window-120.json"), buildWindow(WINDOW_120_DAYS));

  const records: Record<string, { hi: number; hiDay: number; lo: number; loDay: number; n: number; now: number | null }> = {};
  for (const [cardId, series] of seriesByCard) {
    if (series.length === 0) continue;
    let hi = -Infinity, hiDay = 0, lo = Infinity, loDay = 0;
    for (const [d, c] of series) {
      // First-reached semantics: a later point at the same value does not
      // overwrite the day the peak/trough was FIRST reached (matches
      // computeAllTimeRecords' existing behaviour — a records board where a
      // tie silently moves the "reached on" date is a worse bug than a slow
      // one, see DECISIONS.md's "the fifth burn" entry on market-records.ts).
      if (c > hi) { hi = c; hiDay = d; }
      if (c < lo) { lo = c; loDay = d; }
    }
    records[cardId] = { hi, hiDay, lo, loDay, n: series.length, now: series[series.length - 1][1] };
  }
  writeJson(path.join(OUT, "records.json"), { freshest: todayIdx, cards: records });

  // 4. Today's lowest USD price per card, for the /data page's CSV export
  //    (Workstream D) — cheap to produce here since we already have the
  //    freshest point per card in memory.
  const csvLines = ["cardId,day,usdCents"];
  for (const [cardId, series] of seriesByCard) {
    if (series.length === 0) continue;
    const [d, c] = series[series.length - 1];
    csvLines.push(`${cardId},${d},${c}`);
  }
  fs.writeFileSync(path.join(OUT, "prices.csv"), csvLines.join("\n") + "\n");

  writeJson(path.join(OUT, "meta.json"), {
    format: 1,
    updated: new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(today),
    freshest: todayIdx,
    cards: allCardIds.size,
  });

  console.log(`export-history: wrote ${allCardIds.size} card file(s) + windows/records/meta/csv to ${OUT}/.`);

  await dbHistory.$disconnect();
}

main().catch((e) => {
  console.error("export-history failed:", e);
  process.exit(1);
});
