import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { misfiledSetLess, setLessGroupKey, setLessSlugRedirect, titleGroupKey } from "../src/lib/sealed-import";
import { sealedSlug } from "../src/lib/sealed-slug";

// ONE GROUP FOR GIFT OF THE RIFT (2026-11-19, DECISIONS.md). Real store titles from the 19 Nov sealed listings: they
// were filed under eight title-derived groups, so each page had a store or two and TCG Prices took none of them.

const STORE_TITLES = [
  "Riftbound: League of Legends TCG - Gift of the Rift Bundle",
  "League of Legends Riftbound - Gift of the Rift Bundle",
  "PRE-ORDER Riftbound League of Legends TCG Gift of the Rift Bundle",
  "Riftbound Gift of the Rift Bundle",
  "Riftbound Gift of the Rift Bundle (Dec 2026)",
  "Riftbound Gift of the Rift Bundle [EN] Pre-Order",
  "Riftbound Gift of the Rift Bundle - PREORDER",
  "Riftbound League of Legends Gift of the Rift Bundle (Ships Dec 4)",
  "Gift of the Rift Bundle (Vendetta promos)",
];

test("every store title of the bundle lands on the TCGplayer row's own group", () => {
  assert.equal(titleGroupKey("Gift of the Rift Bundle"), "giftoftheriftbundle"); // TCGplayer's product name
  for (const t of STORE_TITLES) assert.equal(titleGroupKey(t), "giftoftheriftbundle", t);
});

test("a case, a lot, several bundles or a promo card alone is not the bundle", () => {
  for (const t of [
    "Riftbound Gift of the Rift Bundle Case",
    "Riftbound Gift of the Rift Bundle x2",
    "2x Riftbound Gift of the Rift Bundle",
    "Gift of the Rift Bundle Lot",
    "Riftbound Gift of the Rift Akali Promo",
  ]) assert.equal(setLessGroupKey(t), null, t);
  assert.equal(titleGroupKey("Riftbound Spiritforged Booster Box"), "riftboundspiritforgedboosterbox");
});

test("the old title-derived slugs 301 to the one page; the page and other products never redirect", () => {
  for (const old of [
    "riftboundleagueoflegendstcggiftoftherift",
    "leagueoflegendsriftboundgiftoftheriftbun",
    "preorderriftboundleagueoflegendstcggifto".replace("gifto", "giftoftherift"),
    "riftboundgiftoftheriftbundledec2026",
    "riftboundgiftoftheriftbundleenpreorder",
    "riftboundgiftoftheriftbundlepreorder",
    "riftboundleagueoflegendsgiftoftheriftbun",
  ]) assert.equal(setLessSlugRedirect(old), "giftoftheriftbundle", old);
  assert.equal(setLessSlugRedirect(sealedSlug("giftoftheriftbundle")), null);
  assert.equal(setLessSlugRedirect("ogn-booster-box"), null);
  assert.equal(setLessSlugRedirect("riftboundgiftoftheriftbundlecase"), null);
});

test("the sealed page redirects a moved slug before it 404s", () => {
  const page = readFileSync("src/app/sealed/[slug]/page.tsx", "utf8");
  assert.match(page, /setLessSlugRedirect\(params\.slug\)[\s\S]*permanentRedirect[\s\S]*notFound\(\)/);
});

// ONE GROUP FOR THE SECRET GARDEN BUNDLE (2026-11-26, DECISIONS.md). Real titles from the 25 Nov sealed export, filed
// under four groups: TCGplayer's, Cardmarket's, Tier Zero's and (two that say "Unleashed") the Unleashed Bundle page.
test("every Secret Garden title lands on TCGplayer's Secret Garden Box page, never the Unleashed Bundle's", () => {
  for (const t of [
    "Secret Garden Box", // TCGplayer's product name: its page's URL stays
    "Secret Garden Box Set", // Cardmarket EU
    "Riftbound Secret Garden Gift Box Set  - Event Exclusive Sealed", // Tier Zero Games UK
    "Riftbound Unleashed Secret Garden Bundle English", // SpellNexus EU, was on UNL|Bundle
    "Riftbound Secret Garden Bundle NIB Unleashed", // eBay US, was on UNL|Bundle
  ]) {
    assert.equal(titleGroupKey(t), "secretgardenbox", t);
    assert.equal(misfiledSetLess(t, "UNL|Bundle"), true, t);
  }
  assert.equal(misfiledSetLess("Riftbound Unleashed Bundle", "UNL|Bundle"), false);
  for (const t of ["Riftbound Secret Garden Bundle Case", "2x Riftbound Secret Garden Bundle", "Secret Garden Ultrasoft Poro Promo"]) {
    assert.equal(setLessGroupKey(t), null, t);
  }
});

test("the old Secret Garden slugs 301 to its one page", () => {
  for (const old of ["secretgardenboxset", "riftboundsecretgardengiftboxseteventexcl"]) assert.equal(setLessSlugRedirect(old), "secretgardenbox", old);
  assert.equal(setLessSlugRedirect("secretgardenbox"), null);
});

test("the eBay sealed pass refuses a set-less product answering another group's search", () => {
  const src = readFileSync("src/lib/sealed-import.ts", "utf8");
  assert.match(src, /searchEbaySealed\([\s\S]{0,200}if \(!r\) continue;[\s\S]{0,2500}misfiledSetLess\(r\.title, g\.groupKey\)[\s\S]{0,200}continue;/);
});
