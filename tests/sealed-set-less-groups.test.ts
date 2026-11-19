import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setLessGroupKey, setLessSlugRedirect, titleGroupKey } from "../src/lib/sealed-import";
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
