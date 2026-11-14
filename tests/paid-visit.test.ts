import test from "node:test";
import assert from "node:assert/strict";
import { hasMark, paidMarkFor, tagHref } from "../src/lib/paid-visit";
import { classifyEntry } from "../src/lib/entry-source";
import { AD_TESTS, adTestRows, earnedBy, parseAdStats, verdictFor } from "../src/lib/earnings/ad-tests";

// The 2026-11-14 Meta tests: a paid visit's affiliate clicks carry `fbad` in their sub-id,
// so the earnings dashboard can sum what each ad earned (lib/paid-visit.ts).

test("only a paid landing gets a marker, by network", () => {
  assert.equal(paidMarkFor("?utm_source=facebook&utm_medium=paid&utm_campaign=rift-test-2026-11"), "fbad");
  assert.equal(paidMarkFor("?utm_source=instagram&utm_medium=cpc"), "fbad");
  assert.equal(paidMarkFor("?utm_source=reddit_ads"), "rdad");
  assert.equal(paidMarkFor("?utm_source=reddit"), null); // a free Reddit post is not an ad
  assert.equal(paidMarkFor("?utm_source=facebook"), null); // nor is an organic share
  assert.equal(paidMarkFor(""), null);
});

test("the marker is added to every sub-id and nothing else in the URL changes", () => {
  const ebay = "https://www.ebay.com/itm/123?mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339155912&toolid=10001&customid=rc-us-ebay-product&_trkparms=a%3Db";
  assert.equal(tagHref(ebay, "fbad"), ebay.replace("customid=rc-us-ebay-product", "customid=rc-us-ebay-product-fbad"));
  const tcg = "https://partner.tcgplayer.com/c/7385758/1780961/21018?subId1=dex-us-price&sharedid=dex-us-price&u=https%3A%2F%2Fwww.tcgplayer.com%2Fproduct%2F1";
  const t = tagHref(tcg, "fbad")!;
  assert.match(t, /subId1=dex-us-price-fbad&sharedid=dex-us-price-fbad&u=https%3A%2F%2Fwww\.tcgplayer\.com%2Fproduct%2F1$/);
  assert.equal(tagHref(t, "fbad"), null, "tagging twice changes nothing");
  assert.equal(tagHref("https://shop.example.com/p/1", "fbad"), null, "a plain store link is left alone");
});

test("a long sub-id stays within 60 characters and keeps the marker", () => {
  const long = "x".repeat(70);
  const out = tagHref(`https://www.amazon.com/dp/B0?tag=riftcompare-20&ascsubtag=${long}`, "fbad")!;
  const sub = new URL(out).searchParams.get("ascsubtag")!;
  assert.ok(sub.length <= 60);
  assert.ok(hasMark(sub, "fbad"));
});

test("the card engine's /go links get ad=<mark>", () => {
  assert.equal(tagHref("/go?u=https%3A%2F%2Fwww.ebay.com%2Fitm%2F1&s=ebay&m=US", "fbad"), "/go?u=https%3A%2F%2Fwww.ebay.com%2Fitm%2F1&s=ebay&m=US&ad=fbad");
  assert.equal(tagHref("/go?u=x&ad=fbad", "fbad"), null);
});

test("hasMark matches whole segments only", () => {
  assert.ok(hasMark("rc-us-ebay-fbad", "fbad"));
  assert.ok(hasMark("cyberpunk-us-fbad-card-12", "fbad"));
  assert.ok(!hasMark("rc-us-fbadge", "fbad"));
});

test("a paid Meta visit is an ads entry, not organic social", () => {
  assert.equal(classifyEntry("", "riftcompare.com", "?utm_source=facebook&utm_medium=paid"), "ads");
  assert.equal(classifyEntry("", "riftcompare.com", "?utm_source=facebook"), "social");
});


test("an ad test earns only its own site's sales that carry the marker, in its dates", () => {
  const dex = AD_TESTS.find((t) => t.site === "dex")!;
  const rows = [
    { day: "2026-11-15", tag: "dex-us-price-fbad", currency: "AUD", cents: 500, pendingCents: 500, sales: 1 },
    { day: "2026-11-15", tag: "dex-us-price", currency: "AUD", cents: 900, pendingCents: 0, sales: 1 }, // organic
    { day: "2026-11-15", tag: "rc-us-ebay-fbad", currency: "AUD", cents: 700, pendingCents: 0, sales: 1 }, // Rift's ad
    { day: "2026-11-13", tag: "dex-us-price-fbad", currency: "AUD", cents: 300, pendingCents: 0, sales: 1 }, // before
    { day: "2026-11-24", tag: "dex-us-price-fbad", currency: "AUD", cents: 200, pendingCents: 0, sales: 1 }, // end + 3
    { day: "2026-11-25", tag: "dex-us-price-fbad", currency: "AUD", cents: 100, pendingCents: 0, sales: 1 }, // too late
  ];
  const e = earnedBy(dex, [rows], "AUD");
  assert.equal(e.cents, 700);
  assert.equal(e.sales, 2);
  assert.equal(e.pendingCents, 500);
});

test("the verdict rule", () => {
  assert.equal(verdictFor(null, 0).key, "no-data");
  assert.equal(verdictFor(500, 0).key, "too-early");
  assert.equal(verdictFor(1500, 100).key, "losing");
  assert.equal(verdictFor(2000, 150).key, "pause");
  assert.equal(verdictFor(2000, 1200).key, "close");
  assert.equal(verdictFor(2000, 2500).key, "profit");
});

test("posted stats are validated per known test", () => {
  const s = parseAdStats({ stats: { "dex-test-2026-11": { spend: "4.87", currency: "aud", linkClicks: 12, visitors: 9, delivery: "Active" }, "nope": { spend: 1 }, "rift-test-2026-11": { spend: -1 } } });
  assert.deepEqual(Object.keys(s), ["dex-test-2026-11"]);
  assert.equal(s["dex-test-2026-11"].spendCents, 487);
  assert.equal(s["dex-test-2026-11"].currency, "AUD");
  const rows = adTestRows(s, [[]], "AUD");
  const r = rows.find((x) => x.test.site === "dex")!;
  assert.equal(r.costPerClick, 487 / 12);
  assert.equal(r.verdict.key, "too-early");
});
