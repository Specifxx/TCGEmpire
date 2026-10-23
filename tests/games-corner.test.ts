import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifySealed, isTrackableSealedTitle } from "../src/lib/sealed-import";
import { RETAILERS } from "../src/lib/retailers";
import { SEALED_ONLY_SHOPIFY } from "../src/lib/sealed-stores";
import { offerCurrencyOk } from "../src/lib/offer-currency";

// The Games Corner (2026-10-23, owner): AUD Shopify, sealed only, Riftbound
// buried on page 12 of its every-game "tcgs" collection.

test("The Games Corner is a sealed-only AU store read deep and strictly", () => {
  const s = SEALED_ONLY_SHOPIFY.find((x) => x.key === "thegamescorner");
  assert.ok(s, "registered in lib/sealed-stores.ts");
  assert.equal(s.base, "https://www.thegamescorner.com.au");
  assert.equal(s.country, "AU");
  assert.equal(s.currency, "AUD");
  assert.deepEqual(s.collections, ["tcgs"]);
  assert.ok((s.maxPages ?? 0) >= 16, "Riftbound sits on page 12 of ~15");
  assert.equal(s.strictTitles, true, "an every-game collection must be read strictly");
  assert.ok(!RETAILERS.thegamescorner, "no singles: in RETAILERS it would read as a broken store");
  assert.equal(offerCurrencyOk("thegamescorner", "AU"), true);
});

test("its real titles classify, and the strict read is wired into the importer", () => {
  const keep: [string, string][] = [
    ["Riftbound League of Legends TCG Radiance Booster Box (Release Date 23 Oct 2026)", "Booster Box"],
    ["Riftbound League of Legends TCG Radiance Vault (Release Date 23 Oct 2026)", "Bundle"],
    ["Riftbound League of Legends TCG Origins Champion Deck Jinx (Release Date 07 Nov 2025)", "Champion Deck (Jinx)"],
  ];
  for (const [title, type] of keep) {
    assert.ok(isTrackableSealedTitle(title), title);
    assert.equal(classifySealed(title), type, title);
  }
  const src = readFileSync(new URL("../src/lib/sealed-import.ts", import.meta.url), "utf8");
  assert.match(src, /strict: !!own\.strictTitles, own: true/);
  assert.match(src, /if \(products\.length && \(!strict \|\| ownBatch\)\) scraped = true;/);
  assert.match(src, /if \(strict && !STRICT_RIFTBOUND\.test\(title\)\) continue;/, "strict batches drop 'Magic the Gathering Origins Booster Box'");
});
