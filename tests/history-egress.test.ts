import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY-DATABASE EGRESS.
//
// The history project has run out of its transfer allowance more than once, and
// the cause was never a single expensive query — it was cheap queries re-run far
// more often than the data underneath them changed. PriceHistory gains one point
// per card per market per DAY (see HISTORY_MIN_INTERVAL_DAYS in
// price-history.ts); every whole-market Postgres READ of it used to be keyed on
// the DAY and tagged CONTENT_TAG, which a twice-daily price import purges. So
// the tag bust, not the TTL, set the real read rate — for the readers still
// listed below.
//
// src/lib/price-history.ts is DELIBERATELY EXCLUDED from this list, not an
// oversight: computePriceHistory/computePriceMovers/computeRecentlyUpdated
// no longer read dbHistory at all (see DECISIONS.md, "History off Neon") —
// they read src/lib/history-store.ts's CDN-published JSON, so their
// day-scoped cache keys are correct rather than a week/day mismatch. The
// file still mentions "dbHistory" in a couple of comments (explaining the
// writer it no longer reads), which is why a naive substring check would
// wrongly pull it back into scope here.
//
// These tests pin the two rules that keep the REMAINING Postgres readers
// down. Both are the kind of thing a later "simplification" undoes without
// noticing, because nothing breaks — the site keeps working and the bill
// goes up.
// ─────────────────────────────────────────────────────────────────────────────

const HISTORY_READERS = [
  "src/lib/screener.ts",
  "src/lib/market-records.ts",
  "src/lib/premium.ts",
];

test("every whole-market history read is week-scoped, not day-scoped", () => {
  const offenders: string[] = [];
  for (const file of HISTORY_READERS) {
    const src = read(file);
    // Only files that actually touch the history client are in scope.
    if (!/dbHistory\./.test(src)) continue;
    for (const m of src.matchAll(/\[\s*"(rc-[a-z-]+)"[^\]]*\]/g)) {
      const key = m[0];
      const name = m[1];
      // The daily key is legitimate on caches that read the OPERATIONAL database
      // only — see the Value Finder split below. Those are named explicitly.
      if (name === "rc-undervalued") continue;
      if (/sydneyDayKey\(\)/.test(key)) {
        offenders.push(`${file}: cache "${name}" is keyed on the day, but PriceHistory only changes weekly`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n  "));
});

test("history caches are not purged by an ordinary price import", () => {
  // CONTENT_TAG is busted by revalidateContent() on every import, twice a day.
  // A history read tagged with it re-scans six markets to rebuild an answer that
  // cannot have changed since the previous weekly snapshot.
  const offenders: string[] = [];
  for (const file of HISTORY_READERS) {
    const src = read(file);
    if (!/dbHistory\./.test(src)) continue;
    // Pair each cache key with the options object that follows it.
    for (const m of src.matchAll(/\[\s*"(rc-[a-z-]+)"[^\]]*\][\s\S]{0,160}?tags:\s*\[([A-Z_,\s]+)\]/g)) {
      const [, name, tags] = m;
      if (name === "rc-undervalued") continue; // operational-only, see below
      if (/CONTENT_TAG/.test(tags)) {
        offenders.push(`${file}: cache "${name}" is tagged CONTENT_TAG, so every price import re-reads history`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n  "));
});

test("the Value Finder gets daily results without a daily history read", () => {
  // The one deliberate exception, and the reason it is safe: the expensive
  // history half is cached separately at the weekly rate, and only the
  // operational-database half re-runs daily. Merging these back into a single
  // cache would either stale the Value Finder or restore the daily history read
  // — this asserts the split still exists.
  const src = read("src/lib/screener.ts");

  assert.match(src, /rc-undervalued-baseline/, "the history half must have its own cache entry");
  const baseline = /\[\s*"rc-undervalued-baseline"[\s\S]{0,200}?\)\(\)/.exec(src);
  assert.ok(baseline, "expected the baseline cache wrapper");
  assert.match(baseline![0], /sydneyWeekKey\(\)/, "the baseline is history-derived and must be week-scoped");
  assert.match(baseline![0], /HISTORY_TAG/, "the baseline must not be purged by a price import");

  const daily = /\[\s*"rc-undervalued"[\s\S]{0,200}?\)\(\)/.exec(src);
  assert.ok(daily, "expected the outer Value Finder cache");
  assert.match(daily![0], /sydneyDayKey\(\)/, "the Value Finder itself must refresh daily");

  // The only dbHistory read in the file must live inside the weekly baseline.
  const historyReads = [...src.matchAll(/dbHistory\.\w+\.\w+\(/g)];
  assert.equal(historyReads.length, 1, "the screener should touch the history database exactly once");
  const baselineFn = /async function computeBaselines[\s\S]*?\n}/.exec(src);
  assert.ok(baselineFn, "expected computeBaselines");
  assert.match(baselineFn![0], /dbHistory\./, "the history read must sit inside the weekly-cached baseline");
});
