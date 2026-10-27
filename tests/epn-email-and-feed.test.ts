import test from "node:test";
import assert from "node:assert/strict";

import { ebayAffiliateUrl, plainEbayUrl } from "../src/lib/affiliate";
import { buildGradedWatchEmail, buildAuctionAlertEmail } from "../src/lib/watch-emails";
import { buildEbayDealsFeed, ebayFeedUrl } from "../src/lib/ebay-deals-feed";
import type { CheapestOnEbayItem } from "../src/lib/arbitrage";

// EPN counts email as messaging, which needs its advance approval: the eBay
// links in our emails go out without our tracking (DECISIONS.md, 2026-10-27).
test("plainEbayUrl strips EPN tracking from eBay links and leaves others alone", () => {
  const tagged = ebayAffiliateUrl("https://www.ebay.com/itm/123456?var=1", "email");
  assert.match(tagged, /campid=/);
  const plain = plainEbayUrl(tagged);
  assert.doesNotMatch(plain, /campid|mkevt|mkcid|mkrid|customid|toolid/);
  assert.match(plain, /ebay\.com\/itm\/123456/);
  assert.match(plain, /var=1/);
  assert.equal(plainEbayUrl("https://riftcompare.com/card/x?campid=1"), "https://riftcompare.com/card/x?campid=1");
  assert.equal(plainEbayUrl("not a url"), "not a url");
});

test("graded-watch and auction emails carry no EPN campaign", () => {
  const url = ebayAffiliateUrl("https://www.ebay.com/itm/987654", "email");
  const g = buildGradedWatchEmail({
    watchId: "w",
    cardName: "Jinx",
    cardUrl: "https://riftcompare.com/card/jinx",
    grade: "PSA 10",
    market: "US",
    currency: "USD",
    priceCents: 12000,
    referenceCents: 15000,
    listingTitle: "Jinx PSA 10",
    listingUrl: url,
    checkedAt: new Date("2026-10-27T00:00:00Z"),
    actions: null,
  });
  assert.doesNotMatch(g.html, /campid/);
  assert.doesNotMatch(g.text, /campid/);
  assert.match(g.html, /ebay\.com\/itm\/987654/);
  const a = buildAuctionAlertEmail(
    [{ cardName: "Jinx", cardUrl: "https://riftcompare.com/card/jinx", market: "US", currency: "USD", currentBidCents: 500, bidCount: 2, endsAt: new Date(Date.now() + 3_600_000), title: "Jinx", url }],
    { stop: "https://riftcompare.com/s", snooze: "https://riftcompare.com/z" } as never,
  );
  assert.doesNotMatch(a.html, /campid/);
  assert.doesNotMatch(a.text, /campid/);
});

const item = (over: Partial<CheapestOnEbayItem> = {}): CheapestOnEbayItem => ({
  cardId: "c1",
  ebayCents: 450,
  postageKnown: true,
  url: "https://www.ebay.com/itm/1",
  storeCents: 900,
  gapCents: 450,
  ebayKey: "ebay_us",
  card: { id: "c1", slug: "jinx-loose-cannon", name: "Jinx & <Co>", setCode: "OGN", collectorNumber: "1", imageThumbUrl: null },
  ...over,
});

test("the eBay deals feed links our card pages, escapes, and skips cards without a page", () => {
  const xml = buildEbayDealsFeed("https://riftcompare.com", "AU", [item(), item({ cardId: "c2", card: { ...item().card, id: "c2", slug: null } })], new Date("2026-10-27T05:00:00Z"));
  assert.match(xml, /^<\?xml/);
  assert.equal((xml.match(/<item>/g) ?? []).length, 1);
  assert.match(xml, /<link>https:\/\/riftcompare\.com\/card\/jinx-loose-cannon\?utm_source=rss&amp;utm_medium=ebay-deals<\/link>/);
  assert.match(xml, /Jinx &amp; &lt;Co&gt;/);
  assert.doesNotMatch(xml, /ebay\.com\/itm/, "a feed never links eBay directly");
  assert.match(xml, /delivered/);
  assert.match(xml, /feeds\/ebay-deals\.xml\?market=AU/);
  assert.equal(ebayFeedUrl("", "US"), "/feeds/ebay-deals.xml");
});

import { gradedGuideRows, gradedMultiple } from "../src/lib/graded-guide";

test("the graded guide ranks by PSA 10 first, skips unknown cards and compares with raw", () => {
  const cards = new Map([
    ["a", { id: "a", slug: "a-1", name: "Ahri", setName: "Origins", collectorNumber: "1" }],
    ["b", { id: "b", slug: "b-2", name: "Zed", setName: "Origins", collectorNumber: "2" }],
  ]);
  const day = { day: "2026-10-27", currency: "USD" as const, basis: "", prices: { a: { "PSA 10": 10000, "BGS 9.5": 20000 }, b: { "BGS 10": 50000 }, ghost: { "PSA 10": 99999 } } };
  const rows = gradedGuideRows(day, cards, new Map([["a-1", 2000]]));
  assert.deepEqual(rows.map((r) => r.card.id), ["b", "a"]);
  assert.equal(rows[1].top.grade, "PSA 10");
  assert.equal(gradedMultiple(rows[1]), "5.0×");
  assert.equal(gradedMultiple(rows[0]), null);
  assert.deepEqual(gradedGuideRows(null, cards, new Map()), []);
});

import { lotVerdict, parseAskCents } from "../src/lib/lot-check";

test("the lot checker reads prices and calls a lot cheaper, even or dearer", () => {
  assert.equal(parseAskCents("$1,234.50"), 123450);
  assert.equal(parseAskCents("12,50"), 1250);
  assert.equal(parseAskCents("40"), 4000);
  assert.equal(parseAskCents("abc"), null);
  assert.equal(parseAskCents("0"), null);
  assert.deepEqual(lotVerdict(8000, 10000), { kind: "cheaper", diffCents: 2000, pct: 20 });
  assert.equal(lotVerdict(10300, 10000)?.kind, "even");
  assert.equal(lotVerdict(13000, 10000)?.kind, "dearer");
  assert.equal(lotVerdict(100, 0), null);
});

import { parseFeedDeals, telegramDealsMessage } from "../src/lib/telegram-deals";

test("the Telegram post reads the deals feed and links our pages, never eBay", () => {
  const xml = buildEbayDealsFeed("https://riftcompare.com", "US", [item()], new Date("2026-10-27T05:00:00Z"));
  const deals = parseFeedDeals(xml);
  assert.equal(deals.length, 1);
  assert.equal(deals[0].title.startsWith("Jinx & <Co>"), true);
  assert.match(deals[0].link, /^https:\/\/riftcompare\.com\/card\/jinx-loose-cannon\?utm_source=telegram&utm_medium=ebay-deals$/);
  const msg = telegramDealsMessage(deals, "United States", "https://riftcompare.com")!;
  assert.match(msg, /Jinx &amp; &lt;Co&gt;/);
  assert.match(msg, /href="https:\/\/riftcompare\.com\/card\/jinx-loose-cannon\?utm_source=telegram&amp;utm_medium=ebay-deals"/);
  assert.doesNotMatch(msg, /ebay\.com/);
  assert.equal(telegramDealsMessage([], "United States", "https://riftcompare.com"), null);
});
