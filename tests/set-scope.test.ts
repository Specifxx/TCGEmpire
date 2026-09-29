import test from "node:test";
import assert from "node:assert/strict";
import {
  cardInScope,
  isTokenNumber,
  listRows,
  missingCsv,
  missingText,
  otherSourceLabel,
  parseScope,
  parseShow,
  parseSort,
  preReleaseLine,
  raritiesIn,
  stockOf,
  summarise,
  summarisePreRelease,
  SET_FOOTER_COPY,
  type ChecklistCard,
} from "../src/lib/set-scope";

// ─────────────────────────────────────────────────────────────────────────────
// The set tracker's pure half (2026-09-29, DECISIONS.md, "Set tracker"): what
// counts toward a set, what counts as owned, what finishing it costs, and the
// pre-release rule. No database.
// ─────────────────────────────────────────────────────────────────────────────

let n = 0;
function card(o: Partial<ChecklistCard> & { collectorNumber: string }): ChecklistCard {
  n++;
  return {
    id: `c${n}`,
    slug: `slug-${n}`,
    name: `Card ${n}`,
    rarity: "Common",
    setCode: "OGN",
    variant: null,
    isPromo: false,
    isOvernumbered: false,
    minCents: null,
    stores: 0,
    otherSource: false,
    ...o,
  };
}

// ── Scope ────────────────────────────────────────────────────────────────────

test("base set: the numbered run only; every printing adds alt-art, overnumbered, Signature and Crystal Rose; promos are in neither", () => {
  const base = card({ collectorNumber: "001/298" });
  const alt = card({ collectorNumber: "112a/298", variant: "a", rarity: "Showcase" });
  const over = card({ collectorNumber: "299/298", rarity: "Showcase" });
  const sig = card({ collectorNumber: "223*/221", rarity: "Showcase" });
  const promo = card({ collectorNumber: "058/298", isPromo: true });
  const rose = card({ collectorNumber: "SP3", setCode: "VEN" });
  const token = card({ collectorNumber: "t03/000" });

  for (const c of [base]) {
    assert.equal(cardInScope(c, "base"), true);
    assert.equal(cardInScope(c, "all"), true);
  }
  for (const [label, c] of [["alt-art", alt], ["overnumbered", over], ["Signature", sig], ["Crystal Rose", rose]] as const) {
    assert.equal(cardInScope(c, "base"), false, `${label} is not in the base set`);
    assert.equal(cardInScope(c, "all"), true, `${label} is in every printing we track`);
  }
  assert.equal(cardInScope(promo, "base"), false);
  assert.equal(cardInScope(promo, "all"), false, "a promo shares its base card's number: in neither scope");
  assert.equal(cardInScope(token, "base"), false);
  assert.equal(cardInScope(token, "all"), false, "a token is not a card of the set");
});

test("overnumbered is read from the number too, because the stored flag is backfilled later", () => {
  // Local seed data has isOvernumbered false on 12 OGN cards numbered past 298.
  const c = card({ collectorNumber: "310/298", isOvernumbered: false });
  assert.equal(cardInScope(c, "base"), false);
  assert.equal(cardInScope(c, "all"), true);
  // …and the flag alone is enough when the number does not say so.
  assert.equal(cardInScope(card({ collectorNumber: "010/298", isOvernumbered: true }), "base"), false);
});

test("tokens are recognised by their t-number or a zero denominator", () => {
  assert.equal(isTokenNumber("t01/000"), true);
  assert.equal(isTokenNumber("T7/000"), true);
  assert.equal(isTokenNumber("001/000"), true);
  assert.equal(isTokenNumber("001/298"), false);
  assert.equal(isTokenNumber("SP1"), false);
});

test("scope, show and sort parse to their defaults for anything unknown", () => {
  assert.equal(parseScope("all"), "all");
  assert.equal(parseScope(["all"]), "all");
  assert.equal(parseScope("everything"), "base");
  assert.equal(parseScope(undefined), "base");
  assert.equal(parseShow("owned"), "owned");
  assert.equal(parseShow("x"), "missing");
  assert.equal(parseSort("dearest"), "dearest");
  assert.equal(parseSort("x"), "cheapest");
});

// ── Progress and cost ───────────────────────────────────────────────────────

test("owned is any copy of any finish or condition, one of each: progress counts distinct cards", () => {
  const a = card({ collectorNumber: "001/298", minCents: 100, stores: 2 });
  const b = card({ collectorNumber: "002/298", minCents: 250, stores: 1 });
  const c = card({ collectorNumber: "003/298", minCents: 50, stores: 4 });
  const s = summarise([a, b, c], { [a.id]: 3 }, "base");
  assert.equal(s.total, 3);
  assert.equal(s.owned, 1, "three copies of one card is one card");
  assert.equal(s.missing, 2);
  assert.equal(s.percent, 33);
  assert.equal(s.priced, 2);
  assert.equal(s.costCents, 300, "the cheapest listing for each missing card, before postage");
});

test("an eBay-only card is counted in neither the cost nor the not-in-stock total", () => {
  const stocked = card({ collectorNumber: "001/298", minCents: 400, stores: 1 });
  const ebayOnly = card({ collectorNumber: "002/298", minCents: null, otherSource: true });
  const nowhere = card({ collectorNumber: "003/298", minCents: null, otherSource: false });
  assert.equal(stockOf(stocked), "store");
  assert.equal(stockOf(ebayOnly), "other");
  assert.equal(stockOf(nowhere), "none");
  const s = summarise([stocked, ebayOnly, nowhere], {}, "base");
  assert.equal(s.priced, 1);
  assert.equal(s.costCents, 400);
  assert.equal(s.notInStock, 1, "only the card no source has");
  assert.equal(s.otherOnly, 1, "the eBay-only card is reported on its own line");
  assert.equal(s.priced + s.notInStock + s.otherOnly, s.missing, "every missing card is in exactly one bucket");
});

test("an owned card is never costed, and only in-scope cards count", () => {
  const owned = card({ collectorNumber: "001/298", minCents: 999, stores: 1 });
  const alt = card({ collectorNumber: "001a/298", variant: "a", minCents: 5000, stores: 1 });
  const s = summarise([owned, alt], { [owned.id]: 1 }, "base");
  assert.deepEqual([s.total, s.owned, s.missing, s.costCents], [1, 1, 0, 0]);
  const all = summarise([owned, alt], { [owned.id]: 1 }, "all");
  assert.deepEqual([all.total, all.owned, all.missing, all.costCents], [2, 1, 1, 5000]);
});

test("an empty scope has no percentage rather than NaN", () => {
  assert.equal(summarise([], {}, "base").percent, null);
});

// ── Pre-release: N revealed, never a fraction ───────────────────────────────

test("a set that has not released reports 'N revealed' with no denominator or percentage", () => {
  const cards = [
    card({ collectorNumber: "001/167", setCode: "RAD" }),
    card({ collectorNumber: "002/167", setCode: "RAD" }),
    card({ collectorNumber: "003/167", setCode: "RAD" }),
    card({ collectorNumber: "003/167", setCode: "RAD", isPromo: true }),
  ];
  const pre = summarisePreRelease(cards, { [cards[0].id]: 1 });
  assert.deepEqual(pre, { revealed: 3, owned: 1 }, "promos are not revealed cards, matching the set page's own count");
  const line = preReleaseLine(pre);
  assert.equal(line, "3 cards revealed so far");
  assert.doesNotMatch(line, /%|\bof\b|\d+\/\d+/, "no percentage and no denominator");
  assert.equal(preReleaseLine({ revealed: 1, owned: 0 }), "1 card revealed so far");
  // The summary type carries no total or percent at all.
  assert.deepEqual(Object.keys(pre).sort(), ["owned", "revealed"]);
});

// ── The list ────────────────────────────────────────────────────────────────

test("cheapest and dearest put store-priced cards first, then eBay-only, then not in stock, by number", () => {
  const p5 = card({ collectorNumber: "005/298", minCents: 500, stores: 1, name: "Five" });
  const p2 = card({ collectorNumber: "002/298", minCents: 200, stores: 1, name: "Two" });
  const eb = card({ collectorNumber: "001/298", otherSource: true, name: "Ebay" });
  const no = card({ collectorNumber: "003/298", name: "None" });
  const cards = [no, p5, eb, p2];
  assert.deepEqual(listRows(cards, {}, { scope: "base", show: "missing", sort: "cheapest" }).map((c) => c.name), ["Two", "Five", "Ebay", "None"]);
  assert.deepEqual(listRows(cards, {}, { scope: "base", show: "missing", sort: "dearest" }).map((c) => c.name), ["Five", "Two", "Ebay", "None"]);
  assert.deepEqual(listRows(cards, {}, { scope: "base", show: "missing", sort: "number" }).map((c) => c.name), ["Ebay", "Two", "None", "Five"]);
});

test("collector numbers sort numerically with alt-art letters after their base", () => {
  const rows = [
    card({ collectorNumber: "112a/298", variant: "a", name: "A" }),
    card({ collectorNumber: "20/298", name: "B" }),
    card({ collectorNumber: "112/298", name: "C" }),
    card({ collectorNumber: "9/298", name: "D" }),
  ];
  assert.deepEqual(listRows(rows, {}, { scope: "all", show: "all", sort: "number" }).map((c) => c.name), ["D", "B", "C", "A"]);
});

test("show and rarity filters", () => {
  const a = card({ collectorNumber: "001/298", rarity: "Rare" });
  const b = card({ collectorNumber: "002/298", rarity: "Common" });
  const owned = { [a.id]: 1 };
  const opts = { scope: "base", sort: "number" } as const;
  assert.deepEqual(listRows([a, b], owned, { ...opts, show: "missing" }).map((c) => c.id), [b.id]);
  assert.deepEqual(listRows([a, b], owned, { ...opts, show: "owned" }).map((c) => c.id), [a.id]);
  assert.equal(listRows([a, b], owned, { ...opts, show: "all" }).length, 2);
  assert.deepEqual(listRows([a, b], owned, { ...opts, show: "all", rarity: "Rare" }).map((c) => c.id), [a.id]);
  assert.deepEqual(raritiesIn([a, b], "base"), ["Common", "Rare"]);
});

// ── The missing list out of the page ────────────────────────────────────────

test("the copied list names each printing so Best Basket prices the right card", () => {
  const rows = [
    card({ collectorNumber: "001/298", name: "Jinx, Loose Cannon" }),
    card({ collectorNumber: "223*/221", name: "Vayne, Hunter", rarity: "Showcase" }),
    card({ collectorNumber: "112a/298", name: "Poppy", variant: "a", rarity: "Showcase" }),
  ];
  assert.equal(missingText(rows), "1 Jinx, Loose Cannon (OGN-001)\n1 Vayne, Hunter (OGN-223*)\n1 Poppy (OGN-112a)");
});

test("the CSV carries a header, escapes commas and quotes, leaves an unpriced cell empty", () => {
  const csv = missingCsv(
    [
      card({ collectorNumber: "001/298", name: "Jinx, Loose Cannon", minCents: 1250, stores: 3, rarity: "Rare" }),
      card({ collectorNumber: "002/298", name: 'Say "hi"', rarity: "Common" }),
    ],
    "USD",
  );
  const lines = csv.split("\n");
  assert.equal(lines[0], "set,number,name,rarity,cheapest_usd,stores");
  assert.equal(lines[1], 'OGN,001/298,"Jinx, Loose Cannon",Rare,12.50,3');
  assert.equal(lines[2], 'OGN,002/298,"Say ""hi""",Common,,0');
});

test("the labels: eBay only, or eBay or reference where the market carries reference prices", () => {
  assert.equal(otherSourceLabel("US"), "eBay only");
  assert.equal(otherSourceLabel("AU"), "eBay only");
  assert.equal(otherSourceLabel("UK"), "eBay or reference price only");
  assert.equal(otherSourceLabel("EU"), "eBay or reference price only");
});

test("the footer is the owner's wording, verbatim", () => {
  assert.equal(SET_FOOTER_COPY, "Cheapest listing per card, before postage. Best Basket prices delivery.");
});
