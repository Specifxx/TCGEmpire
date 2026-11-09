import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_LIVE_PER_SITE, WEEK_MS, amountFor, cleanUrl, startFor, validateAd } from "../src/lib/sister-ads/core";

const good = { weeks: 2, title: "Charizard ex 151 PSA 10", destUrl: "https://www.ebay.com/itm/123456789012", imageUrl: "https://i.ebayimg.com/a.jpg", region: "US", email: "Seller@Example.com", terms: true };

test("US$100 a week, 1 to 4 weeks", () => {
  assert.equal(amountFor(1), 10_000);
  assert.equal(amountFor(4), 40_000);
  for (const weeks of [0, 5, 1.5, "x"]) assert.equal(validateAd({ ...good, weeks }).ok, false);
  assert.equal(validateAd({ ...good, weeks: 3 }).ok, true);
});

test("a link may point anywhere public over https, nowhere else", () => {
  assert.ok(cleanUrl("https://example.com/shop?x=1"));
  assert.ok(cleanUrl("https://www.ebay.com.au/itm/117507452881"));
  for (const bad of ["http://example.com", "javascript:alert(1)", "https://localhost/a", "https://127.0.0.1/a", "https://10.0.0.1/", "https://user:pw@example.com/", "https://example.com:8443/", "https://intranet/", "https://[::1]/", "not a url", "https://" + "a".repeat(900) + ".com"]) {
    assert.equal(cleanUrl(bad), null, bad);
  }
});

test("text is plain: tags and control characters are stripped, lengths capped, email lower-cased", () => {
  const v = validateAd({ ...good, title: "<script>alert(1)</script> Big sale\n\n now", blurb: "x".repeat(500) });
  assert.ok(v.ok);
  if (v.ok) {
    assert.doesNotMatch(v.ad.title, /[<>]/);
    assert.ok(v.ad.blurb!.length <= 140);
    assert.equal(v.ad.email, "seller@example.com");
  }
  assert.equal(validateAd({ ...good, email: "nope" }).ok, false);
  assert.equal(validateAd({ ...good, region: "MARS" }).ok, false);
  assert.equal(validateAd({ ...good, title: "hi" }).ok, false);
});

test("an approved ad starts at once while a slot is free, else when the earliest ends", () => {
  const now = 1_000_000_000_000;
  assert.equal(startFor(now, []), now);
  assert.equal(startFor(now, [now + WEEK_MS, now + 2 * WEEK_MS]), now);
  const full = Array.from({ length: MAX_LIVE_PER_SITE }, (_, i) => now + (i + 1) * WEEK_MS);
  assert.equal(startFor(now, full), now + WEEK_MS);
  assert.equal(startFor(now, [...full, now - 5]), now + WEEK_MS); // ended ads never count
});
