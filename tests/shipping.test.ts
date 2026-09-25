import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PROBE_ADDRESSES, classifyRate, type ProbeScenarioResult } from "../src/lib/shipping-probe";
import { condenseStore, type ProbeStoreInput, type ShippingSnapshot } from "../src/lib/shipping-snapshot";
import {
  SHIPPING_REGIONS,
  SHIPPING_SNAPSHOT,
  basketStoresFor,
  freeThreshold,
  marketHasZonePricing,
  postageOptionsFrom,
  shippingFor,
  shippingNoteFor,
  shippingSummary,
} from "../src/lib/shipping";
import { optimizeBasket, type BasketCard } from "../src/lib/basket";
import { RETAILERS, RETAILER_LIST } from "../src/lib/retailers";
import { currencyOf, type Country } from "../src/lib/country";

// ─────────────────────────────────────────────────────────────────────────────
// Measured postage (2026-09-25). Malik, in Adelaide, ran Best Basket, was shown
// "+ $2.00 post" for a store, and was charged $20 at its checkout. The $2 was a
// hand-typed guess. These tests pin the model that replaced it: postage from
// each store's own checkout, letters only inside the order sizes they were seen
// on, thresholds only where measured, the HIGHEST region when the buyer's is
// unknown, and a guess never presented as a measurement.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

type Rates = [name: string, dollars: number][];
interface CartSpec {
  id: string;
  v: number; // subtotal, dollars
  n: number; // cards
  rates: Rates | "empty" | ((addr: string) => Rates | "empty");
}

// A synthetic probe run for one store, shaped exactly like the probe's output.
function probe(key: string, market: Country, carts: CartSpec[], currency = currencyOf(market)): ProbeStoreInput {
  const addresses = PROBE_ADDRESSES[market as keyof typeof PROBE_ADDRESSES];
  const scenarios: ProbeScenarioResult[] = carts.map((c) => {
    const byAddress: ProbeScenarioResult["byAddress"] = {};
    for (const a of addresses) {
      const spec = typeof c.rates === "function" ? c.rates(a.id) : c.rates;
      if (spec === "empty" || spec.length === 0) {
        byAddress[a.id] = { status: "empty", rates: [] };
        continue;
      }
      byAddress[a.id] = {
        status: "ok",
        rates: spec.map(([name, d]) => ({ name, cents: Math.round(d * 100), currency, ...classifyRate(name) })),
      };
    }
    return { id: c.id, kind: c.id.startsWith("S") ? "count" : "value", subtotalCents: Math.round(c.v * 100), items: c.n, cartCurrency: currency, byAddress };
  });
  return { key, market, currency, measuredAt: "2026-09-25T04:00:00.000Z", addresses, scenarios };
}

function snapshotOf(...stores: ProbeStoreInput[]): ShippingSnapshot {
  return {
    version: 1,
    note: "test",
    markets: { AU: { measuredAt: "2026-09-25", addresses: [] } },
    stores: Object.fromEntries(stores.map((s) => [s.key, condenseStore(s, {})])),
  };
}

// Obsession Gaming as measured to all eight capitals: one rate, "Standard"
// $20.00, from a $0.10 card to fifteen cards at $150.03, never free. retailers.ts
// guessed $2.00 and "free over $50".
const OBSESSION = probe("obsessiongaming", "AU", [
  { id: "S1", v: 0.1, n: 1, rates: [["Standard", 20]] },
  { id: "S10", v: 1, n: 10, rates: [["Standard", 20]] },
  { id: "V20", v: 20, n: 2, rates: [["Standard", 20]] },
  { id: "V50", v: 50.97, n: 2, rates: [["Standard", 20]] },
  { id: "V100", v: 100.21, n: 5, rates: [["Standard", 20]] },
  { id: "V150", v: 150.03, n: 15, rates: [["Standard", 20]] },
]);

// A store with a $2 untracked letter that it only offers for small orders
// (seen up to 3 cards and $20), and a $20 parcel otherwise — the shape of the
// "$2 shown, much more at checkout" complaint when the letter is quoted for an
// order it does not cover.
const LETTER_THEN_PARCEL = probe("cherry", "AU", [
  { id: "S1", v: 0.99, n: 1, rates: [["Singles Untracked", 2], ["Tracked Parcel", 20]] },
  { id: "V20", v: 20, n: 3, rates: [["Singles Untracked", 2], ["Tracked Parcel", 20]] },
  { id: "S10", v: 9.9, n: 10, rates: [["Tracked Parcel", 20]] },
  { id: "V50", v: 50, n: 4, rates: [["Tracked Parcel", 20]] },
  { id: "V150", v: 150, n: 6, rates: [["Tracked Parcel", 20]] },
]);

const cart = (dollars: number, items: number) => ({ subtotalCents: Math.round(dollars * 100), items });

test("Malik's case: a measured $20 store is never quoted at its $2 guess, in Adelaide or anywhere", () => {
  const snap = snapshotOf(OBSESSION);
  assert.equal(RETAILERS.obsessiongaming.shippingFlatCents, 200, "the fixture's premise: retailers.ts still guesses $2");
  for (const region of [...SHIPPING_REGIONS.AU.map((r) => r.key), null]) {
    const q = shippingFor("obsessiongaming", cart(30, 5), { region }, snap);
    assert.equal(q.cents, 2000, `region ${region}`);
    assert.equal(q.label, "Standard", "the store's own rate name");
    assert.equal(q.basis, "measured");
  }
  // The guessed "free over $50" is gone: a $60 order still pays $20.
  assert.equal(shippingFor("obsessiongaming", cart(60, 4), { region: "SA" }, snap).cents, 2000);
});

test("Malik's case in the basket: an Adelaide order that outgrows the $2 letter pays the $20 parcel", () => {
  const snap = snapshotOf(LETTER_THEN_PARCEL);
  const stores = basketStoresFor("AU", { region: "SA" }, snap);
  const cards: BasketCard[] = Array.from({ length: 6 }, (_, i) => ({
    cardId: `c${i}`,
    name: `Card ${i}`,
    slug: null,
    qty: 1,
    listings: [{ retailer: "cherry", retailerName: "Cherry", priceCents: 750, url: "https://example.com" }],
  }));
  const plan = optimizeBasket(cards, stores);
  assert.equal(plan.storeCount, 1);
  const g = plan.stores[0];
  assert.equal(g.items, 6);
  assert.equal(g.subtotalCents, 4500);
  assert.notEqual(g.shippingCents, 200, "never the $2 letter for an order it was never offered on");
  assert.equal(g.shippingCents, 2000);
  assert.equal(g.postage.label, "Tracked Parcel");
  assert.equal(g.postage.otherOption, undefined, "no letter to mention: it is not offered for 6 cards / $45");
  assert.equal(plan.totalCents, 4500 + 2000);
  // …while a one-card order there really does get the $2 letter, labelled as untracked.
  const one = optimizeBasket(cards.slice(0, 1), stores);
  assert.equal(one.stores[0].shippingCents, 200);
  assert.equal(one.stores[0].postage.tracked, false);
  assert.equal(one.stores[0].postage.otherOption?.cents, 2000);
});

test("an untracked letter applies only within the value AND card count it was seen on", () => {
  const snap = snapshotOf(LETTER_THEN_PARCEL);
  const q = (v: number, n: number) => shippingFor("cherry", cart(v, n), { region: "SA" }, snap);
  assert.equal(q(5, 1).cents, 200);
  assert.equal(q(20, 3).cents, 200, "exactly the biggest cart it was seen on");
  assert.equal(q(20.01, 3).cents, 2000, "a cent more value than seen: no letter");
  assert.equal(q(10, 4).cents, 2000, "one card more than seen: no letter");
  assert.equal(q(10, 4).tracked, true);
});

test("tracked-only never picks the letter, and says a cheaper letter was skipped", () => {
  const snap = snapshotOf(LETTER_THEN_PARCEL);
  const q = shippingFor("cherry", cart(5, 1), { region: "SA", trackedOnly: true }, snap);
  assert.equal(q.cents, 2000);
  assert.equal(q.tracked, true);
  assert.deepEqual(q.otherOption, { cents: 200, label: "Singles Untracked", tracked: false });
  assert.deepEqual(postageOptionsFrom("AU", "SA", "1"), { region: "SA", trackedOnly: true });
  assert.deepEqual(postageOptionsFrom("AU", "Texas", null), { region: null, trackedOnly: false }, "a region outside the market is ignored");
});

test("region unknown: the HIGHEST regional rate, flagged 'up to'; a known region gets its own", () => {
  // Zone-priced like Canada Post Expedited: Toronto $10, Vancouver $20.
  const zoned = probe("facetoface", "CA", [
    { id: "S1", v: 1, n: 1, rates: (a) => [["Expedited Parcel", a === "van" ? 20 : a === "cgy" ? 18 : 10]] },
    { id: "V50", v: 50, n: 2, rates: (a) => [["Expedited Parcel", a === "van" ? 20 : a === "cgy" ? 18 : 10]] },
  ]);
  const snap = { ...snapshotOf(zoned), markets: { CA: { measuredAt: "2026-09-25", addresses: [] } } } as ShippingSnapshot;
  const unknown = shippingFor("facetoface", cart(10, 1), {}, snap);
  assert.equal(unknown.cents, 2000, "never the cheapest region");
  assert.equal(unknown.upTo, true);
  const on = shippingFor("facetoface", cart(10, 1), { region: "ON" }, snap);
  assert.equal(on.cents, 1000);
  assert.equal(on.upTo, false);
  assert.equal(shippingFor("facetoface", cart(10, 1), { region: "BC" }, snap).cents, 2000);
  // Identical everywhere (every measured AU store): no "up to".
  assert.equal(shippingFor("obsessiongaming", cart(10, 1), {}, snapshotOf(OBSESSION)).upTo, false);
});

test("a store that does not post to a region is unavailable there, and says where it does not post", () => {
  // Trinket Mage (DE): quoted Berlin, nothing to Madrid, Paris or Amsterdam.
  const deOnly = probe("trinketmage", "EU", [
    { id: "S1", v: 0.25, n: 1, rates: (a) => (a === "de" ? [["Standard", 5.99]] : "empty") },
    { id: "V50", v: 50, n: 5, rates: (a) => (a === "de" ? [["Standard", 5.99]] : "empty") },
  ]);
  const snap = { ...snapshotOf(deOnly), markets: {} } as ShippingSnapshot;
  const es = shippingFor("trinketmage", cart(10, 1), { region: "ES" }, snap);
  assert.match(es.unavailable ?? "", /Spain/);
  const unknown = shippingFor("trinketmage", cart(10, 1), {}, snap);
  assert.equal(unknown.cents, 599);
  assert.equal(unknown.upTo, true);
  assert.deepEqual(unknown.notServed, ["Spain", "France", "Netherlands"]);
  // The basket leaves it out for a Madrid buyer and says why.
  const stores = basketStoresFor("EU", { region: "ES" }, snap);
  const plan = optimizeBasket(
    [{ cardId: "x", name: "X", slug: null, qty: 1, listings: [{ retailer: "trinketmage", retailerName: "Trinket Mage", priceCents: 100, url: "u" }] }],
    stores,
  );
  assert.deepEqual(plan.unbuyable, [{ name: "X", qty: 1 }]);
  assert.equal(plan.excludedStores[0]?.key, "trinketmage");
});

test("free postage needs a measured threshold, and applies from the first free cart — never a guessed round number", () => {
  // Ozzie as measured: $9.99 up to $90.98, free at $100.98.
  const ozzie = probe("ozzie", "AU", [
    { id: "S1", v: 0.5, n: 1, rates: [["Standard Shipping", 9.99]] },
    { id: "S10", v: 5, n: 10, rates: [["Standard Shipping", 9.99]] },
    { id: "V90", v: 90.98, n: 2, rates: [["Standard Shipping", 9.99]] },
    { id: "V100", v: 100.98, n: 2, rates: [["Free Shipping", 0]] },
    { id: "V150", v: 154.98, n: 2, rates: [["Free Shipping", 0]] },
  ]);
  const snap = snapshotOf(ozzie);
  const at = (v: number, n = 2) => shippingFor("ozzie", cart(v, n), { region: "SA" }, snap);
  assert.equal(at(95).cents, 999, "between the paid and the free cart: still paid");
  assert.equal(at(95).freeFromCents, 10098);
  assert.equal(at(100).cents, 999, "the store's threshold is probably $100, but $100.98 is what was measured");
  assert.equal(at(100.98).cents, 0);
  assert.equal(at(100.98).free, true);
  assert.equal(at(100.98).label, "Free Shipping");
  // retailers.ts guessed "free over $60": never applied.
  assert.equal(at(61).cents, 999);
});

test("a $0 rate only small orders get is not a free-shipping threshold", () => {
  // Maine Phase: "Standard" $0 for 1–3 cards at any value, gone at 10 cards.
  assert.equal(
    freeThreshold([
      { v: 50, n: 1, cents: 0 },
      { v: 500, n: 10, cents: 635 },
      { v: 2095, n: 1, cents: 0 },
      { v: 9390, n: 2, cents: 0 },
      { v: 15075, n: 5, cents: 0 },
    ]),
    null,
  );
  // A paid cart below with no more cards makes it one (wulfgaming: paid at $45.26, free from $50.34).
  assert.equal(freeThreshold([{ v: 4526, n: 2, cents: 135 }, { v: 5034, n: 2, cents: 0 }, { v: 10281, n: 2, cents: 0 }]), 5034);
  // Free, then paid again above: not a threshold.
  assert.equal(freeThreshold([{ v: 1000, n: 1, cents: 500 }, { v: 5000, n: 1, cents: 0 }, { v: 9000, n: 1, cents: 500 }]), null);
});

test("prices between measured carts err dearer: the nearest cart with at least as many cards, or as much value", () => {
  // Card Hub: tracked letter $6 for one card, $12 for ten.
  const hub = probe("cardhub", "AU", [
    { id: "S1", v: 1.5, n: 1, rates: [["Singles Tracked Letter", 6]] },
    { id: "S10", v: 15, n: 10, rates: [["Singles Tracked Letter", 12]] },
    { id: "V50", v: 52.35, n: 1, rates: [["Singles Tracked Letter", 6]] },
  ]);
  const snap = snapshotOf(hub);
  assert.equal(shippingFor("cardhub", cart(20, 5), { region: "SA" }, snap).cents, 1200, "5 cards: priced as the 10-card cart, not the 1-card one");
  assert.equal(shippingFor("cardhub", cart(40, 1), { region: "SA" }, snap).cents, 600);
  const big = shippingFor("cardhub", cart(20, 30), { region: "SA" }, snap);
  assert.equal(big.beyondMeasured, true, "30 cards is more than anything measured, and the quote says so");
  assert.equal(big.cents, 1200);
});

test("a minimum order is reported, and the basket counts the top-up", () => {
  const dice = probe("dicesaloon", "UK", [
    { id: "S1", v: 0.35, n: 1, rates: "empty" },
    { id: "S10", v: 3.5, n: 10, rates: "empty" },
    { id: "V20", v: 20, n: 3, rates: [["Standard", 3.5]] },
  ]);
  const snap = { ...snapshotOf(dice), stores: { dicesaloon: condenseStore(dice, { minOrderCents: 500 }) } } as ShippingSnapshot;
  const q = shippingFor("dicesaloon", cart(3, 1), { region: "ENG" }, snap);
  assert.equal(q.minOrderCents, 500);
  assert.equal(q.cents, 350);
  const plan = optimizeBasket(
    [{ cardId: "x", name: "X", slug: null, qty: 1, listings: [{ retailer: "dicesaloon", retailerName: "Dice Saloon", priceCents: 300, url: "u" }] }],
    basketStoresFor("UK", { region: "ENG" }, snap),
  );
  assert.equal(plan.topUpCents, 200);
  assert.equal(plan.totalCents, 300 + 350 + 200);
  // Detected from the carts alone when no hand check exists: the first quoted cart.
  assert.equal(condenseStore(dice, {}).minOrderCents, 2000);
});

test("an unmeasured store falls back to its guess, labelled an estimate, and its guessed threshold is never applied", () => {
  const snap = snapshotOf(OBSESSION); // no punkouter in it
  const r = RETAILERS.punkouter;
  assert.ok(r && r.freeOverCents > 0, "fixture premise: punkouter carries a guessed free-over threshold");
  const q = shippingFor("punkouter", cart(r.freeOverCents / 100 + 50, 3), {}, snap);
  assert.equal(q.basis, "estimate");
  assert.equal(q.cents, r.shippingFlatCents, "the guessed threshold must not zero it");
  assert.equal(q.free, false);
});

test("no copy calls a guess 'measured'", () => {
  // Every place "measured" appears in an estimate's copy, it is "not measured".
  const claimsMeasured = (s: string) => /(?<!not |hasn't been |haven't |not been |n't been )measured/i.test(s);
  const est = shippingFor("punkouter", cart(10, 1), {}, snapshotOf(OBSESSION));
  assert.ok(!claimsMeasured(est.label), est.label);
  const note = shippingNoteFor("punkouter", snapshotOf(OBSESSION));
  assert.ok(!claimsMeasured(note), note);
  assert.match(note, /est\./);
  assert.equal(shippingSummary("punkouter", snapshotOf(OBSESSION)).basis, "estimate");
  // A measured store's note says when.
  assert.match(shippingNoteFor("obsessiongaming", snapshotOf(OBSESSION)), /Standard A\$20\.00 .*measured 25 Sep 2026/);
  // The UI: an estimate line is "est." and says it has not been measured; the
  // store page's estimate branch says the same, and neither branch says
  // "measured" about it.
  const ui = read("src/components/BestBasket.tsx");
  const estBranch = ui.slice(ui.indexOf('if (p.basis === "estimate")'), ui.indexOf("const kind ="));
  assert.match(estBranch, /est\. \{fmt\(p\.cents\)\}/);
  assert.match(estBranch, /hasn&apos;t been measured yet/);
  assert.ok(!claimsMeasured(estBranch.replace(/hasn&apos;t been measured/g, "")), "estimate branch must not claim a measurement");
  assert.match(ui, /s\.postage\.basis === "estimate" \? "est\. "/, "the store header marks an estimate");
  const page = read("src/app/stores/[slug]/page.tsx");
  const pageEst = page.slice(page.indexOf('if (s.basis === "estimate")'), page.indexOf('if (s.basis === "no-post")'));
  assert.match(pageEst, /haven&apos;t measured/);
  assert.match(pageEst, /our guess, not a rate the store quoted/);
});

test("the old flat guesses are gone from every consumer", () => {
  for (const f of [
    "src/lib/basket.ts",
    "src/app/api/basket/route.ts",
    "src/app/api/portfolio/replacement/route.ts",
    "src/app/stores/[slug]/page.tsx",
    "src/app/stores/tracked/page.tsx",
    "src/components/BestBasket.tsx",
  ]) {
    const code = read(f).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /\b(shippingFlatCents|freeOverCents|shippingNote)\b/, `${f} must price postage through lib/shipping.ts`);
  }
  assert.match(read("src/app/api/basket/route.ts"), /basketStoresFor\(country, postageOpts\)/);
  assert.match(read("src/app/api/portfolio/replacement/route.ts"), /basketStoresFor\(country, postageOpts\)/);
});

test("the region and tracked-only choices are remembered, guarded, and sent to both routes", () => {
  const prefs = read("src/lib/postage-prefs.ts");
  assert.equal((prefs.match(/try \{/g) ?? []).length, 2, "every localStorage read and write sits in try/catch");
  const ui = read("src/components/BestBasket.tsx");
  assert.match(ui, /readPostagePrefs\(market\)/);
  assert.match(ui, /writePostagePrefs\(market,/);
  assert.match(ui, /Tracked postage only/);
  assert.match(ui, /Not sure — price the highest rate/);
  assert.match(ui, /untracked letter \$\{fmt\(p\.otherOption\.cents\)\} also offered/);
  assert.match(ui, /the store&apos;s own checkout is final/);
  assert.match(read("src/components/PortfolioReplacementCost.tsx"), /readPostagePrefs\(country\)/);
});

// ── The checked-in snapshot ─────────────────────────────────────────────────

test("the snapshot covers every configured store, in its own currency, and stays small", () => {
  for (const r of RETAILER_LIST) {
    const s = SHIPPING_SNAPSHOT.stores[r.key];
    assert.ok(s, `${r.key} is missing from shipping-rates.json — rebuild it`);
    assert.equal(s.market, r.country ?? "AU", r.key);
    if (s.status === "measured") {
      assert.equal(s.currency, r.currency ?? currencyOf((r.country ?? "AU") as Country), `${r.key}: rates in another currency`);
      assert.match(s.measuredAt, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(s.carts.length > 0 && s.zones.length > 0, r.key);
      for (const z of s.zones) assert.equal(z.std.length, s.carts.length, `${r.key}: std series misaligned`);
    }
  }
  assert.ok(statSync(join(ROOT, "src/lib/shipping-rates.json")).size < 120_000, "keep the snapshot condensed — raw probe files are artifacts, not source");
});

test("the real snapshot: Obsession Gaming is $20 to Adelaide, and no AU store charges by state", () => {
  const q = shippingFor("obsessiongaming", cart(30, 5), { region: "SA" });
  assert.equal(q.cents, 2000);
  assert.equal(q.basis, "measured");
  for (const s of Object.values(SHIPPING_SNAPSHOT.stores)) {
    if (s.market !== "AU" || s.status !== "measured") continue;
    const prices = new Set(s.zones.map((z) => JSON.stringify(z.std.map((e) => e?.[0] ?? null))));
    assert.equal(prices.size, 1, "measured 2026-09-25: every AU store quoted all eight capitals the same");
  }
  // So the AU picker says so, rather than implying Adelaide pays more; the CA one does not.
  assert.equal(marketHasZonePricing("AU"), false, "88 Games Arena's differently-NAMED $8 rate is not zone pricing");
  assert.equal(marketHasZonePricing("CA"), true);
});

test("condensing: identical addresses collapse, pickup and other currencies are dropped, a store quoting nothing anywhere does not post", () => {
  const s = condenseStore(
    probe("ozzie", "AU", [
      {
        id: "S1",
        v: 0.5,
        n: 1,
        rates: (a) => [
          ["Standard Shipping", 9.99],
          ...(a === "mel" ? ([["In Store Pick Up - Eumemmerring, VIC", 0]] as Rates) : []),
        ],
      },
    ]),
    {},
  );
  assert.equal(s.zones.length, 1, "Melbourne's $0 pickup is not postage, so all eight capitals are one zone");
  assert.equal(s.zones[0].at.length, 8);
  assert.deepEqual(s.zones[0].std, [[999, 0, 0]]);
  const nothing = condenseStore(probe("larrysgamestore", "US", [{ id: "S1", v: 1, n: 1, rates: "empty" }]), {});
  assert.equal(nothing.status, "no-post");
  const usdRatesInAud = probe("ozzie", "AU", [{ id: "S1", v: 1, n: 1, rates: [["Standard", 5]] }], "AUD");
  usdRatesInAud.scenarios[0].byAddress.syd.rates.forEach((r) => (r.currency = "USD"));
  assert.equal(condenseStore(usdRatesInAud, {}).zones.find((z) => z.at.includes("syd"))?.std[0], null, "never mix currencies");
});

test("the refresh workflow re-runs the probe per market and never commits or touches the database", () => {
  const wf = read(".github/workflows/shipping-rates.yml");
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /scripts\/probe-shipping-rates\.ts --market=/);
  assert.match(wf, /scripts\/build-shipping-rates\.ts/);
  assert.match(wf, /actions\/upload-artifact@v4/);
  assert.match(wf, /GITHUB_STEP_SUMMARY/);
  assert.doesNotMatch(wf, /DATABASE_URL|RM\d|git push|git commit/, "a read-only probe: no database, no commits");
  assert.doesNotMatch(wf, /\[deploy\]/i);
});

test("the optimiser drains a whole store when no single-card move can save its postage", () => {
  // Two cards cheapest at A, two at B, each store $10 postage. Moving ONE card
  // off A saves nothing (A still posts the other), so a single-move climb is
  // stuck at two orders; emptying A onto B pays $1.00 more for cards and saves
  // $10.00 of postage.
  const flat = (cents: number) => () => ({ cents, label: "Standard", tracked: null, basis: "measured" as const, free: false, upTo: false });
  const stores = { a: { name: "A", postage: flat(1000) }, b: { name: "B", postage: flat(1000) } };
  const card = (id: string, a: number, b: number): BasketCard => ({
    cardId: id,
    name: id,
    slug: null,
    qty: 1,
    listings: [
      { retailer: "a", retailerName: "A", priceCents: a, url: "u" },
      { retailer: "b", retailerName: "B", priceCents: b, url: "u" },
    ],
  });
  const cards = [card("1", 100, 150), card("2", 100, 150), card("3", 150, 100), card("4", 150, 100)];
  const plan = optimizeBasket(cards, stores);
  assert.equal(plan.naiveStoreCount, 2);
  assert.equal(plan.naiveTotalCents, 400 + 2000);
  assert.equal(plan.storeCount, 1);
  assert.equal(plan.totalCents, 500 + 1000);
  assert.equal(plan.savedCents, 900);
  // Deterministic: the same input gives the same split.
  assert.deepEqual(optimizeBasket(cards, stores).stores.map((s) => s.key), plan.stores.map((s) => s.key));
});
