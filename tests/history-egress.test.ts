import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY-DATABASE EGRESS.
//
// The history project has run out of its transfer allowance more than once, and
// the cause was never a single expensive query — it was cheap queries re-run far
// more often than the data underneath them changed. PriceHistory gains one point
// per card per market per WEEK; every whole-market read of it was keyed on the
// DAY and tagged CONTENT_TAG, which a twice-daily price import purges. So the
// tag bust, not the TTL, set the real read rate.
//
// These tests pin the two rules that keep it down. Both are the kind of thing a
// later "simplification" undoes without noticing, because nothing breaks — the
// site keeps working and the bill goes up.
// ─────────────────────────────────────────────────────────────────────────────

// src/lib/screener.ts (the Value Finder's loader) was a reader here until the
// Value Finder left the product on 2026-09-25 and the file was deleted with it.
const HISTORY_READERS = [
  "src/lib/price-history.ts",
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

test("the Value Finder's day-keyed history exception left with the Value Finder", () => {
  // The one deliberate exception above ("rc-undervalued": a daily cache over an
  // operational read, with its history half cached weekly) lived in
  // src/lib/screener.ts. The Value Finder left the product on 2026-09-25
  // (/tools/value-finder 301s to /movers) and screener.ts went with it, so no
  // file may register those cache keys again without a new reason to.
  assert.ok(!existsSync(join(ROOT, "src/lib/screener.ts")), "screener.ts was deleted with the Value Finder");
  for (const file of HISTORY_READERS) {
    assert.doesNotMatch(read(file), /"rc-undervalued(-baseline)?"/, `${file} re-registers the retired Value Finder cache`);
  }
});
