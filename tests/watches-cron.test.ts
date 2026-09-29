import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { isPremiumClickSource, TIP_SURFACES, WATCH_GATE_SURFACES } from "../src/lib/premium-surface";
import { TIER_COMPARISON } from "../src/components/TierComparisonTable";
import { DECK_WATCH_LIMIT, SEALED_WATCH_LIMIT_PLUS } from "../src/lib/alert-limits";
import { PREMIUM_COPY_VERSION } from "../src/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// "Premium works while you're away" (2026-09-29): the cron wiring, the tier
// copy, and the in-context discovery lines — inline, never a popup.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

test("the paid alert step runs AFTER the sealed import, and the paid route runs the three passes independently", () => {
  const wf = read(".github/workflows/refresh-prices.yml");
  const sealedImport = wf.indexOf("- name: Import sealed products");
  const paid = wf.indexOf("- name: Paid price alerts");
  assert.ok(sealedImport > 0 && paid > sealedImport, "the sealed watches read the groups the sealed import just wrote");
  const route = read("src/app/api/cron/price-alerts/paid/route.ts");
  assert.match(route, /runPriceAlerts\(\{\}, \{ scope: "paid" \}\)/);
  assert.match(route, /await runDeckWatches\(\{ sendCap: afterCards \}\)[\s\S]*\.catch\(failed\)/, "a failed deck pass is reported, not fatal to the others");
  assert.match(route, /await runSealedWatches\(\{ sendCap: afterDecks, freshen: fresh \? bustSealedGroups : undefined \}\)[\s\S]*\.catch\(failed\)/);
  assert.match(route, /decks, sealed \}/, "every pass's summary is in the response");
  // The deck run reads only entitled owners' rows and prices each with one bounded listing read.
  const deck = read("src/lib/deck-watch.ts");
  assert.match(deck, /premiumUntil: \{ gt: now \}/, "the read is trimmed to paid owners");
  assert.match(deck, /isPremium\(user, "premium"\)/, "…and the Premium minimum is the real check");
  assert.match(deck, /loadStoreListings\(\[\.\.\.wanted\.keys\(\)\], opts\.market, Object\.keys\(stores\), db\)/, "Best Basket's own listing read");
  assert.match(deck, /optimizeBasket\(cards, stores\)/, "…and its optimiser");
  assert.match(deck, /basketStoresFor\(opts\.market, postageOptionsFrom\(/, "…with the measured postage for the saved delivery");
  const sealed = read("src/lib/sealed-watch.ts");
  assert.match(sealed, /isPremium\(user\)/, "any paid tier");
  assert.match(sealed, /sealedWatchCeiling\(premiumTierOf\(user\)\)/, "the Plus cap (and Premium's sanity ceiling) is honoured in the run too");
});

test("the tier table carries both watches before Ad-free, from the constants; the copy version is bumped", () => {
  const features = TIER_COMPARISON.map((r) => r.feature);
  const sealed = TIER_COMPARISON.find((r) => r.feature.startsWith("Sealed watches"))!;
  const deck = TIER_COMPARISON.find((r) => r.feature.startsWith("Deck price watch"))!;
  assert.ok(sealed && deck);
  assert.deepEqual([sealed.account, sealed.plus, sealed.premium], [false, `Up to ${SEALED_WATCH_LIMIT_PLUS}`, "Unlimited"]);
  assert.deepEqual([deck.account, deck.plus, deck.premium], [false, false, true]);
  assert.ok(features.indexOf(sealed.feature) < features.indexOf(deck.feature) && features.indexOf(deck.feature) === features.length - 2);
  assert.equal(features[features.length - 1], "Ad-free experience");
  assert.equal(PREMIUM_COPY_VERSION, "premium-2026-09-29");
  // Every surface that quotes a watch number reads the constant.
  for (const f of ["src/components/PremiumPricingCards.tsx", "src/app/premium/page.tsx", "src/app/llms.txt/route.ts", "src/lib/email.ts", "src/lib/articles.ts", "src/app/watching/page.tsx"]) {
    assert.match(read(f), /DECK_WATCH_LIMIT/, `${f} quotes the deck watch limit from the constant`);
    assert.match(read(f), /SEALED_WATCH_LIMIT_PLUS/, `${f} quotes the sealed watch limit from the constant`);
  }
  assert.match(read("src/components/PremiumPricingCards.tsx"), /Works while you're away: deck price watch, unlimited target alerts, the store-by-store plan/);
  // The definitions a newcomer needs, on /premium.
  const page = read("src/app/premium/page.tsx");
  assert.match(page, /q: "I'm new — what do I actually get\?"/);
  assert.match(page, /q: "What is a deck price watch\?"/);
  assert.match(page, /q: "What is a sealed watch\?"/);
  assert.match(page, /RRP is the price Riot sets/);
  assert.match(page, /item price plus postage/);
  assert.match(page, /riftcompare-premium-explained/, "the long read is linked");
  assert.equal(DECK_WATCH_LIMIT, 10);
});

test("the discovery lines are inline — no Dialog, no overlay, no portal — and render only for a signed-in non-member", () => {
  const tip = code("src/components/DiscoveryTip.tsx");
  assert.doesNotMatch(tip, /Dialog|createPortal|position:\s*fixed|\bfixed\b|z-overlay|z-modal|role="dialog"/, "an inline line, never a popup");
  assert.match(tip, /if \(!loaded \|\| !user \|\| dismissed\) return null;/, "nothing for a signed-out visitor, or before the session is known");
  assert.match(tip, /const has = tier === "plus" \? premium : premium && mine === "premium";\s*if \(has\) return null;/, "nothing for a member who has the tier");
  assert.match(tip, /<p\s/, "a paragraph in the page's flow");
  assert.match(tip, /localStorage\.setItem\(key, "1"\)/, "dismissable, remembered per browser");
  assert.match(tip, /<PremiumButton tier=\{tier\} surface=\{surface\}/, "the same button every gate uses, attributed to its placement");
  // Every placement uses a registered surface, and each registered surface is placed.
  const used = new Set<string>();
  for (const f of walk(join(ROOT, "src"))) {
    const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
    for (const m of src.matchAll(/surface="(tip:[a-z0-9-]+)"/g)) used.add(m[1]!);
  }
  for (const s of TIP_SURFACES) {
    assert.ok(isPremiumClickSource(s), `${s} is accepted`);
    assert.ok(used.has(s), `${s} is placed somewhere`);
  }
  for (const s of used) assert.ok((TIP_SURFACES as readonly string[]).includes(s), `${s} is registered in lib/premium-surface.ts`);
  for (const s of WATCH_GATE_SURFACES) assert.ok(isPremiumClickSource(s));
  assert.match(code("src/components/DeckWatchForm.tsx"), /<PremiumButton surface="gate:deck-watch" \/>/);
  assert.match(code("src/components/SealedWatchButton.tsx"), /tier="plus" surface="gate:sealed-watch"/);
  // The placements the owner asked for: /sealed, the sealed quick view, the Best Basket result, /watching, the card watch button.
  assert.match(code("src/app/sealed/page.tsx"), /<DiscoveryTip id="sealed" surface="tip:sealed" tier="plus"/);
  // The quick view is an overlay whose watch button already sells Plus: no second, tip line there.
  assert.doesNotMatch(code("src/components/SealedQuickView.tsx"), /DiscoveryTip|tip:sealed-quickview/);
  assert.match(code("src/components/SealedQuickView.tsx"), /<SealedWatchButton /);
  assert.match(code("src/components/BestBasket.tsx"), /surface="tip:basket" tier="premium"/);
  assert.match(code("src/app/watching/page.tsx"), /surface="tip:watching"/);
  assert.match(code("src/components/PriceWatchButton.tsx"), /Plus adds your own target price and sealed-product watches; Premium watches a whole deck/);
  // The /watching explainer teaches all three kinds, inline.
  const watching = code("src/app/watching/page.tsx");
  assert.match(watching, /data-watch-explainer/);
  for (const k of ["Cards", "Sealed products", "A whole deck"]) assert.match(watching, new RegExp(`<strong className="text-white">${k}</strong>`));
  // The welcome checklist's watch step names what the paid tiers watch.
  assert.match(code("src/components/WelcomeChecklist.tsx"), /Plus also watches sealed products/);
});

test("the watch buttons never nest a button in a button, and sell the right tier below it", () => {
  const tile = code("src/components/SealedTile.tsx");
  const buttonAt = tile.indexOf("<button");
  const watchAt = tile.indexOf("<SealedWatchButton");
  assert.ok(watchAt >= 0 && watchAt < buttonAt, "the heart is a sibling before the tile's button, never inside it");
  const btn = code("src/components/SealedWatchButton.tsx");
  assert.match(btn, /if \(!user \|\| !premium\) \{/, "below Plus, the same spot sells Plus");
  assert.match(btn, /e\.stopPropagation\(\)/, "a tap on the heart never opens the quick view");
  const form = code("src/components/DeckWatchForm.tsx");
  assert.match(form, /const isPremium = !!user && premium && tier === "premium";/, "Plus is not enough for a deck watch");
  assert.match(form, /friendlyTargetCents\(totalCents\)/, "the default target is today's total rounded down");
});
