// Weekly store vetting (scripts/store-vetting.mjs, docs/store-vetting.md): reads
// every site's store registry and checks each store's domain from the outside.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hostsIn, domainOf, judgePage, ageDays, trustpilotFrom, vetHost, issueBody, SITES } from "../scripts/store-vetting.mjs";
import { flag } from "../scripts/reports-triage.mjs";

test("hostsIn takes store bases and site values, never marketplaces or CDNs", () => {
  const src = `{ base: "https://www.cherry.com.au", collections: [] }, site: "jbhifi.com.au", img: "https://cdn.shopify.com/x.png",
    ebay: "https://www.ebay.com.au/sch", "base": "https://shop.foo.co.uk"`;
  assert.deepEqual(hostsIn(src).sort(), ["cherry.com.au", "jbhifi.com.au", "shop.foo.co.uk"]);
});

test("domainOf keeps two-label suffixes", () => {
  assert.equal(domainOf("shop.example.com.au"), "example.com.au");
  assert.equal(domainOf("www.example.co.uk"), "example.co.uk");
  assert.equal(domainOf("store.example.com"), "example.com");
});

test("judgePage: blocked is never dead; parked and moved are red; no contact is a look", () => {
  assert.equal(judgePage({ status: 403, host: "a.com", finalHost: null, body: "" }).state, "blocked");
  assert.equal(judgePage({ status: 200, host: "a.com", finalHost: null, body: "<p>Just a moment</p><script src=/cdn-cgi/challenge-platform/x>" }).state, "blocked");
  const parked = judgePage({ status: 200, host: "a.com", finalHost: "a.com", body: "This domain is for sale! Buy this domain" });
  assert.ok(parked.flags!.some((f) => f.kind === "parked" && f.red));
  const moved = judgePage({ status: 200, host: "a.com", finalHost: "b.net", body: '<a href="mailto:x@b.net">' });
  assert.ok(moved.flags!.some((f) => f.kind === "moved" && f.red));
  assert.equal(judgePage({ status: 200, host: "a.com", finalHost: "shop.a.com", body: "<a href=\"mailto:x@a.com\">" }).flags!.length, 0);
  const bare = judgePage({ status: 200, host: "a.com", finalHost: "a.com", body: "x".repeat(3000) });
  assert.ok(bare.flags!.some((f) => f.kind === "no-contact" && !f.red));
});

test("ageDays and trustpilotFrom read what they can and null the rest", () => {
  const now = Date.parse("2026-11-02T00:00:00Z");
  assert.equal(ageDays({ events: [{ eventAction: "registration", eventDate: "2026-10-03T00:00:00Z" }] }, now), 30);
  assert.equal(ageDays(null, now), null);
  assert.deepEqual(trustpilotFrom('{"ratingValue":"1.8","reviewCount":"240"}'), { rating: 1.8, reviews: 240 });
  assert.equal(trustpilotFrom("<html>no reviews</html>"), null);
});

test("a banned store is red without any network call", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("no network"); }) as typeof fetch;
  try {
    const r = await vetHost("tcgsynergy.myshopify.com", new Set(["tcgsynergy.myshopify.com"]));
    assert.ok(r.flags.some((f: { kind: string; red: boolean }) => f.kind === "banned" && f.red));
  } finally {
    globalThis.fetch = real;
  }
});

test("the banned list carries TCG Synergy, and every site's registry is listed", () => {
  const banned = JSON.parse(readFileSync("data/store-vetting/banned.json", "utf8")) as { domain: string }[];
  assert.ok(banned.some((b) => b.domain === "tcgsynergy.myshopify.com"));
  for (const s of ["riftcompare", "opcompare", "mtgcompare", "dexcompare", "gundamcompare", "lorcanacompare", "ygocompare", "cyberpunkcompare", "wargamecompare", "figurecompare", "kaeyoung", "camcompare", "compareempire"]) assert.ok(s in SITES, s);
});

test("the issue lists domains only, red first", () => {
  const body = issueBody(
    [
      { host: "bad.com", flags: [{ kind: "parked", red: true, detail: "parked" }], state: "ok" },
      { host: "new.com", flags: [{ kind: "young", red: false, detail: "domain registered 20 days ago" }], state: "ok" },
      { host: "fine.com", flags: [], state: "ok" },
    ],
    { riftcompare: ["bad.com", "new.com", "fine.com"] },
  );
  assert.ok(body.indexOf("bad.com") < body.indexOf("new.com"));
  assert.ok(!body.includes("fine.com"));
});

test("a store-trust report is flagged ahead of everything", () => {
  const out = flag([
    { kind: "wrong-price", product: "A", store: "S", at: "2026-11-02T00:00:00Z" },
    { kind: "other", issue: "store-problem", store: "Shady", note: "never shipped", at: "2026-11-02T00:00:00Z" },
  ], Date.parse("2026-11-02T01:00:00Z"));
  assert.equal(out[0].store, "Shady");
  assert.ok(out[0].attention);
});
