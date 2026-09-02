import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// 2026-09-02: sealed products (booster boxes, packs, bundles, …) had no price
// HISTORY at all — SealedListing is a live-only table, wiped and rewritten
// wholesale on every import (see that model's own schema comment), so there
// was nothing to chart, chain-link, or feed a "rising" signal from. This pins
// the new SealedPriceHistory model and its weekly writer, the foundation the
// Sealed Index and Rising Sealed (added in the same pass) both depend on.
//
// Deliberately unlike PriceHistory: SealedPriceHistory has NO Prisma relation
// to a persistent per-product row (SealedListing has none to point at) — it's
// keyed by groupKey as a bare string, matching SealedGroupFirstSeen's own
// established convention. That also means no ensureHistoryCards()-equivalent
// FK-stub-copying step is needed before writing.
// ─────────────────────────────────────────────────────────────────────────────

test("SealedPriceHistory exists in the schema, keyed by a bare groupKey (no relation), unique per group/market/day", () => {
  const schema = read("prisma/schema.prisma");
  const modelMatch = schema.match(/model SealedPriceHistory \{[\s\S]*?\n\}/);
  assert.ok(modelMatch, "expected a SealedPriceHistory model");
  const model = modelMatch![0];
  assert.match(model, /groupKey\s+String\s*$/m, "groupKey must be a bare String, not a relation scalar");
  assert.doesNotMatch(model, /@relation/, "must have no Prisma relation — SealedListing has no persistent row to FK against");
  assert.match(model, /country\s+String/);
  assert.match(model, /day\s+DateTime\s+@db\.Date/);
  assert.match(model, /lowestPriceCents\s+Int/);
  assert.match(model, /@@unique\(\[groupKey, country, day\]\)/, "at most one point per group per market per day");
});

test("sydneyDay and HISTORY_MIN_INTERVAL_DAYS have one canonical home (price-history.ts), not a duplicate definition per writer", () => {
  const home = codeOnly(read("src/lib/price-history.ts"));
  assert.match(home, /export function sydneyDay\(/);
  assert.match(home, /export const HISTORY_MIN_INTERVAL_DAYS = 7/);

  // price-import.ts must IMPORT these, not redefine them — a second definition
  // could silently diverge (two writers disagreeing about what "a week" means
  // would make the two tables' cadences drift apart from each other).
  const priceImport = codeOnly(read("src/lib/price-import.ts"));
  assert.match(priceImport, /import\s*\{\s*sydneyDay,\s*HISTORY_MIN_INTERVAL_DAYS\s*\}\s*from\s*"\.\/price-history"/);
  assert.doesNotMatch(priceImport, /function sydneyDay\(/, "must not redefine sydneyDay locally");
  assert.doesNotMatch(priceImport, /const HISTORY_MIN_INTERVAL_DAYS/, "must not redefine the constant locally");

  const sealedImport = codeOnly(read("src/lib/sealed-import.ts"));
  assert.match(sealedImport, /import\s*\{\s*sydneyDay,\s*HISTORY_MIN_INTERVAL_DAYS\s*\}\s*from\s*"\.\/price-history"/);
});

test("no import cycle: price-history.ts (the shared home) imports neither price-import.ts nor sealed-import.ts", () => {
  // price-import.ts already imports FROM sealed-import.ts (importSealed) — so
  // if sydneyDay/HISTORY_MIN_INTERVAL_DAYS had been defined in EITHER writer
  // instead of the neutral price-history.ts, importing them into the other
  // writer would have closed a real cycle.
  const home = codeOnly(read("src/lib/price-history.ts"));
  assert.doesNotMatch(home, /from\s*"\.\/price-import"/);
  assert.doesNotMatch(home, /from\s*"\.\/sealed-import"/);
});

test("writeSealedPriceHistory: weekly-gated, writes through dbHistory (not the operational client), includes pre-orders", () => {
  const code = codeOnly(read("src/lib/sealed-import.ts"));
  assert.match(code, /export async function writeSealedPriceHistory\(\): Promise<void>/);

  const fnStart = code.indexOf("export async function writeSealedPriceHistory");
  const fn = code.slice(fnStart, code.indexOf("\n}", fnStart) + 2);

  assert.match(fn, /const day = sydneyDay\(\)/);
  assert.match(fn, /dbHistory\.sealedPriceHistory\.findFirst\(/, "the gate must check ITS OWN table's newest day, not PriceHistory's");
  assert.match(fn, /daysSince < HISTORY_MIN_INTERVAL_DAYS/);
  assert.match(fn, /dbHistory\.sealedPriceHistory\.deleteMany\(\{ where: \{ day \} \}\)/, "same day-replace-on-rerun convention as PriceHistory");
  assert.match(fn, /dbHistory\.sealedPriceHistory\.createMany\(/);
  assert.doesNotMatch(fn, /\bprisma\.sealedPriceHistory\b/, "must write through the split history DB client, never the operational one");

  // Reads SealedListing directly (not getAllSealedGroups(), which does
  // display-only work this has no use for), with no country filter — a
  // single whole-table read across every market.
  assert.match(fn, /prisma\.sealedListing\.findMany\(\{\s*where:\s*\{\s*inStock:\s*true\s*\}/);
  assert.doesNotMatch(fn, /getAllSealedGroups|getSealedGroups\(/, "must not go through the display-grouping helper");

  // Pre-orders are NOT filtered out here (unlike getSealedGroups()) — the
  // function's own doc comment explains why; this pins that no isPreorderSetCode
  // filter crept into the read/write path.
  assert.doesNotMatch(fn, /isPreorderSetCode/, "pre-orders must be included in the history snapshot");

  // The price-sanity floor still applies (same guard getAllSealedGroups uses).
  assert.match(fn, /sealedFloorCents\(/);
});

test("the groupKey/country lowest-price map avoids a delimiter collision (groupKey itself can contain '|')", () => {
  // T1S groups are named e.g. "T1S|T1 Signature Edition|EN" — a
  // `${groupKey}|${country}` composite string key would be ambiguous to
  // split back apart for exactly those groups. Must be a nested Map instead.
  //
  // Scoped to writeSealedPriceHistory's OWN body, not the whole file:
  // getSealedFirstSeen() elsewhere in this file already builds a composite
  // `${r.groupKey}|${r.country}` key for a different purpose (a SealedGroupFirstSeen
  // lookup, never split back apart, so real country codes never containing "|"
  // keeps it unambiguous in practice) — pre-existing, unrelated to this function,
  // not this test's concern.
  const code = codeOnly(read("src/lib/sealed-import.ts"));
  const fnStart = code.indexOf("export async function writeSealedPriceHistory");
  const fn = code.slice(fnStart, code.indexOf("\n}", fnStart) + 2);
  assert.match(fn, /const lowest = new Map<string, Map<string, number>>\(\)/, "must be a nested map, not a delimited composite string key");
  assert.doesNotMatch(fn, /`\$\{r\.groupKey\}\|\$\{r\.country\}`/, "a composite string key here would collide with groupKeys that already contain '|'");
});

test("scripts/import-sealed.ts writes the sealed history snapshot LAST, after every listing source has run", () => {
  const code = codeOnly(read("scripts/import-sealed.ts"));
  assert.match(code, /import\s*\{[^}]*writeSealedPriceHistory[^}]*\}\s*from\s*"\.\.\/src\/lib\/sealed-import"/);
  const order = ["await importSealed()", "await refreshTcgplayerSealed()", "await writeSealedPriceHistory()"];
  let cursor = -1;
  for (const step of order) {
    const at = code.indexOf(step);
    assert.ok(at > cursor, `expected "${step}" to appear after the previous step`);
    cursor = at;
  }
});
