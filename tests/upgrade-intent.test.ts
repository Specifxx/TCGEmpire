import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UPGRADE_FEATURES, featureForSurface, tierRequiredFor, upgradeContext } from "../src/lib/upgrade-intent";

// upgrade_dialog_open / upgrade_cta_click (2026-10-22, DECISIONS.md "Upgrade-intent events").

test("surfaces map onto the feature vocabulary", () => {
  assert.equal(featureForSurface("limit:basket"), "best_basket");
  assert.equal(featureForSurface("gate:deal-finder"), "deal_finder");
  assert.equal(featureForSurface("gate:rising"), "rising");
  assert.equal(featureForSurface("limit:watchlist"), "watchlist_limit");
  assert.equal(featureForSurface("limit:portfolio"), "portfolio_limit");
  assert.equal(featureForSurface("gate:sealed-watch"), "sealed_watch");
  assert.equal(featureForSurface("gate:deck-watch"), "deck_watch");
  assert.equal(featureForSurface("gate:demand"), "demand_finder");
  assert.equal(featureForSurface("gate:price-history"), "price_history");
  assert.equal(featureForSurface("gate:target-limit"), "target_alerts");
  assert.equal(featureForSurface("nav:navbar"), "other");
  assert.equal(featureForSurface(undefined), "other");
  for (const f of UPGRADE_FEATURES) assert.ok(["plus", "premium"].includes(tierRequiredFor(f)));
  assert.equal(tierRequiredFor("best_basket"), "premium");
  assert.equal(tierRequiredFor("deal_finder"), "plus");
});

test("the properties carry no personal data", () => {
  const ctx = upgradeContext("limit:basket", "us", true);
  assert.deepEqual(Object.keys(ctx).sort(), ["feature", "market", "signed_in", "tier_required"]);
  assert.equal(ctx.market, "US");
  // The events are built only from these four (+ plan and billing_period on a click).
  const src = readFileSync(new URL("../src/lib/upgrade-intent.ts", import.meta.url), "utf8");
  assert.match(src, /trackEvent\("upgrade_dialog_open", \{ \.\.\.ctx \}\)/);
  assert.match(src, /trackEvent\("upgrade_cta_click", \{ \.\.\.ctx, plan, billing_period: billingPeriod \}\)/);
});

test("the dialog, the inline prompts and every checkout click fire the events", () => {
  const read = (p: string) => readFileSync(new URL(`../src/components/${p}`, import.meta.url), "utf8");
  assert.match(read("PremiumDialog.tsx"), /trackUpgradeOpen\(upgradeContext\(surface/);
  assert.match(read("PremiumDialog.tsx"), /trackUpgradeCta\(clickContext\(!!user\), sellTier, selected\)/);
  assert.match(read("PremiumButton.tsx"), /trackUpgradeOpen\(upgradeContext\(surface, marketFromCookie\(\), signedIn\), \{ inline: true, surface \}\)/);
  assert.match(read("PremiumCta.tsx"), /trackUpgradeCta\(premiumPageContext\(true\), tier, plan\)/);
  assert.match(read("PremiumCta.tsx"), /trackUpgradeCta\(premiumPageContext\(false\), tier, plan\)/);
  // Vercel too: neither event is GA4-only.
  const analytics = readFileSync(new URL("../src/lib/analytics.ts", import.meta.url), "utf8");
  const ga4Only = analytics.slice(analytics.indexOf("GA4_ONLY_EVENTS = new Set(["), analytics.indexOf("]);", analytics.indexOf("GA4_ONLY_EVENTS")));
  assert.doesNotMatch(ga4Only, /upgrade_dialog_open|upgrade_cta_click/);
});
