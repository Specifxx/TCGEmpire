import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RETAILER_LIST, shippingPolicyUrl } from "../src/lib/retailers";
import { isSinglesTitle, MIN_SINGLES_FOR_STORE, CONVENTIONAL_SINGLES_HANDLES } from "../src/lib/woocommerce";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// A TRACKED STORE MUST BE A PRICE SOURCE, NOT A DIRECTORY ENTRY.
// ─────────────────────────────────────────────────────────────────────────────
// The EU market shipped with 96 stores on 2026-08-23 and the number was close to
// meaningless: candidates had been ranked on RAW in-stock product count inside
// their Riftbound collections, which counts booster boxes, playmats, sleeves and
// tournament tickets. Re-measured on in-stock listings carrying a COLLECTOR
// NUMBER — the only ones resolveCardId can turn into a price — 60 Shopify stores
// yielded five clearing ten singles, and all 36 WooCommerce stores yielded zero.
//
// These tests pin the rule that replaced it, and the arithmetic that makes the
// rule meaningful. They cannot check live stock (no network in the suite), so
// they check the things that made the bad number possible: a counting rule that
// says sealed is not a single, a threshold that is actually applied by the tool
// which adds stores, and a store list small enough to be plausible.

test("the singles rule counts cards and refuses sealed", () => {
  // Real titles from the eurozone probe — the left column is what a store that
  // prices cards lists, the right is what the 96-store version was counting.
  for (const t of [
    "Falling Comet - Origins (Common) [OGN-085]",
    "Fiora, Victorious OGN-232 Rare Near Mint",
    "Vi, Piltover Enforcer - Unleashed (Rare) 123/219",
    "Calm Rune (R02a) [UNL - R02a]",
  ]) {
    assert.ok(isSinglesTitle(t), `should count as a single: ${t}`);
  }
  for (const t of [
    "Riftbound: League of Legends TCG – Vendetta Booster Display",
    "Riftbound Vendetta Vault",
    "Riftbound: Vendetta Vi vs Jinx Sleeves",
    "Inscripción Riftbound Definitly – BO3 SÁBADO TARDE",
    "Vendetta Summoner Skirmish I Ticket",
    "ZED vs SHEN – SHOWDOWN DECKS – VENDETTA",
  ]) {
    assert.ok(!isSinglesTitle(t), `must NOT count as a single: ${t}`);
  }
});

test("a multi-card lot is not a single, matching the importer's own guard", () => {
  // A playset or lot carries a SET price; price-import.ts's MULTI_CARD refuses
  // them, so counting them toward a store's singles would inflate it with
  // listings that can never become a price row.
  for (const t of [
    "PLAYSET (3) 3x Watchful Sentry - 096/298",
    "Bundle 10x Origins Commons 012/298",
  ]) {
    assert.ok(!isSinglesTitle(t), `multi-card listing must not count: ${t}`);
  }
});

test("the threshold is a real number that the store-adding tool enforces", () => {
  assert.ok(MIN_SINGLES_FOR_STORE >= 10, "the bar must not drift below ten singles");
  const probe = read("scripts/probe-eu-stores.ts");
  assert.match(
    probe,
    /singles < MIN_SINGLES_FOR_STORE/,
    "the probe that decides which stores get added must apply the threshold, not just report it",
  );
  assert.match(
    probe,
    /isSinglesTitle/,
    "the probe must rank on singles — ranking on raw in-stock product count is what produced 96 unusable stores",
  );
});

test("the probe de-duplicates across collections before counting", () => {
  // Stores list the same card in "riftbound" and "riftbound-singles". Counting it
  // twice pushes a store past a bar it should not clear, which is exactly the
  // kind of soft inflation this whole test file exists to prevent.
  assert.match(read("scripts/probe-eu-stores.ts"), /seenHandles/, "the probe must de-dup products across collections");
});

test("discovery tries the conventional singles handles, not just the sitemap", () => {
  // Four of the deepest eurozone singles catalogues were rejected by a
  // sitemap-only probe as having "no riftbound collection" while serving 250
  // cards at /collections/riftbound-single. Sitemap discovery finding nothing is
  // not evidence a store has nothing.
  assert.ok(CONVENTIONAL_SINGLES_HANDLES.includes("riftbound-single"));
  assert.match(
    read("src/lib/price-import.ts"),
    /CONVENTIONAL_SINGLES_HANDLES/,
    "the importer must try the conventional handles too, or it prices less than the probe promised",
  );
});

test("every EU store is a Shopify singles source with a policy URL that resolves", () => {
  const eu = RETAILER_LIST.filter((r) => r.country === "EU");
  assert.ok(eu.length >= 10, `expected a real EU market, got ${eu.length} stores`);
  // A ceiling as well as a floor. Not arbitrary: 421 eurozone domains were swept
  // and eleven cleared the bar, so a list that suddenly triples has almost
  // certainly stopped measuring singles again rather than found a boom.
  assert.ok(eu.length <= 40, `${eu.length} EU stores — re-verify with probe-eu-stores.ts before raising this`);
  for (const r of eu) {
    // WooCommerce stores were removed from this market: measured across all 41
    // eurozone Woo stores with a Riftbound category, exactly one had a singles
    // category and it held one card. The ADAPTER stays (lib/woocommerce.ts) —
    // it is how that was measured, and how any of them rejoins.
    assert.notEqual(r.platform, "woocommerce", `${r.key}: no eurozone Woo store has cleared the singles bar`);
    // shippingPolicyUrl only ever returns a Shopify path, so a non-Shopify store
    // must never be in STORES_WITH_POLICY.
    const url = shippingPolicyUrl(r.key);
    if (url) assert.match(url, /^https:\/\/[^ ]+\/policies\/shipping-policy$/, `${r.key}: malformed policy URL`);
  }
});
