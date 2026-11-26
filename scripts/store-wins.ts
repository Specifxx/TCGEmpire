// Records today's cheapest-store wins into data/store-wins/<YYYY-MM>.json (lib/store-wins.ts), from the public sealed
// snapshot export-public-data.ts has just written. Run by refresh-prices.yml right after the export, before the
// snapshot is published, so the month file rides the same commit to main. Never fails the step.
//
//   npx tsx scripts/store-wins.ts                     today (UTC), from data/public/sealed-listings.json
//   npx tsx scripts/store-wins.ts --backfill 2026-11  every day of that month, from the snapshot commits in git
//                                                     (one snapshot a UTC day, the first of the day, as the daily run)
//
// Reads files only, never Neon. Rows pass the sealed pages' own guards first (lib/store-wins-rows.ts).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { STORE_WINS_DIR, addDay, emptyMonth, monthOf, readStoreWins, type StoreWinsMonth } from "../src/lib/store-wins";
import { winsRows, type SnapshotSealedRow } from "../src/lib/store-wins-rows";

const LISTINGS = "data/public/sealed-listings.json";

function write(month: StoreWinsMonth) {
  fs.mkdirSync(STORE_WINS_DIR, { recursive: true });
  const file = path.join(STORE_WINS_DIR, `${month.month}.json`);
  fs.writeFileSync(file, JSON.stringify(month, null, 1) + "\n");
  const stores = Object.values(month.stores).filter((s) => Object.keys(s.wins).length > 0).length;
  console.log(`[store-wins] ${file}: ${month.days.length} day(s), ${stores} store(s) with a win`);
}

function today() {
  const day = new Date().toISOString().slice(0, 10);
  const rows = winsRows(JSON.parse(fs.readFileSync(LISTINGS, "utf8")) as SnapshotSealedRow[]);
  const month = readStoreWins(monthOf(day)) ?? emptyMonth(monthOf(day));
  const next = addDay(month, day, rows);
  if (next === month) console.log(`[store-wins] ${day} already recorded`);
  else write(next);
}

function backfill(m: string) {
  if (!/^\d{4}-\d{2}$/.test(m)) throw new Error(`--backfill takes YYYY-MM, got ${m}`);
  const log = execFileSync("git", ["log", "--reverse", "--format=%H %cI", "--since", `${m}-01T00:00:00Z`, "origin/main", "--", LISTINGS], {
    encoding: "utf8",
  });
  const firstOfDay = new Map<string, string>();
  for (const line of log.trim().split("\n").filter(Boolean)) {
    const [sha, when] = line.split(" ");
    const day = new Date(when).toISOString().slice(0, 10);
    if (monthOf(day) === m && !firstOfDay.has(day)) firstOfDay.set(day, sha);
  }
  let month = readStoreWins(m) ?? emptyMonth(m);
  for (const [day, sha] of firstOfDay) {
    const rows = winsRows(JSON.parse(execFileSync("git", ["show", `${sha}:${LISTINGS}`], { encoding: "utf8", maxBuffer: 1 << 28 })) as SnapshotSealedRow[]);
    month = addDay(month, day, rows);
  }
  write(month);
}

try {
  const i = process.argv.indexOf("--backfill");
  if (i >= 0) backfill(process.argv[i + 1]);
  else today();
} catch (e) {
  console.warn("[store-wins] skipped:", e instanceof Error ? e.message : e);
  if (process.argv.includes("--backfill")) process.exitCode = 1;
}
