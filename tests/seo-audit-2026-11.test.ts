// SEO audit (2026-11-03): the region homes carry the homepage's share image, and
// card and product thumbnails name the card even where aria-hidden keeps a
// screen reader from reading the name twice (image search reads alt).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOME_OG_IMAGE, regionHomeMetadata } from "../src/lib/seo";

test("every region home names an og:image and a large twitter card", () => {
  for (const c of ["AU", "CA", "UK", "EU", "SG"] as const) {
    const meta = regionHomeMetadata(c);
    const og = meta.openGraph as { images?: string[] } | undefined;
    assert.deepEqual(og?.images, [HOME_OG_IMAGE], c);
    assert.equal((meta.twitter as { card?: string } | undefined)?.card, "summary_large_image", c);
  }
  assert.match(HOME_OG_IMAGE, /\/opengraph-image\.jpg$/);
  assert.ok(readFileSync("src/app/opengraph-image.jpg").length > 0);
});

test("card and product thumbnails beside their names carry the name as alt", () => {
  for (const f of [
    "src/components/price-guide/PriceGuideRows.tsx",
    "src/components/BanListTable.tsx",
    "src/components/SearchBar.tsx",
    "src/components/home/RecentlyViewedRail.tsx",
    "src/app/market/records/page.tsx",
    "src/app/pokemon/sealed/[slug]/page.tsx",
  ]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /<img\b[^>]*\balt=""/, f);
  }
});
