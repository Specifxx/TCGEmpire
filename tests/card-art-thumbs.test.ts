import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cardArtThumb, cardImageSrcSet, cardThumbProps, CARD_ART_THUMB_WIDTHS } from "../src/lib/card-image-url";
import { buildCardOrderBy } from "../src/lib/cards";

const DIR = join(process.cwd(), "public/card-art");
const STEM = "ogn-001-298-8de89b4b8fb3186d";

test("every mirrored card-art file has its 320w and 480w thumbnails (npm run images:thumbs)", () => {
  const sources = readdirSync(DIR).filter((f) => f.endsWith(".webp") && !/-\d+w\.webp$/.test(f));
  assert.ok(sources.length > 900);
  const missing = sources.flatMap((f) =>
    CARD_ART_THUMB_WIDTHS.map((w) => f.replace(/\.webp$/, `-${w}w.webp`)).filter((t) => !existsSync(join(DIR, t))),
  );
  assert.deepEqual(missing, []);
});

test("srcset offers 320w, 480w and the 744w original for mirrored art only", () => {
  assert.equal(
    cardImageSrcSet(`/card-art/${STEM}.webp`),
    `/card-art/${STEM}-320w.webp 320w, /card-art/${STEM}-480w.webp 480w, /card-art/${STEM}.webp 744w`,
  );
  assert.equal(cardArtThumb(`/card-art/${STEM}.webp`), `/card-art/${STEM}-320w.webp`);
  // Never a thumbnail of a thumbnail, and nothing for art we do not mirror.
  assert.equal(cardImageSrcSet(`/card-art/${STEM}-320w.webp`), null);
  assert.equal(cardImageSrcSet("/radiance-spoilers/x.png"), null);
  assert.equal(cardImageSrcSet("https://i.ebayimg.com/x.jpg"), null);
  assert.equal(cardImageSrcSet(null), null);
});

test("cardThumbProps maps a raw CDN thumbnail URL onto the mirror's small rendition", () => {
  const p = cardThumbProps({ imageThumbUrl: `https://cdn.riftscribe.gg/cards/thumbnails/large/${STEM}.webp` }, "28px");
  assert.equal(p.src, `/card-art/${STEM}-320w.webp`);
  assert.match(p.srcSet ?? "", /480w/);
  assert.equal(p.sizes, "28px");
  assert.deepEqual(cardThumbProps({ imageThumbUrl: "/foo.png" }, "28px"), { src: "/foo.png", srcSet: undefined, sizes: undefined });
});

test("grid/list thumbnails never render a raw imageThumbUrl as their src", () => {
  const files = [
    "src/components/SearchBar.tsx", "src/components/MostSearchedStrip.tsx", "src/components/HoldingsGrid.tsx",
    "src/components/MyCollection.tsx", "src/components/IndexConstituents.tsx", "src/components/PriceWatch.tsx",
    "src/components/CardSearch.tsx", "src/components/BestBasket.tsx", "src/components/TradeCalculator.tsx",
    "src/components/DeckBuilder.tsx", "src/app/market/page.tsx", "src/app/tools/demand/page.tsx",
    "src/app/tools/rising/page.tsx", "src/app/tools/deal-finder/page.tsx", "src/app/market/records/page.tsx",
    "src/components/ArticleTopValue.tsx", "src/components/TodaysTopDeals.tsx", "src/components/Riftle.tsx",
    "src/app/admin/rising/page.tsx", "src/app/c/[token]/page.tsx", "src/app/games/page.tsx",
  ];
  for (const f of files) assert.doesNotMatch(readFileSync(f, "utf8"), /<img\s+src=\{[\w.]*imageThumbUrl\}/, f);
  // CardImage offers the thumbnails; the card-page hero (full, no sizes) keeps the full file.
  const ci = readFileSync("src/components/CardImage.tsx", "utf8");
  assert.match(ci, /cardImageSrcSet\(src\)/);
  assert.match(ci, /!full \|\| sizesProp/);
});

test("/browse defaults to Most popular; ?sort=number still means set & number", () => {
  assert.deepEqual(buildCardOrderBy("popular", "US").slice(0, 2), [{ searchCount: "desc" }, { viewCount: "desc" }]);
  assert.deepEqual(buildCardOrderBy("number", "US"), [{ setCode: "asc" }, { collectorNumber: "asc" }]);
  assert.deepEqual(buildCardOrderBy(undefined, "US"), [{ setCode: "asc" }, { collectorNumber: "asc" }]);
  const page = readFileSync("src/app/browse/page.tsx", "utf8");
  assert.match(page, /const BROWSE_DEFAULT_SORT = "popular"/);
  assert.match(page, /buildCardOrderBy\(searchParams\.sort \|\| BROWSE_DEFAULT_SORT/);
});

// Below 768px since the eBay column (2026-09-26, "The homepage's eBay column"):
// the six-column table is wider than the 640–767px band's scroller.
test("homepage price table stacks below 768px with the price in every row", () => {
  const s = readFileSync("src/components/home/PriceTodayTable.tsx", "utf8");
  assert.match(s, /<ul className="[^"]*md:hidden">/);
  assert.match(s, /<div className="hidden overflow-x-auto md:block">/);
});

test("card page: phone buy block under the name, sticky bar hidden while the comparison is on screen", () => {
  const page = readFileSync("src/app/card/[id]/page.tsx", "utf8");
  assert.ok(page.indexOf("<CardTopBuy") < page.indexOf("<CardPriceMetrics"));
  const bar = readFileSync("src/components/CardMobileBuy.tsx", "utf8");
  assert.match(bar, /computeMarket\(rows, country\)/);
  assert.match(bar, /getElementById\(PRICE_TABLE_ID\)/);
  assert.match(readFileSync("src/components/CardMarketSection.tsx", "utf8"), /id="price-comparison"/);
});
