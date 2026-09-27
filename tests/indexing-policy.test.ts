import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  basePrintingOf,
  cardPolicy,
  corePathInSitemap,
  facetPolicy,
  INDEXING_REVIEW_MODE,
  isPrivatePath,
  REVIEW_STORE_MIN_IN_STOCK,
  robotsMeta,
  staticPathPolicy,
  storePolicy,
  type PrintingFields,
} from "../src/lib/indexing-policy";
import { cardPriceSummary } from "../src/lib/content/card-price-summary";
import { articlesMentioning } from "../src/lib/content/card-articles";
import { keywordsOnCard } from "../src/lib/keywords";

const read = (p: string) => readFileSync(p, "utf8");

test("ADSENSE_REVIEW_MODE defaults on", () => {
  // No env var set in the test run.
  assert.equal(INDEXING_REVIEW_MODE, process.env.ADSENSE_REVIEW_MODE ? INDEXING_REVIEW_MODE : true);
});

test("facet pages: noindex during review, threshold otherwise", () => {
  assert.deepEqual(facetPolicy(500, true), { index: false, sitemap: false });
  assert.deepEqual(facetPolicy(500, false), { index: true, sitemap: true });
  assert.deepEqual(facetPolicy(2, false), { index: false, sitemap: false });
});

test("store pages need 25 in-stock listings during review", () => {
  assert.equal(REVIEW_STORE_MIN_IN_STOCK, 25);
  assert.equal(storePolicy(24, true).index, false);
  assert.equal(storePolicy(25, true).index, true);
  assert.equal(storePolicy(24, false).index, true, "normal threshold is 5");
  assert.equal(storePolicy(-1, true).index, true, "unknown count stays indexed");
});

const c = (id: string, over: Partial<PrintingFields> = {}): PrintingFields => ({
  id, slug: id, name: "Jinx, Loose Cannon", setCode: "OGN", collectorNumber: "001/298", rarity: "Epic", variant: null, isPromo: false, ...over,
});

test("a special printing canonicalises to its base printing, preferring the same set", () => {
  const base = c("base");
  const otherSetBase = c("sfd-base", { setCode: "SFD" });
  const promo = c("promo", { isPromo: true });
  const sig = c("sig", { collectorNumber: "299*/298" });
  const showcase = c("showcase", { rarity: "Showcase", setCode: "SFD" });
  const all = [otherSetBase, base, promo, sig, showcase];
  assert.equal(basePrintingOf(promo, all)?.id, "base");
  assert.equal(basePrintingOf(sig, all)?.id, "base");
  assert.equal(basePrintingOf(showcase, all)?.id, "sfd-base");
  assert.equal(basePrintingOf(base, all), null, "a base printing has no base");
  assert.equal(basePrintingOf(promo, [promo, sig]), null, "no base printing → stays the card's page");
});

test("card policy: duplicates always noindex; variants and never-priced cards only during review", () => {
  const f = { isDuplicateRow: false, basePrinting: null, hasAnyPrice: true };
  assert.equal(cardPolicy(f, true).index, true);
  assert.equal(cardPolicy({ ...f, isDuplicateRow: true }, false).index, false);
  assert.equal(cardPolicy({ ...f, basePrinting: { id: "b" } }, true).index, false);
  assert.equal(cardPolicy({ ...f, basePrinting: { id: "b" } }, false).index, true);
  assert.equal(cardPolicy({ ...f, hasAnyPrice: false }, true).index, false);
  assert.equal(cardPolicy({ ...f, hasAnyPrice: false }, false).index, true);
});

test("private and review-only static paths", () => {
  for (const p of ["/premium", "/premium/start", "/login", "/portfolio", "/alerts/manage"]) assert.ok(isPrivatePath(p), p);
  assert.ok(!isPrivatePath("/premiumx"));
  assert.equal(corePathInSitemap("/premium"), false);
  assert.equal(corePathInSitemap("/blog"), true);
  assert.equal(staticPathPolicy("/auctions", true).index, false);
  assert.equal(staticPathPolicy("/auctions", false).index, true);
  assert.equal(staticPathPolicy("/cards/rarity", true).sitemap, false);
  assert.deepEqual(robotsMeta({ index: false, sitemap: false }), { robots: { index: false, follow: true } });
  assert.deepEqual(robotsMeta({ index: true, sitemap: true }), {});
});

test("every gated route asks the policy module instead of its own threshold", () => {
  for (const f of ["src/app/cards/type/[type]/page.tsx", "src/app/cards/rarity/[rarity]/page.tsx", "src/app/cards/printing/[printing]/page.tsx"]) {
    assert.match(read(f), /robotsMeta\(facetPolicy\(total\)\)/, f);
  }
  assert.match(read("src/app/stores/[slug]/page.tsx"), /robotsMeta\(storePolicy\(count\)\)/);
  assert.match(read("src/app/card/[id]/page.tsx"), /getCardIndexing\(card,/);
  assert.match(read("src/app/premium/page.tsx"), /robotsMeta\(PRIVATE_POLICY\)/);
  const sitemap = read("src/lib/sitemap-sections.ts");
  for (const fn of ["cardPolicy(", "facetPolicy(", "storePolicy(", "championPolicy(", "corePathInSitemap("]) assert.ok(sitemap.includes(fn), fn);
});

test("the paywall flag is separate from the indexing flag", () => {
  // lib/adsense.ts must not read the bare ADSENSE_REVIEW_MODE any more: turning
  // indexing review on must never lift the paywall.
  const adsense = read("src/lib/adsense.ts").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(adsense, /process\.env\.ADSENSE_REVIEW_MODE/);
});

test("price summary states only figures from the rows", () => {
  const rows = [
    { retailer: "a", retailerName: "Store A", priceCents: 1200, lastSeen: "2026-09-26T10:00:00Z" },
    { retailer: "b", retailerName: "Store B", priceCents: 900, lastSeen: "2026-09-27T08:00:00Z" },
  ];
  const s = cardPriceSummary({ name: "Jinx", place: "the United States", currency: "USD", inStock: rows, lastSeenCents: null, allRows: [...rows, { retailer: "c", retailerName: "C", priceCents: 1, lastSeen: null }] });
  assert.match(s, /lowest in-stock price for Jinx in the United States is US\$9\.00 at Store B/);
  assert.match(s, /range from US\$9\.00 to US\$12\.00/);
  assert.match(s, /track 3 stores/);
  assert.match(s, /last checked 27 Sept? 2026/);
  const none = cardPriceSummary({ name: "Jinx", place: "the United States", currency: "USD", inStock: [], lastSeenCents: null, allRows: [] });
  assert.equal(none, "No store in the United States lists Jinx right now.");
});

test("related articles only when the text actually mentions the card, champion or set", () => {
  const art = (slug: string, title: string, body: string, date = "2026-09-01") =>
    ({ slug, category: "blog", title, body, tags: [], date, excerpt: "", author: "x", readMins: 1 }) as never;
  const list = [art("a", "Jinx deck guide", "…"), art("b", "Market report", "Jinx, Loose Cannon spiked"), art("c", "Unrelated", "nothing")];
  const got = articlesMentioning({ cardName: "Jinx, Loose Cannon", champion: "Jinx", setName: "Origins" }, 3, list);
  assert.deepEqual(got.map((g) => g.slug), ["b", "a"]);
});

test("keywordsOnCard reads the printed bracket marker", () => {
  assert.ok(keywordsOnCard("[Tank] When I attack…").some((k) => k.slug === "tank"));
  assert.equal(keywordsOnCard(null).length, 0);
  assert.equal(keywordsOnCard("no keywords here").length, 0);
});
