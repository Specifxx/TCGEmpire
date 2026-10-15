import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FEED_STORES, SEALED_ONLY_STORES, parseSealedFeed } from "../src/lib/sealed-stores";
import { isTrackableSealedTitle } from "../src/lib/sealed-import";
import { storeCurrency, offerCurrencyOk } from "../src/lib/offer-currency";

// ─────────────────────────────────────────────────────────────────────────────
// Feed stores (2026-10-15): SephiGames suggested itself through the inbox and
// publishes its Riftbound stock as JSON. The sample below is its live feed of
// that morning, verbatim apart from the two items added to test the filters.
// ─────────────────────────────────────────────────────────────────────────────

const LIVE = {
  game: "riftbound",
  currency: "EUR",
  generated_at: "2026-10-15T09:12:52Z",
  items: [
    { id: "ae888462c79447b1", type: "sealed", name: "Spiritforged Booster Box", set_name: "Spiritforged", language: "en", price: 159.99, quantity: 2, url: "https://sephigames.com/en/riftbound/sealed/172126/en/spiritforged-booster-box" },
    { id: "9f2454fc9167aa64", type: "sealed", name: "Radiance Booster Box", set_name: "Radiance", language: "en", price: 129.99, quantity: 5, url: "https://sephigames.com/en/riftbound/sealed/175215/en/radiance-booster-box", preorder_ships_by: "2026-10-23" },
    { id: "b3659995387ca906", type: "sealed", name: "Radiance Vault", set_name: "Radiance", language: "en", price: 34.99, quantity: 1, url: "https://sephigames.com/en/riftbound/sealed/175220/en/radiance-vault", preorder_ships_by: "2026-10-23" },
    { id: "x1", type: "sealed", name: "Radiance Booster Box", set_name: "Radiance", language: "fr", price: 99.99, quantity: 3, url: "https://sephigames.com/fr/x" },
    { id: "x2", type: "sealed", name: "Spiritforged Booster Box", set_name: "Spiritforged", language: "en", price: 149.99, quantity: 0, url: "https://sephigames.com/en/y" },
  ],
};

test("a feed's English sealed items are read, titled with the game so every sealed gate accepts them", () => {
  const items = parseSealedFeed(LIVE, "EUR");
  assert.ok(items);
  assert.deepEqual(
    items.map((i) => [i.title, i.priceCents, i.inStock]),
    [
      ["Riftbound Spiritforged Booster Box", 15999, true],
      ["Riftbound Radiance Booster Box", 12999, true],
      ["Riftbound Radiance Vault", 3499, true],
      ["Riftbound Spiritforged Booster Box", 14999, false], // quantity 0 is sold out
    ],
    "the French print is dropped, as French prints are everywhere",
  );
  // cleanupStaleSealed deletes any non-TCGplayer row whose title fails these
  // gates, so a bare "Radiance Vault" would be imported and then wiped.
  for (const i of items) assert.ok(isTrackableSealedTitle(i.title), i.title);
});

test("a feed that is not what it claims is refused whole, so the store's rows are kept", () => {
  assert.equal(parseSealedFeed({ ...LIVE, currency: "USD" }, "EUR"), null, "wrong currency");
  assert.equal(parseSealedFeed({ ...LIVE, game: "pokemon" }, "EUR"), null, "another game");
  assert.equal(parseSealedFeed({ game: "riftbound", currency: "EUR" }, "EUR"), null, "no items");
  assert.equal(parseSealedFeed(null, "EUR"), null);
});

test("SephiGames is registered sealed-only in the EU, in euros, and the importer reads feeds", () => {
  const s = FEED_STORES.find((x) => x.key === "sephigames");
  assert.ok(s);
  assert.equal(s.country, "EU");
  assert.ok(SEALED_ONLY_STORES.some((x) => x.key === "sephigames"));
  assert.equal(storeCurrency("sephigames"), "EUR");
  assert.equal(offerCurrencyOk("sephigames", "EU"), true);
  assert.equal(offerCurrencyOk("sephigames", "US"), false);
  const src = readFileSync(join(process.cwd(), "src/lib/sealed-import.ts"), "utf8");
  assert.match(src, /count \+= await importFeedStores\(\);/);
  assert.match(src, /const items = parseSealedFeed\(data, store\.currency\);\s*if \(!items\) \{/, "an untrusted feed keeps the rows");
});
