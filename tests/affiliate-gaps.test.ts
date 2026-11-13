import { test } from "node:test";
import assert from "node:assert/strict";
import { addLink, classifyLink, emptyTally, knownProgramme, trackedShare } from "../src/lib/affiliate-gaps";

test("eBay counts only with our EPN campaign and a customid", () => {
  assert.equal(classifyLink("https://www.ebay.com/itm/1?mkevt=1&campid=5339155912&toolid=10001&customid=dex-us-item"), "ebay");
  assert.equal(classifyLink("https://www.ebay.com/itm/1?mkevt=1&campid=5339155912&toolid=10001"), "ebay-no-customid");
  assert.equal(classifyLink("https://www.ebay.com/itm/1?mkevt=1&campid=5339155912&customid="), "ebay-no-customid");
  assert.equal(classifyLink("https://www.ebay.com.au/sch/i.html?_nkw=x"), "ebay-untagged");
  assert.equal(classifyLink("https://www.ebay.co.uk/itm/1?campid=5339155911"), "ebay-untagged");
});

test("Amazon needs a tag; TCGplayer needs the Impact partner host", () => {
  assert.equal(classifyLink("https://www.amazon.com.au/s?k=x&tag=dexcompare-22"), "amazon");
  assert.equal(classifyLink("https://www.amazon.com/dp/B07D384KQG"), "amazon-untagged");
  assert.equal(classifyLink("https://partner.tcgplayer.com/c/7385758/1780961/21018?u=https%3A%2F%2Fwww.tcgplayer.com"), "tcgplayer");
  assert.equal(classifyLink("https://www.tcgplayer.com/product/652821"), "tcgplayer-untagged");
});

test("networks, family sites and non-shops", () => {
  assert.equal(classifyLink("https://www.awin1.com/cread.php?awinmid=90791&awinaffid=3144410"), "awin");
  assert.equal(classifyLink("https://t.cfjump.com/123/t/456?Url=x"), "network");
  assert.equal(classifyLink("https://compareempire.com/network"), "family");
  assert.equal(classifyLink("https://discord.gg/abc"), "ignore");
  assert.equal(classifyLink("https://www.dpreview.com/products/x"), "ignore");
  assert.equal(classifyLink("https://gameology.com.au/cart/1:1"), "store");
});

test("known programmes name where to apply", () => {
  assert.equal(knownProgramme("thegoodguys.com.au"), "Commission Factory");
  assert.equal(knownProgramme("fragrancex.com"), "CJ");
  assert.equal(knownProgramme("fragrancenet.com"), "FlexOffers");
  assert.equal(knownProgramme("yesstyle.com"), "Awin");
  assert.equal(knownProgramme("spellroogaming.com.au"), null);
});

test("a store we joined on Awin linked untracked is broken, not a gap", () => {
  const t = emptyTally("kaeyoung.com");
  addLink(t, "https://www.stylevana.com/en_US/x.html", ["stylevana.com"]);
  addLink(t, "https://www.yesstyle.com/en/list.html?q=x", ["stylevana.com"]);
  addLink(t, "https://www.ebay.com/itm/1?campid=5339155912&customid=rift-x", []);
  assert.equal(t.broken.length, 1);
  assert.equal(t.broken[0]!.kind, "awin-joined-untracked");
  assert.deepEqual(t.programmeGaps["yesstyle.com"], { network: "Awin", links: 1 });
  assert.equal(t.storeLinks, 1);
  assert.equal(trackedShare(t), 33);
});
