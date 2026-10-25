import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { metalKindOf, titleFitsMetal } from "../src/lib/metal-cards";
import { listingMatchesCard } from "../src/lib/ebay";
import { cardCredentials } from "../src/lib/card-name";

test("metal kind comes from the card's tags", () => {
  assert.equal(metalKindOf("metal,prize wall"), "Prize Wall");
  assert.equal(metalKindOf("Metal, Best Of"), "Best Of");
  assert.equal(metalKindOf("summoner skirmish"), null);
  assert.equal(metalKindOf(null), null);
});

test("a metal listing fits only a metal card, and only its own kind when the title names one", () => {
  assert.equal(titleFitsMetal("Ahri Nine-Tailed Fox Metal Prize Wall Riftbound", "Prize Wall"), true);
  assert.equal(titleFitsMetal("Ahri Nine-Tailed Fox Metal Best Of Riftbound", "Prize Wall"), false);
  assert.equal(titleFitsMetal("Riftbound Ahri metal card", "Best Of"), true, "a title naming neither kind fits both");
  assert.equal(titleFitsMetal("Ahri Nine-Tailed Fox 255/298 Riftbound", "Prize Wall"), false);
  assert.equal(titleFitsMetal("Ahri Nine-Tailed Fox Metal Prize Wall", null), false, "a base card refuses metal listings");
  assert.equal(titleFitsMetal("Ahri Nine-Tailed Fox 255/298", null), true);
});

test("eBay identity: the base card never takes a metal listing, the metal card takes it", () => {
  const base = { name: "Ahri, Nine-Tailed Fox", setCode: "OGN", number: "255", total: "298", isSignature: false, isPromo: false };
  const metal = { ...base, isPromo: true, metal: "Prize Wall" as const };
  const metalListing = { title: "Riftbound Ahri, Nine-Tailed Fox 255/298 Metal Prize Wall", price: { value: "4000" } };
  const plainListing = { title: "Riftbound Ahri, Nine-Tailed Fox 255/298 Origins", price: { value: "3" } };
  assert.equal(listingMatchesCard(metalListing, base), false);
  assert.equal(listingMatchesCard(metalListing, metal), true);
  assert.equal(listingMatchesCard(plainListing, metal), false);
  assert.equal(listingMatchesCard(plainListing, base), true);
});

test("a metal card is labelled by its kind, not as a plain promo", () => {
  assert.deepEqual(cardCredentials({ isPromo: true, tags: "metal,best of", collectorNumber: "255/298", rarity: "Rare" }), ["Metal Best Of"]);
  assert.deepEqual(cardCredentials({ isPromo: true, collectorNumber: "085/167", rarity: "Rare" }), ["Promo"]);
});

test("manual-cards: every metal card is a promo linked to its own TCGplayer product, with a unique slug", () => {
  const rows = JSON.parse(readFileSync(join(process.cwd(), "prisma/manual-cards.json"), "utf8")) as { externalId?: string; isPromo?: boolean; tags?: string; slug?: string }[];
  const metal = rows.filter((r) => metalKindOf(r.tags));
  assert.ok(metal.length >= 86, `${metal.length} metal cards`);
  for (const r of metal) {
    assert.equal(r.isPromo, true, r.externalId);
    assert.match(r.externalId ?? "", /^tcg-\d+$/, "priced by its own TCGplayer product, never by number");
  }
  const slugs = metal.map((r) => r.slug).filter(Boolean);
  assert.equal(new Set(slugs).size, slugs.length);
  const ids = rows.map((r) => r.externalId).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, "externalIds are unique");
});

test("a metal card's title names its printing, inside 60 characters", async () => {
  const { cardTitle, titleFits } = await import("../src/lib/card-seo");
  const base = { name: "Teemo, Swift Scout", setName: "Origins", identCode: "OGN 263/298", hasPrice: true, kind: "promo" as const, type: "Legend" };
  const pw = cardTitle({ ...base, displayName: "Teemo, Swift Scout (Metal Prize Wall)", credentials: ["Metal Prize Wall"], printingWord: "Metal Prize Wall" });
  const bo = cardTitle({ ...base, displayName: "Teemo, Swift Scout (Metal Best Of)", credentials: ["Metal Best Of"], printingWord: "Metal Best Of" });
  assert.match(pw, /Metal Prize Wall/);
  assert.match(bo, /Metal Best Of/);
  assert.notEqual(pw, bo);
  assert.ok(titleFits(pw) && titleFits(bo), `${pw} / ${bo}`);
});
