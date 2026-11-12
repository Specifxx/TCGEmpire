import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RIOT_DRAWINGS, drawingStatus, drawingWindow } from "../src/lib/riot-drawings";
import { classifySealed, isTrackableSealedTitle, ebaySealedWorthSearching } from "../src/lib/sealed-import";
import { SEALED_DRAWING_GROUP_NAME, sealedReportTarget } from "../src/lib/price-report";
import { msrpCents } from "../src/lib/msrp";
import { ARTICLES } from "../src/lib/articles";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Riot's 2026 drawing products (owner, 2026-11-04): the K/DA Couture Collection
// and the Worlds 2026 Edition. Drawing-only, like the T1 collection, so each
// needs the whole chain the T1 tests pin for that product: a title gate, its own
// product type, an eBay seed with a keyword and a floor, a published RRP, Riot's
// own name and image on the tile, and a homepage row near the top.
// ─────────────────────────────────────────────────────────────────────────────

test("both products classify as their own types, from the titles sellers and Riot use", () => {
  for (const t of [
    "Riftbound x K/DA: Couture Collection",
    "Riftbound x K/DA Couture Collection English Box Guaranteed",
    "Riftbound KDA Couture Collection Sealed Box",
  ]) {
    assert.equal(classifySealed(t), "K/DA Couture Collection", t);
    assert.ok(isTrackableSealedTitle(t), `${t} must be captured as sealed`);
  }
  for (const t of [
    "Riftbound x Worlds 2026 Edition",
    "Riftbound 2026 Worlds Bundle Sealed",
    "Riftbound Worlds 2026 Bundle - Yasuo Legend + 3 Battlefields",
  ]) {
    assert.equal(classifySealed(t), "Worlds 2026 Edition", t);
    assert.ok(isTrackableSealedTitle(t), `${t} must be captured as sealed`);
  }
});

test("a K/DA single, a K/DA accessory and last year's Worlds product are never one of these boxes", () => {
  for (const t of [
    // The catalogue's own K/DA cards, and the collection's cards sold loose.
    "Riftbound K/DA Ahri, Confident SP1/005 Radiance NM",
    "Riftbound K/DA Ahri Nine-Tailed Fox Legend promo card",
    "Riftbound Radiance Evelynn, Agony's Embrace 153/167",
    "Riftbound Yasuo Unforgiven Worlds 2026 promo card",
    // Accessories with the collection's name on them.
    "Riftbound x K/DA Couture Collection Playmat only",
    "Riftbound K/DA Couture Collection deck box",
    // The 2025 Worlds product and the T1 bundle are other products.
    "Riftbound T1 2025 Worlds Champion Player Bundle",
    "Riftbound Worlds 2025 Bundle",
  ]) {
    const type = classifySealed(t);
    const captured = isTrackableSealedTitle(t);
    assert.ok(
      !captured || (type !== "K/DA Couture Collection" && type !== "Worlds 2026 Edition"),
      `${t} → ${type} (captured: ${captured})`,
    );
  }
  assert.equal(classifySealed("Riftbound T1 2025 Worlds Champion Player Bundle"), "T1 Player Bundle");
});

test("each product keeps an eBay search, a keyword, a floor, a US RRP and a mirrored report name", () => {
  const ebay = read("src/lib/ebay.ts");
  for (const d of RIOT_DRAWINGS) {
    assert.equal(ebaySealedWorthSearching(d.productType), true, `${d.productType} must keep its eBay search`);
    assert.ok(ebay.includes(`"${d.productType}"`), `${d.productType} needs a SEALED_TYPE_KW + SEALED_MIN_CENTS entry`);
    assert.equal(msrpCents(d.productType, "US"), d.priceUsd * 100, `${d.productType}'s US RRP is Riot's price`);
    assert.equal(msrpCents(d.productType, "AU"), null, "Riot publishes no other currency");
    assert.equal(SEALED_DRAWING_GROUP_NAME[d.groupKey], d.name, "price-report.ts mirrors Riot's name");
    assert.equal(
      sealedReportTarget(d.groupKey, { title: "Riftbound KDA box SEALED ships fast!!", productType: d.productType, setCode: null }).name,
      d.name,
    );
  }
});

test("the importer seeds, names and pictures the groups from lib/riot-drawings.ts", () => {
  const src = read("src/lib/sealed-import.ts");
  assert.match(src, /const RIOT_DRAWING_SEEDS = RIOT_DRAWINGS\.map/);
  assert.match(src, /\.\.\.RIOT_DRAWING_SEEDS\.filter\(\(s\) => !haveKeys\.has\(s\.groupKey\)\)/);
  assert.match(src, /const drawingImg = RIOT_DRAWING_IMAGE\[g\.groupKey\];\s*if \(drawingImg\) \{\s*g\.imageUrl = drawingImg;\s*imgRank\.set\(g\.groupKey, 0\);/);
  assert.match(src, /const drawingName = RIOT_DRAWING_NAME\[g\.groupKey\];\s*if \(drawingName\) g\.name = drawingName;/);
  // The K/DA and Worlds rules sit above the T1 and generic Bundle rules: "Worlds
  // 2026 Bundle" carries the bare word "bundle".
  const kda = src.indexOf('return "K/DA Couture Collection"');
  const t1 = src.indexOf('return "T1 Signature Edition"');
  const generic = src.indexOf('return "Bundle"');
  assert.ok(kda > 0 && kda < t1 && t1 < generic);
  // Riot's CDN, which next.config.js already allows for card art.
  for (const d of RIOT_DRAWINGS) assert.match(d.imageUrl, /^https:\/\/cmsassets\.rgpub\.io\//);
  assert.match(read("next.config.js"), /hostname: "cmsassets\.rgpub\.io"/);
});

test("drawing dates are Riot's, and the status chip follows them", () => {
  const [kda, w26] = RIOT_DRAWINGS;
  assert.deepEqual(kda.drawing, { opens: "2026-10-27", closes: "2026-10-30", emails: "2026-11-03" });
  assert.deepEqual(w26.drawing, { opens: "2026-11-13", closes: "2026-11-16", emails: "2026-11-17" });
  assert.equal(kda.priceUsd, 150);
  assert.equal(w26.priceUsd, 80);
  assert.equal(drawingStatus(w26, "2026-11-04"), "upcoming");
  assert.equal(drawingStatus(w26, "2026-11-13"), "open");
  assert.equal(drawingStatus(w26, "2026-11-16"), "open");
  assert.equal(drawingStatus(w26, "2026-11-17"), "closed");
  assert.equal(drawingStatus(kda, "2026-11-04"), "closed");
  assert.equal(drawingWindow(w26), "13–16 November 2026");
  assert.equal(drawingWindow(kda), "27–30 October 2026");
});

test("the drawings row is off both homes now the events are over (owner, 2026-11-12), and its components stay pure", () => {
  for (const f of ["src/app/page.tsx", "src/components/home/RegionHome.tsx"]) assert.doesNotMatch(read(f), /<RiotDrawingsRow/, f);
  const row = read("src/components/home/RiotDrawingsRow.tsx");
  assert.doesNotMatch(row, /from "@\/lib\/db"|prisma\./, "a server component with no query");
  const tiles = read("src/components/home/RiotDrawingTiles.tsx");
  assert.match(tiles, /^"use client";/);
  assert.match(tiles, /<SealedTile group=\{hit\.group\} currency=\{hit\.currency\} \/>/, "the product IS the sealed tile, whose click opens the quick view");
  const post = ARTICLES.find((a) => a.slug === RIOT_DRAWINGS[0].blogSlug);
  assert.ok(post && !post.draft, "the post the row links is published");
  for (const d of RIOT_DRAWINGS) assert.equal(d.blogSlug, post!.slug);
  assert.ok(post!.tags.includes("news"));
});

test("each product is an item in every market before any resale row exists", () => {
  // Owner, 2026-11-05: "It must be listed as an item". computeAllSealedGroups
  // synthesises the group from lib/riot-drawings.ts when the table has no row
  // for it, so the tile, /sealed/<slug> and the quick view exist from day one.
  const src = read("src/lib/sealed-import.ts");
  assert.match(src, /for \(const d of RIOT_DRAWINGS\) \{\s*if \(groups\.has\(d\.groupKey\)\) continue;\s*groups\.set\(d\.groupKey, \{[\s\S]{0,600}?listings: \[\],/);
  // Before the image/name override loops, so Riot's render and name still win.
  assert.ok(src.indexOf("for (const d of RIOT_DRAWINGS) {") < src.indexOf("const drawingImg = RIOT_DRAWING_IMAGE[g.groupKey]"));
});

test("an art book or a loose Couture card never becomes the box (eBay SG and UK, 2026-11-05)", () => {
  // Both were taken as the US$150 box by the first pass.
  for (const t of [
    "LoL League of Legends Riftbound K/DA Couture Art Book Concept Art Collection",
    "Preorder - Riftbound K/DA Akali Couture Collection KDA-004s-005 (Confirmed)",
  ]) {
    assert.equal(isTrackableSealedTitle(t), false, t);
  }
  const ebay = read("src/lib/ebay.ts");
  assert.match(ebay, /SEALED_EXCLUDE_EBAY_BASE =\s*\/[^\n]*art\\s\*book\|concept\\s\*art\|\\bKDA-\\d\{3\}/);
  // The real box still passes.
  assert.ok(isTrackableSealedTitle("Riftbound K/DA Couture Collection Premium Set - SHIPS STRAIGHT TO YOU FROM RIOT"));
});
