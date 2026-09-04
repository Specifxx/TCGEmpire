import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cardNumKey, cheapestEuByNumber, ctNumKey, toEurCents } from "../src/lib/cardtrader";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// Fixtures mirror the real shape returned by
// GET /api/v2/marketplace/products?expansion_id=… (verified live 2026-08-24
// against Unleashed: 43,696 listings / 313 blueprints, and Origins: 51,060).
function listing(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    blueprint_id: 379385,
    name_en: "Sharkling",
    quantity: 6,
    graded: false,
    on_vacation: false,
    price_cents: 100,
    price_currency: "EUR",
    properties_hash: {
      collector_number: "006",
      condition: "Near Mint",
      signed: false,
      riftbound_foil: false,
      riftbound_language: "en",
    },
    user: { country_code: "IT", username: "seller" },
    ...over,
  } as never;
}

test("CardTrader collector numbers key onto our own catalogue numbers", () => {
  // CardTrader writes "006"/"022a"; we store "006/219"/"022a/219".
  assert.equal(ctNumKey("006"), cardNumKey("006/219"));
  assert.equal(ctNumKey("022a"), cardNumKey("022a/219"));
  assert.equal(ctNumKey("238"), cardNumKey("238/219"));
});

test("a Signature print never collapses onto its base card", () => {
  // The single most expensive mistake available here: Ahri 303*/298 trades around
  // 9x the price of 303/298, so keying them together would quote one for the other.
  assert.notEqual(cardNumKey("303*/298"), cardNumKey("303/298"));
  assert.equal(cardNumKey("303*/298"), "303s");
  assert.equal(cardNumKey("303/298"), "303");
});

test("prices convert to EUR, and an already-EUR price is untouched", () => {
  assert.equal(toEurCents(100, "EUR"), 100);
  // CardTrader quotes in the ACCOUNT's display currency, so a non-EUR figure must
  // be converted rather than written to an EUR column as-is. 100 AUD cents at the
  // canonical rates (1.5 AUD/USD, 0.92 EUR/USD) is 61 EUR cents.
  assert.equal(toEurCents(100, "AUD"), 61);
  // An unknown currency passes through rather than silently becoming zero.
  assert.equal(toEurCents(100, "ZZZ"), 100);
});

test("only EU sellers set the EU price", () => {
  const best = cheapestEuByNumber([
    listing({ price_cents: 50, user: { country_code: "US" } }),
    listing({ price_cents: 90, user: { country_code: "IT" } }),
  ]);
  assert.equal(best.size, 1);
  assert.equal(best.get("6")!.priceEurCents, 90, "the cheaper US listing must not win an EU market price");
  assert.equal(best.get("6")!.sellerCountry, "IT");
});

test("non-English printings never undercut the price", () => {
  // Same collector number, different product: CardTrader lists zh-CN and fr copies
  // (35 and 27 of Unleashed's 313 cards), and the catalogue is the English print.
  const best = cheapestEuByNumber([
    listing({ price_cents: 10, properties_hash: { collector_number: "006", condition: "Near Mint", riftbound_language: "zh-CN" } }),
    listing({ price_cents: 80 }),
  ]);
  assert.equal(best.get("6")!.priceEurCents, 80);
});

test("signed, graded, vacationing, out-of-stock and heavily-played listings are excluded", () => {
  const base = { collector_number: "006", condition: "Near Mint", riftbound_language: "en" };
  for (const bad of [
    listing({ price_cents: 5, properties_hash: { ...base, signed: true } }),
    listing({ price_cents: 5, graded: true }),
    listing({ price_cents: 5, on_vacation: true }),
    listing({ price_cents: 5, quantity: 0 }),
    listing({ price_cents: 5, properties_hash: { ...base, condition: "Poor" } }),
    listing({ price_cents: 0 }),
  ]) {
    const best = cheapestEuByNumber([bad, listing({ price_cents: 80 })]);
    assert.equal(best.get("6")!.priceEurCents, 80, "an excluded listing set the price");
  }
});

test("a listing with no collector number is skipped, not name-matched", () => {
  // 14 of Unleashed's 313 blueprints are tokens/unnumbered promos. Guessing at a
  // name match there would put a wrong price on a real card.
  const best = cheapestEuByNumber([
    listing({ properties_hash: { collector_number: null, condition: "Near Mint", riftbound_language: "en" } }),
  ]);
  assert.equal(best.size, 0);
});

test("CardTrader is the EU source and is NOT treated as a converted UK fallback", () => {
  // Each row is one real in-stock EU listing in EUR, unlike the converted
  // TCGplayer-UK / Cardmarket reference prices, so it must not be filtered out of
  // headline pricing the way those are.
  const constants = read("src/lib/constants.ts");
  assert.match(constants, /CARDTRADER_RETAILER = "cardtrader"/);
  const fallback = /UK_FALLBACK_RETAILERS[^\n]*\n/.exec(constants)?.[0] ?? "";
  assert.ok(!fallback.includes("CARDTRADER"), "CardTrader must not be a UK fallback retailer");
});

test("Cardmarket's permission is resolved, but it still gates on its own configured files — CardTrader does not unlock it", () => {
  // Cardmarket's redisplay-licence gate is resolved (2026-09-04 support
  // confirmation — see lib/cardmarket.ts's header), but that is not the same as
  // having the actual files: it still runs only once someone configures
  // CARDMARKET_PRODUCTLIST_URL/CARDMARKET_PRICEGUIDE_URL, exactly like CardTrader
  // gates on its own token. Adding one EU source must never be mistaken for
  // silently enabling the other.
  const cm = read("src/lib/cardmarket.ts");
  assert.doesNotMatch(cm, /CARDMARKET_ENABLED/, "the old standalone legal-gate flag must be gone entirely");
  assert.match(cm, /CARDMARKET_PRODUCTLIST_URL/, "Cardmarket must still gate on its own configured files, not CardTrader's");
  assert.match(cm, /2026-09-04/, "the permission confirmation must stay documented, not silently assumed");
});
