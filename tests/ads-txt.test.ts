import test from "node:test";
import assert from "node:assert/strict";

import { GET } from "../src/app/ads.txt/route";
import { ADSENSE_CLIENT_ID, ADSENSE_PUB_ID, ADSENSE_CLIENT_ID_PATTERN } from "../src/lib/adsense";
import { adsTxtProblems, googleAdsTxtLine } from "../scripts/ads-txt-check";

// The AdSense console reported riftcompare.com's ads.txt as "Not found" because
// the path fell through to the App Router's HTML shell: a 200, but text/html
// with a whole page in the body, which the crawler reads as zero valid records.
// These assertions pin all three properties that made it invalid — status,
// content type and body (the Google line first, then well-formed records) —
// plus the derivation that keeps the seller id locked to the loader script's
// client id.
//
// `npm test` runs node with `--env-file=.env.production` because lib/adsense.ts
// reads NEXT_PUBLIC_ADSENSE_CLIENT_ID at import time. `next build` loads that
// file itself; the bare node test runner does not, so without the flag these
// assertions fail on a clean checkout with a misleading "client id must match
// the AdSense id format" rather than "the variable isn't set".

test("ads.txt returns 200", () => {
  assert.equal(GET().status, 200);
});

test("ads.txt is served as plain text, not HTML", () => {
  assert.equal(GET().headers.get("content-type"), "text/plain; charset=utf-8");
});

test("ads.txt is cacheable for an hour", () => {
  assert.equal(GET().headers.get("cache-control"), "public, max-age=3600");
});

test("ads.txt body starts with the Google DIRECT record", async () => {
  const body = await GET().text();
  assert.equal(body.split("\n")[0], `google.com, ${ADSENSE_PUB_ID}, DIRECT, f08c47fec0942fa0`);
});

// A header-bidding partner's supply-chain records were pasted into
// PARTNER_RECORDS 2026-08-21 (see that file's own doc comment) — this pins
// the count so a future accidental truncation/duplication during an edit is
// caught, without hard-coding the partner list itself here.
test("ads.txt carries the partner records alongside the Google line", async () => {
  const body = await GET().text();
  const lines = body.trim().split("\n");
  assert.ok(lines.length > 400, `expected 400+ total records, got ${lines.length}`);
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

test("each ads.txt record has the three required IAB fields, and a fourth if present", async () => {
  const body = await GET().text();
  for (const line of body.trim().split("\n")) {
    // Per the IAB spec, "#" starts a trailing comment to end-of-line — several
    // of the partner records use one (e.g. tagging which reseller path a
    // record belongs to) and it is not part of the record's own fields.
    const record = line.split("#", 1)[0].trim();
    const fields = record.split(",").map((f) => f.trim());
    assert.ok(
      fields.length === 3 || fields.length === 4,
      `"${line}" must have 3 or 4 comma-separated fields (the 4th, certification authority id, is optional per the IAB spec)`
    );
    assert.match(fields[2], /^(DIRECT|RESELLER)$/, `"${line}" account type must be DIRECT or RESELLER`);
  }
});

// ── The live checks judge the body by the same rules ────────────────────────
// scripts/adsense-verify.ts and `adsense:guard --url` used to demand the body
// be EXACTLY the one Google line, so once the partner records landed
// (2026-08-21) both failed the correct production file — an invitation to
// "fix" ads.txt by deleting them (2026-09-26, "Blog and tools, joined up" in
// DECISIONS.md). Both now call scripts/ads-txt-check.ts; this pins that the
// checker passes what the route serves and still fails the real failures.

test("the live checks' validator passes exactly what the route serves", async () => {
  assert.deepEqual(adsTxtProblems(await GET().text(), ADSENSE_PUB_ID), []);
  // A file with only the Google line is valid too: the partner block is optional.
  assert.deepEqual(adsTxtProblems(`${googleAdsTxtLine(ADSENSE_PUB_ID)}\n`, ADSENSE_PUB_ID), []);
});

test("the live checks' validator still fails the ways ads.txt has actually broken", async () => {
  const served = await GET().text();
  const lines = served.split("\n");
  const fails = (body: string, why: string) => assert.ok(adsTxtProblems(body, ADSENSE_PUB_ID).length > 0, why);
  fails("<!DOCTYPE html><html><body>RiftCompare</body></html>\n", "the App Router's HTML shell (the original 'Not found')");
  fails([...lines.slice(1, 3), lines[0], ...lines.slice(3)].join("\n"), "the Google line not first");
  fails(served.replace(ADSENSE_PUB_ID, ADSENSE_PUB_ID.replace(/\d/g, "0")), "another account's seller id");
  fails(`${lines[0]}\nexample.com, 123\n`, "a record with too few fields");
  fails(`${lines[0]}\nexample.com, 123, SELLER, abc\n`, "an account type that is neither DIRECT nor RESELLER");
});
