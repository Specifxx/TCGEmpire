import test from "node:test";
import assert from "node:assert/strict";

import { GET } from "../src/app/ads.txt/route";
import { ADSENSE_CLIENT_ID, ADSENSE_PUB_ID, ADSENSE_CLIENT_ID_PATTERN } from "../src/lib/adsense";

// The AdSense console reported riftcompare.com's ads.txt as "Not found" because
// the path fell through to the App Router's HTML shell: a 200, but text/html
// with a whole page in the body, which the crawler reads as zero valid records.
// These assertions pin all three properties that made it invalid — status,
// content type and exact body — plus the derivation that keeps the seller id
// locked to the loader script's client id.

test("ads.txt returns 200", () => {
  assert.equal(GET().status, 200);
});

test("ads.txt is served as plain text, not HTML", () => {
  assert.equal(GET().headers.get("content-type"), "text/plain; charset=utf-8");
});

test("ads.txt is cacheable for an hour", () => {
  assert.equal(GET().headers.get("cache-control"), "public, max-age=3600");
});

test("ads.txt body is exactly the Google DIRECT record", async () => {
  const body = await GET().text();
  assert.equal(body, `google.com, ${ADSENSE_PUB_ID}, DIRECT, f08c47fec0942fa0\n`);
});

test("ads.txt body contains no HTML", async () => {
  const body = await GET().text();
  assert.ok(!/[<>]/.test(body), "ads.txt must not contain markup");
});

test("the seller id is the client id with ca- stripped", () => {
  assert.ok(ADSENSE_CLIENT_ID_PATTERN.test(ADSENSE_CLIENT_ID), "client id must match the AdSense id format");
  assert.equal(ADSENSE_PUB_ID, ADSENSE_CLIENT_ID.slice("ca-".length));
  assert.ok(/^pub-\d{16}$/.test(ADSENSE_PUB_ID));
});

test("each ads.txt record has the four required IAB fields", async () => {
  const body = await GET().text();
  for (const line of body.trim().split("\n")) {
    const fields = line.split(",").map((f) => f.trim());
    assert.equal(fields.length, 4, `"${line}" must have 4 comma-separated fields`);
    assert.match(fields[2], /^(DIRECT|RESELLER)$/);
  }
});
