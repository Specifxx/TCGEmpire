import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// TCGplayer's market price history (owner, 2026-11-19: OP Compare's two-line chart): one point per card per Sydney day
// in data/price-history/tcg-market, written by scripts/record-tcg-market.ts after the import, drawn as the dashed gold
// line on the card page's and the quick view's chart. Display only.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const scratch = mkdtempSync(join(tmpdir(), "rc-tcg-market-"));
process.env.PRICE_HISTORY_DIR = scratch;
test.after(() => rmSync(scratch, { recursive: true, force: true }));
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

test("market points read back per card, oldest first; a same-day write replaces the day; zero and junk are dropped", async () => {
  const s = await import("../src/lib/price-history-store");
  s.writeTcgMarketHistoryDay(day("2026-11-19"), [["a", 1000], ["b", 0]]);
  s.writeTcgMarketHistoryDay(day("2026-11-20"), [["a", 900]]);
  s.writeTcgMarketHistoryDay(day("2026-11-20"), [["a", 950]]);
  assert.deepEqual(s.tcgMarketHistory("a"), [
    { t: day("2026-11-19").getTime(), usdCents: 1000 },
    { t: day("2026-11-20").getTime(), usdCents: 950 },
  ]);
  assert.deepEqual(s.tcgMarketHistory("b"), []);
  assert.equal(s.writeTcgMarketHistoryDay(day("2026-11-21"), []), null, "an empty day keeps the day's file");
});

test("the import records it, the history routes send it, and both charts draw it as the reference line", () => {
  const wf = read(".github/workflows/refresh-prices.yml");
  const rec = wf.indexOf("scripts/record-tcg-market.ts");
  assert.ok(rec > 0 && rec < wf.indexOf("bash scripts/publish-price-history.sh"), "recorded before the day's history is published");
  const script = read("scripts/record-tcg-market.ts");
  assert.match(script, /OR: \[\{ derived: null \}, \{ derived: false \}\]/, "never a derived row");
  assert.match(script, /preferMarketRows/);
  assert.match(read("src/app/api/card/[id]/history/route.ts"), /market: recentWindow\(getTcgMarketHistory\(card\.id, country\)\)/, "the free window only");
  assert.match(read("src/app/api/card/[id]/history/full/route.ts"), /market: getTcgMarketHistory/);
  assert.match(read("src/components/LocalizedPriceHistory.tsx"), /reference=\{marketPoints\}/);
  assert.match(read("src/components/QuickView.tsx"), /reference=\{marketHistory\}/);
});
