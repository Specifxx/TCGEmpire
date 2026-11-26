import assert from "node:assert/strict";
import { test } from "node:test";
import { tagProblem, EPN_CAMPAIGN } from "../scripts/qa-guard/journeys";
import { buildId } from "../scripts/qa-guard/changed";
import { issueBody, signature } from "../scripts/qa-guard/issues";
import { SITES } from "../scripts/qa-guard/sites";

// The QA guard (docs/qa-guard.md, DECISIONS.md 2026-11-26).

test("qa guard: a paid link without our tag is a problem, a tagged one is not", () => {
  assert.equal(tagProblem(`https://www.ebay.com/itm/1?campid=${EPN_CAMPAIGN}&mkevt=1`), null);
  assert.match(tagProblem("https://www.ebay.com/sch/i.html?_nkw=x")!, /campid/);
  assert.match(tagProblem("https://www.ebay.com/itm/1?campid=123")!, /campid/);
  assert.equal(tagProblem("https://www.amazon.com/dp/B0?tag=riftcompare-20"), null);
  assert.match(tagProblem("https://www.amazon.com/dp/B0")!, /tag=/);
  assert.equal(tagProblem("https://partner.tcgplayer.com/c/7385758/1780961/21018?u=x"), null);
  assert.match(tagProblem("https://www.tcgplayer.com/product/1")!, /partner/);
  assert.equal(tagProblem("https://www.tcgplayer.com/massentry?productline=x"), null);
  assert.equal(tagProblem("https://somestore.com/products/x"), null, "an unpaid store row is fine");
});

test("qa guard: a build id is read from pages and app router chunks", () => {
  assert.equal(buildId('<script id="__NEXT_DATA__">{"buildId":"abc123"}</script>'), "abc123");
  assert.equal(buildId('<script src="/_next/static/XyZ12345/_buildManifest.js">'), "XyZ12345");
  assert.match(buildId('<script src="/_next/static/chunks/app/page-0123456789abcdef.js">')!, /0123456789abcdef/);
  assert.equal(buildId("<html></html>"), null);
});

test("qa guard: the issue signature ignores counts, so a repeat never re-pings", () => {
  const a = { site: "op", viewport: "phone", journey: 'search page sealed "booster box"', ok: false, level: "fail" as const, detail: "3 links" };
  const b = { ...a, detail: "5 links" };
  assert.equal(signature(a), signature(b));
  const body = issueBody("OP Compare", "Specifxx/OpCompare", [a], "run");
  assert.match(body, /qa-guard:signature /);
  assert.match(body, /Specifxx\/OpCompare/);
});

test("qa guard: every live site has a search, a product pattern and a fix repository", () => {
  const keys = new Set<string>();
  for (const s of SITES) {
    assert.ok(!keys.has(s.key), `${s.key} is listed once`);
    keys.add(s.key);
    assert.ok(s.searches.length, `${s.key} has a search`);
    assert.match(s.url, /^https:\/\/[^/]+$/, `${s.key} url is an origin`);
    assert.match(s.repo, /^[A-Za-z0-9-]+\/[A-Za-z0-9-]+$/);
    if (s.sealedProduct) assert.ok(s.searches.some((q) => q.kind === "sealed"));
  }
  for (const k of ["rift", "op", "dex", "mtg", "gundam", "lorcana", "ygo", "cyberpunk", "tcgprices", "singles", "ce", "ky", "scent"]) assert.ok(keys.has(k), `${k} is guarded`);
});
