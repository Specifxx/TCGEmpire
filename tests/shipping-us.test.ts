import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROBE_ADDRESSES, classifyRate, type ProbeScenarioResult } from "../src/lib/shipping-probe";
import { condenseStore, type ProbeStoreInput, type ShippingSnapshot } from "../src/lib/shipping-snapshot";
import {
  SHIPPING_SNAPSHOT,
  basketStoresFor,
  postageOptionsFrom,
  regionFromGeo,
  regionOptionsFor,
  shippingFor,
  shippingNoteFor,
  shippingSummary,
} from "../src/lib/shipping";
import { optimizeBasket } from "../src/lib/basket";
import { planPostageNotes, postageLineBits, postagePrefix } from "../src/lib/postage-display";
import { effectiveRegion } from "../src/lib/postage-prefs";

// ─────────────────────────────────────────────────────────────────────────────
// US buyers first-class (2026-09-25). The US is the biggest market, so its
// postage has to read the way an American would say it — Census regions, each
// named with the city it was measured to, preselected from the visitor's state
// — and the model has to handle what is specific to US stores: USPS
// First-Class letters that vanish as an order grows, carrier-calculated
// Ground Advantage that varies by zone, "Standard"/"Economy" names that do not
// say whether they are tracked, stores in the US market posting from Canada,
// and free-shipping thresholds applied from the measured cart, never a
// guessed $35/$50/$75/$100.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const cart = (dollars: number, items: number) => ({ subtotalCents: Math.round(dollars * 100), items });
type Rates = [name: string, dollars: number][];

function probeUS(key: string, carts: { id: string; v: number; n: number; rates: (addr: string) => Rates }[]): ProbeStoreInput {
  const addresses = PROBE_ADDRESSES.US;
  const scenarios: ProbeScenarioResult[] = carts.map((c) => {
    const byAddress: ProbeScenarioResult["byAddress"] = {};
    for (const a of addresses) {
      byAddress[a.id] = { status: "ok", rates: c.rates(a.id).map(([name, d]) => ({ name, cents: Math.round(d * 100), currency: "USD", ...classifyRate(name) })) };
    }
    return { id: c.id, kind: c.id.startsWith("S") ? "count" : "value", subtotalCents: Math.round(c.v * 100), items: c.n, cartCurrency: "USD", byAddress };
  });
  return { key, market: "US", currency: "USD", measuredAt: "2026-09-25T04:00:00.000Z", addresses, scenarios };
}
const snapOf = (...s: ProbeStoreInput[]): ShippingSnapshot => ({
  version: 1,
  note: "test",
  markets: { US: SHIPPING_SNAPSHOT.markets.US },
  stores: Object.fromEntries(s.map((x) => [x.key, condenseStore(x, {})])),
});

// Gear Gaming as measured: USPS Ground Advantage by zone (NY $5.72, SF $5.82,
// Dallas $5.38, Chicago $5.50) and a 75¢ "USPS First Class Mail" letter seen
// on 1 card and on 10 cards at $2.50, gone by $20.07.
const GA: Record<string, number> = { ny: 5.72, sf: 5.82, dal: 5.38, chi: 5.5 };
const GEAR = probeUS("geargaming", [
  { id: "S1", v: 0.25, n: 1, rates: (a) => [["Ground Advantage", GA[a]], ["USPS First Class Mail", 0.75], ["Priority Mail", 9.85]] },
  { id: "S10", v: 2.5, n: 10, rates: (a) => [["Ground Advantage", GA[a]], ["USPS First Class Mail", 0.75]] },
  { id: "V20", v: 20.07, n: 2, rates: (a) => [["Ground Advantage", GA[a]]] },
  { id: "V50", v: 50, n: 3, rates: (a) => [["Ground Advantage", GA[a]]] },
  { id: "V100", v: 100.04, n: 5, rates: (a) => [["Ground Advantage", GA[a]]] },
]);

test("the US picker reads like America: Census regions named with the city they were measured to, then 'Elsewhere'", () => {
  const opts = regionOptionsFor("US");
  assert.deepEqual(
    opts.map((o) => o.label),
    [
      "Northeast (measured to New York)",
      "Midwest (measured to Chicago)",
      "South (measured to Dallas)",
      "West (measured to San Francisco)",
      "Elsewhere in the US — not measured",
    ],
  );
  assert.deepEqual(opts.map((o) => o.phrase), ["the Northeast", "the Midwest", "the South", "the West", "elsewhere in the US"]);
  assert.deepEqual(postageOptionsFrom("US", "OTHER", null), { region: "OTHER", trackedOnly: false });
  assert.equal(regionOptionsFor("AU").some((o) => o.unmeasured), false, "all eight AU states and territories are measured");
  assert.equal(regionOptionsFor("EU").at(-1)?.label, "Elsewhere in the EU — not measured");
});

test("the visitor's state preselects their region (Vercel geo headers), for every market", () => {
  const us = (st: string | null) => regionFromGeo("US", "US", st);
  assert.equal(us("NY"), "NE");
  assert.equal(us("PA"), "NE");
  assert.equal(us("OH"), "MW");
  assert.equal(us("IL"), "MW");
  assert.equal(us("TX"), "S");
  assert.equal(us("FL"), "S");
  assert.equal(us("DC"), "S");
  assert.equal(us("CA"), "W");
  assert.equal(us("WA"), "W");
  assert.equal(us("US-CA"), "W", "an ISO 3166-2 code with its country prefix");
  assert.equal(us("AK"), "OTHER", "Alaska is not priced as San Francisco");
  assert.equal(us("HI"), "OTHER");
  assert.equal(regionFromGeo("US", "PR", null), "OTHER", "Puerto Rico geolocates as its own country");
  assert.equal(us(null), null);
  assert.equal(us("ZZ"), null);
  assert.equal(regionFromGeo("US", "AU", "SA"), null, "an Australian browsing US stores gets no US region");
  assert.equal(regionFromGeo("AU", "AU", "SA"), "SA");
  assert.equal(regionFromGeo("AU", "AU", "ACT"), "ACT");
  assert.equal(regionFromGeo("CA", "CA", "ON"), "ON");
  assert.equal(regionFromGeo("CA", "CA", "MB"), "OTHER");
  assert.equal(regionFromGeo("UK", "GB", "SCT"), "SCT");
  assert.equal(regionFromGeo("UK", "GB", "WLS"), "ENG");
  assert.equal(regionFromGeo("UK", "GB", "NIR"), "NIR");
  assert.equal(regionFromGeo("EU", "DE", null), "DE");
  assert.equal(regionFromGeo("EU", "IT", "RM"), "OTHER", "an Italian buyer: rates were not measured to Italy");
  assert.equal(regionFromGeo("SG", "SG", null), "SG");
  // The pages pass it from the server; the buyer's own pick still wins and is remembered.
  for (const f of ["src/app/tools/best-basket/page.tsx", "src/app/portfolio/page.tsx"]) {
    assert.match(read(f), /regionFromGeo\(country, [^)]*x-vercel-ip-country"\)[^)]*x-vercel-ip-country-region"\)\)/, f);
  }
  assert.match(read("src/components/BestBasket.tsx"), /geoRegion=|geoRegion,/);
  const ok = () => true;
  assert.equal(effectiveRegion({ region: null, regionChosen: false, trackedOnly: false }, "MW", ok), "MW", "never chosen: the geo guess");
  assert.equal(effectiveRegion({ region: "W", regionChosen: true, trackedOnly: false }, "MW", ok), "W", "the buyer's pick wins");
  assert.equal(effectiveRegion({ region: null, regionChosen: true, trackedOnly: false }, "MW", ok), null, "'Not sure' is a choice too");
  const prefs = read("src/lib/postage-prefs.ts");
  assert.equal((prefs.match(/try \{/g) ?? []).length, 2, "localStorage stays inside try/catch");
});

test("a US store's First-Class letter only covers the orders it was seen on; Ground Advantage is priced by zone", () => {
  const snap = snapOf(GEAR);
  const q = (v: number, n: number, region: string | null = "MW", trackedOnly = false) =>
    shippingFor("geargaming", cart(v, n), { region, trackedOnly }, snap);
  assert.equal(q(1.5, 5).cents, 75, "5 cards, $1.50: inside what the letter was seen on");
  assert.equal(q(1.5, 5).tracked, false);
  assert.deepEqual(q(1.5, 5).otherOption, { cents: 550, label: "Ground Advantage", tracked: true });
  assert.ok(postageLineBits({ topUpCents: 0, postage: q(1.5, 5) }, (c) => `$${(c / 100).toFixed(2)}`).includes("tracked: Ground Advantage $5.50"));
  // More cards than the letter was ever seen with: no letter.
  const eleven = q(2.75, 11);
  assert.equal(eleven.cents, 550);
  assert.equal(eleven.label, "Ground Advantage");
  assert.equal(eleven.beyondMeasured, true);
  assert.equal(postagePrefix(eleven), "from ");
  // More value than it was seen with: no letter.
  assert.equal(q(25, 2).cents, 550);
  // By zone: the buyer's region, or the dearest ("up to") when unknown.
  assert.equal(q(25, 2, "S").cents, 538);
  assert.equal(q(25, 2, "W").cents, 582);
  const unknown = q(25, 2, null);
  assert.equal(unknown.cents, 582);
  assert.equal(unknown.upTo, true);
  assert.equal(postagePrefix(unknown), "up to ");
  // Tracked only: Ground Advantage, and the skipped letter is named.
  const tracked = q(1, 1, "NE", true);
  assert.equal(tracked.cents, 572);
  assert.equal(tracked.otherOption?.label, "USPS First Class Mail");
  // "Elsewhere in the US" (Alaska, Hawaii…): the dearest measured, marked as an estimate for there.
  const el = q(25, 2, "OTHER");
  assert.equal(el.cents, 582);
  assert.equal(el.upTo, false);
  assert.equal(el.unmeasuredRegion, true);
  assert.equal(postagePrefix(el), "est. ");
});

test("USPS's own spelling, 'First-Class Mail', is an untracked letter; 'First-Class Package' is not", () => {
  assert.equal(classifyRate("USPS First-Class Mail®").service, "untracked");
  assert.equal(classifyRate("First-Class Mail Letter").service, "untracked");
  assert.equal(classifyRate("USPS First-Class Package").service, "tracked");
  assert.equal(classifyRate("USPS Ground Advantage").service, "tracked");
  assert.equal(classifyRate("Economy").service, "unknown", "a name that does not say is never guessed");
});

test("a US free-shipping threshold starts at the measured free cart, never a guessed round $50", () => {
  // Knight and Day as measured: $9.00 at $65.50, free at $80.50 (guessed "free over $50").
  const kd = probeUS("knightandday", [
    { id: "S1", v: 0.5, n: 1, rates: () => [["Economy", 9]] },
    { id: "V50", v: 50.5, n: 2, rates: () => [["Economy", 9]] },
    { id: "V60", v: 65.5, n: 2, rates: () => [["Economy", 9]] },
    { id: "V75", v: 80.5, n: 2, rates: () => [["Free Shipping", 0]] },
    { id: "V100", v: 100.5, n: 2, rates: () => [["Free Shipping", 0]] },
  ]);
  const snap = snapOf(kd);
  const at = (v: number) => shippingFor("knightandday", cart(v, 2), { region: "NE" }, snap);
  assert.equal(at(55).cents, 900, "the guessed $50 is never applied");
  assert.equal(at(75).cents, 900, "$75 is probably the real threshold, but $80.50 is what was measured");
  assert.equal(at(75).freeFromCents, 8050);
  assert.equal(at(80.5).cents, 0);
  assert.equal(at(55).tracked, null, "'Economy' does not say whether it is tracked");
  assert.match(shippingNoteFor("knightandday", snap), /free from US\$80\.50/);
});

test("a store in the US market that posts from Canada says import charges may be due", () => {
  const np = shippingFor("npcollectibles", cart(10, 1), { region: "NE" });
  assert.match(np.crossBorder ?? "", /^ships from Canada: import duties or a carrier's brokerage fee may be charged on delivery$/);
  const dani = shippingFor("danireon", cart(10, 1), { region: "NE" });
  assert.match(dani.label, /Duties & Taxes Included/);
  assert.match(dani.crossBorder ?? "", /duties are included/, "Danireon's UPS rate says the duties are paid");
  assert.equal(shippingSummary("hobbiesville").shipsFrom, "Canada");
  assert.match(shippingNoteFor("mythicstore"), /ships from Canada/);
  assert.match(read("src/app/stores/[slug]/page.tsx"), /Ships from \{s\.shipsFrom\}/);
  const plan = optimizeBasket(
    [
      { cardId: "a", name: "A", slug: null, qty: 1, listings: [{ retailer: "npcollectibles", retailerName: "NP", priceCents: 100, url: "u" }] },
      { cardId: "b", name: "B", slug: null, qty: 1, listings: [{ retailer: "danireon", retailerName: "Danireon", priceCents: 100, url: "u" }] },
    ],
    basketStoresFor("US", { region: "NE" }),
  );
  assert.ok(planPostageNotes(plan, true).includes("1 store ships from abroad — import charges may be due on delivery"), planPostageNotes(plan, true).join(" | "));
});

test("the real US snapshot: zone pricing is real, Grognard's New York gap is named, and the copy claims no 'exact' rates", () => {
  // Shippin' Texas: a $1.49 plain white envelope to $20.76, then Ground
  // Advantage by zone — Dallas $5.93 up to San Francisco $8.27.
  assert.equal(shippingFor("shippintexas", cart(60, 2), { region: "S" }).cents, 593);
  assert.equal(shippingFor("shippintexas", cart(60, 2), { region: "W" }).cents, 827);
  assert.equal(shippingFor("shippintexas", cart(5, 1), { region: "W" }).cents, 149);
  const nyGap = shippingFor("grognardgames", cart(10, 1), { region: "NE" });
  assert.equal(nyGap.unavailable, "Quoted no postage to New York (measured, for the Northeast)");
  assert.deepEqual(shippingFor("grognardgames", cart(10, 1), {}).notServed, ["Northeast (New York)"]);
  for (const f of ["src/components/BestBasket.tsx", "src/app/tools/best-basket/page.tsx", "src/lib/content/hub-intros.ts", "src/components/PortfolioReplacementCost.tsx"]) {
    assert.doesNotMatch(read(f), /exact (regional )?rates/i, f);
  }
  assert.match(read("src/app/tools/best-basket/page.tsx"), /whether its name says it's tracked/);
});

test("the refresh runs monthly on its own, every market, and still never commits", () => {
  const wf = read(".github/workflows/shipping-rates.yml");
  assert.match(wf, /schedule:\s*\n\s*- cron: "17 3 2 \* \*"/, "monthly, off the hour, away from the 08:00 UTC release");
  assert.match(wf, /github\.event_name == 'schedule' \|\| inputs\.market == 'all'/, "a scheduled run has no inputs: it probes every market");
  assert.match(wf, /max-parallel: 2/, "the politeness cap across markets stays");
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /actions\/upload-artifact@v4/);
  assert.match(wf, /GITHUB_STEP_SUMMARY/);
  assert.doesNotMatch(wf, /git push|git commit|contents: write|DATABASE_URL/);
  const builder = read("scripts/build-shipping-rates.ts");
  assert.match(builder, /newly does not post/);
  assert.match(builder, /more than 50%/);
});
