import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { investedCents, unitCostCents, costAfterQuantityChange } from "../src/lib/collection-cost";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const readCode = (p: string) =>
  read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// Reported 2026-09-10 through the /portfolio feedback form:
//
//   "Added $770 paid to Akali ON - pulled one, paid for the other… Same issue
//    with Arise where I paid 20 each for two and 25 for the third"
//
// A CollectionCard is unique per (user, card, condition, foil), so every copy of
// one card in one condition shared ONE cost figure, and that figure could only
// mean "per copy". $770 against two copies was therefore read as $770 EACH and
// the portfolio reported $1,540 invested; three Arise bought at 20/20/25 had no
// single per-copy number to type at all. Both produced a profit-and-loss figure
// the owner could see was wrong.
//
// A row now says what its number MEANS. The total is the average cost basis,
// which is what an unrealised P&L is computed from.
// ─────────────────────────────────────────────────────────────────────────────

const row = (quantity: number, costBasisCents: number | null, costBasisIsTotal = false) =>
  ({ quantity, costBasisCents, costBasisIsTotal });

test("the reported cases produce the right invested figure", () => {
  // Akali: two copies, $770 paid for the pair (the other was pulled).
  assert.equal(investedCents(row(2, 77_000, true)), 77_000);
  // …which is exactly what the old per-unit-only reading got wrong.
  assert.equal(investedCents(row(2, 77_000, false)), 154_000);
  // Arise: three copies, 20 + 20 + 25 = 65.
  assert.equal(investedCents(row(3, 6_500, true)), 6_500);
});

test("per-copy stays per-copy — no existing row changes meaning", () => {
  // Every row that predates the flag defaults to false and must keep behaving
  // exactly as it did, or every user's recorded P&L silently moves.
  assert.equal(investedCents(row(4, 250)), 1_000);
  assert.equal(investedCents({ quantity: 4, costBasisCents: 250 }), 1_000);
  assert.equal(investedCents({ quantity: 4, costBasisCents: 250, costBasisIsTotal: null }), 1_000);
});

test("no recorded cost stays null — never zero", () => {
  // A missing cost is not a cost of zero. Treating it as one would report a
  // 100% profit on every holding the owner never priced.
  assert.equal(investedCents(row(3, null)), null);
  assert.equal(investedCents(row(3, null, true)), null);
  assert.equal(unitCostCents(row(3, null, true)), null);
  // Zero, by contrast, is a real answer — a card that was pulled, not bought.
  assert.equal(investedCents(row(3, 0, true)), 0);
});

test("unitCostCents averages a total across the row", () => {
  assert.equal(unitCostCents(row(2, 77_000, true)), 38_500);
  // 65 across three copies is 21.67 — the third cent belongs to no copy.
  assert.equal(unitCostCents(row(3, 6_500, true)), 2_167);
  // Per-copy rows report their own figure untouched, never a re-derived one.
  assert.equal(unitCostCents(row(3, 2_000)), 2_000);
  // A zero quantity must not divide by zero.
  assert.equal(unitCostCents(row(0, 6_500, true)), null);
});

test("changing the quantity rescales a total but never a per-copy price", () => {
  // One copy still cost what it cost.
  assert.equal(costAfterQuantityChange(row(2, 2_000), 5), 2_000);
  // A total is an outlay for a specific count — hold it fixed while copies are
  // added and the portfolio claims the same money bought twice the cards.
  assert.equal(costAfterQuantityChange(row(2, 4_000, true), 4), 8_000);
  assert.equal(costAfterQuantityChange(row(4, 8_000, true), 2), 4_000);
  // Nothing recorded stays nothing recorded.
  assert.equal(costAfterQuantityChange(row(2, null, true), 4), null);
});

test("nothing multiplies cost by quantity outside collection-cost.ts", () => {
  // The multiply is the step that goes wrong, and it was written out by hand in
  // three places before this module existed. Two copies of one rule is how the
  // promo-set regex drifted (see tests/tcgplayer.test.ts) — one definition,
  // imported everywhere.
  for (const file of ["src/lib/premium.ts", "src/app/api/collection/route.ts", "src/app/api/collection/[id]/route.ts"]) {
    const src = readCode(file);
    assert.ok(
      !/costBasisCents[^\n]*\*\s*\w*[Qq]uantity|[Qq]uantity\s*\*\s*[^\n]*costBasisCents/.test(src),
      `${file} must call investedCents(), not multiply costBasisCents by quantity itself`,
    );
  }
});

test("the portfolio sums what was PAID, not a re-derived per-unit product", () => {
  const src = readCode("src/lib/premium.ts");
  assert.match(src, /import \{ investedCents, unitCostCents \} from "\.\/collection-cost"/);
  // The aggregate reduces over each holding's own invested figure.
  assert.match(
    src,
    /costed\.reduce\(\(s, h\) => s \+ \(h\.investedCents \?\? 0\), 0\)/,
    "the P&L total must sum holdings' investedCents",
  );
  // And "has a cost recorded" is asked of the same field the sum uses, so a row
  // can never be counted in one and not the other.
  assert.match(src, /holdings\.some\(\(h\) => h\.investedCents != null\)/);
});

test("adding copies to a row that records a total ADDS the money", () => {
  // `costBasisCents: <new value>` in the upsert's update branch would REPLACE
  // the row's whole outlay — buying a third copy for $25 would erase the $40
  // paid for the first two.
  const src = readCode("src/app/api/collection/route.ts");
  assert.match(src, /investedCents/, "the POST route must read the existing outlay before adding to it");
  assert.match(
    src,
    /costBasisCents: \(priorPaid \?\? 0\) \+ d\.costBasisCents!/,
    "a total-mode add must sum with what was already paid, not overwrite it",
  );
  // The extra read is on the rare path only — an ordinary "add to my cards"
  // click must still be one query.
  assert.match(src, /const wantsTotal = d\.costBasisIsTotal === true && d\.costBasisCents != null/);
  assert.match(src, /const existing = wantsTotal\s*\n?\s*\?/);
});

test("merging two rows merges what was paid for them", () => {
  // The surviving row otherwise keeps its own cost while absorbing the other's
  // copies, which reads as "these extra cards were free".
  const src = readCode("src/app/api/collection/[id]/route.ts");
  assert.match(src, /const clashPaid = investedCents\(clash\)/);
  assert.match(src, /costBasisCents: clashPaid \+ itemPaid, costBasisIsTotal: true/);
  // With one side unknown there is no honest sum, so nothing is invented.
  assert.match(src, /clashPaid != null && itemPaid != null/);
});

test("both write routes accept the flag, and the schema defaults it to false", () => {
  for (const f of ["src/app/api/collection/route.ts", "src/app/api/collection/[id]/route.ts"]) {
    assert.match(readCode(f), /costBasisIsTotal: z\.boolean\(\)\.optional\(\)/, `${f} must accept costBasisIsTotal`);
  }
  assert.match(
    read("prisma/schema.prisma"),
    /costBasisIsTotal Boolean @default\(false\)/,
    "additive with a default, so every existing row keeps its per-unit meaning",
  );
});

test("the public share view still exposes no cost figure at all", () => {
  // The each/total work touches the same rows a shared collection reads. That
  // view selects fields explicitly for exactly this reason — it must not have
  // picked up either cost column along the way.
  const src = readCode("src/lib/share.ts");
  const at = src.indexOf("collectionCard.findMany");
  assert.ok(at >= 0);
  const body = src.slice(at, src.indexOf("});", at));
  assert.ok(!/costBasis/.test(body), "a shared collection must never carry what the owner paid");
});
