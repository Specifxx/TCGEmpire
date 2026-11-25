import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dropText, isStoreRetailer, priceGap, shareText, shareUrl } from "../src/lib/share-link";

test("dropText: the cheapest store's real price and name, pre-orders labelled, or nothing", () => {
  const fmt = (c: number) => `C$${(c / 100).toFixed(2)}`;
  assert.equal(dropText("Box", { priceCents: 15999, retailerName: "Shop" }, "Canada", fmt), "Box for C$159.99 at Shop, the cheapest store price we found in Canada. Every store compared on RiftCompare:");
  assert.match(dropText("Box", { priceCents: 1, retailerName: "S" }, "Canada", fmt, true)!, /^Pre-order: /);
  assert.equal(dropText("X", null, "Canada", fmt), null);
  assert.deepEqual(["ebay", "tcgplayer", "amazon-us", "cherry"].map(isStoreRetailer), [false, false, false, true]);
  assert.equal(shareUrl("https://riftcompare.com", "/sealed/x", "drop"), "https://riftcompare.com/sealed/x?utm_source=share&utm_medium=drop");
});

// Word of mouth (DECISIONS.md, "Share buttons and shared lists").
test("every shared link carries utm_source=share and its medium, keeping the page's own query", () => {
  assert.equal(shareUrl("https://riftcompare.com", "/card/x", "card"), "https://riftcompare.com/card/x?utm_source=share&utm_medium=card");
  assert.equal(shareUrl("https://riftcompare.com", "/deck?list=abc", "deck"), "https://riftcompare.com/deck?list=abc&utm_source=share&utm_medium=deck");
});

test("the price gap needs two sellers and a real spread", () => {
  const g = priceGap([{ priceCents: 1000, retailerName: "eBay" }, { priceCents: 400, retailerName: "Store" }])!;
  assert.equal(g.pct, 60);
  assert.equal(g.low.retailerName, "Store");
  assert.equal(priceGap([{ priceCents: 400, retailerName: "A" }, { priceCents: 900, retailerName: "A" }]), null);
  assert.equal(priceGap([{ priceCents: 400, retailerName: "A" }]), null);
  assert.match(shareText("Jinx", g, (c) => `$${c / 100}`), /\$4 at Store, up to \$10 elsewhere \(60% less\)/);
});

test("share buttons, the arrival counter and the robots allow are wired in", () => {
  assert.match(fs.readFileSync("src/app/card/[id]/page.tsx", "utf8"), /<ShareButton responsive name=\{displayName\} rows=\{rows\}/);
  assert.match(fs.readFileSync("src/components/QuickView.tsx", "utf8"), /<ShareButton /);
  assert.match(fs.readFileSync("src/app/layout.tsx", "utf8"), /<ShareArrival \/>/);
  assert.match(fs.readFileSync("src/app/robots.ts", "utf8"), /"\/\*utm_source=share"/);
  assert.match(fs.readFileSync("src/app/deck/page.tsx", "utf8"), /robots: \{ index: false, follow: true \}/);
});

// Share-for-a-deal (owner, 2026-11-18).
import { pickShareArm } from "../src/lib/share-link";
test("the share-for-a-deal arm is drawn once, half and half, and kept", () => {
  assert.equal(pickShareArm(null, 0.2), "reward");
  assert.equal(pickShareArm(null, 0.8), "plain");
  assert.equal(pickShareArm("reward", 0.8), "reward");
});
test("guides and set pages share tagged links", () => {
  assert.match(fs.readFileSync("src/components/ArticleShare.tsx", "utf8"), /shareUrl\(clean, "", "guide"\)/);
  assert.match(fs.readFileSync("src/app/sets/[set]/page.tsx", "utf8"), /<ShareButton [^>]*medium="set"/);
});

// Invite links (owner, 2026-11-18): a member's share carries their code after the #.
import { inviteCodeFrom, withInvite } from "../src/lib/share-link";
import { REFERRAL_PREMIUM_DAYS, REFERRED_PREMIUM_DAYS } from "../src/lib/premium-days";

test("withInvite puts a valid code after the # and leaves the query (the CDN key) alone", () => {
  const url = "https://riftcompare.com/card/x?utm_source=share&utm_medium=card";
  assert.equal(withInvite(url, "clabc123xyz"), `${url}#r=clabc123xyz`);
  assert.equal(withInvite(url, null), url);
  assert.equal(withInvite(url, "bad code!"), url);
});

test("inviteCodeFrom reads ?ref= first, then #r=, and refuses junk", () => {
  assert.equal(inviteCodeFrom("?ref=clabc123xyz", ""), "clabc123xyz");
  assert.equal(inviteCodeFrom("?utm_source=share", "#r=clzzz999aaa"), "clzzz999aaa");
  assert.equal(inviteCodeFrom("", "#r=<script>"), null);
  assert.equal(inviteCodeFrom("", ""), null);
});

test("both sides of an invite get the owner's week (2026-11-18)", () => {
  assert.equal(REFERRAL_PREMIUM_DAYS, 7);
  assert.equal(REFERRED_PREMIUM_DAYS, 7);
});
