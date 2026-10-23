import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { optOutFromQuery, shouldDropAnalytics } from "../src/lib/analytics-filter";

const base = { hostname: "riftcompare.com", userAgent: "Mozilla/5.0 (iPhone) Safari/604.1", webdriver: false, optedOut: false };

test("a real visitor on the live host is measured", () => {
  assert.equal(shouldDropAnalytics(base), false);
});

test("localhost, deployment URLs, webdriver, bots and the opted-out owner are dropped", () => {
  for (const hostname of ["localhost", "127.0.0.1", "tcg-empire-abc.vercel.app"]) assert.equal(shouldDropAnalytics({ ...base, hostname }), true, hostname);
  assert.equal(shouldDropAnalytics({ ...base, webdriver: true }), true);
  for (const userAgent of ["Googlebot/2.1", "Mozilla/5.0 HeadlessChrome/120", "AhrefsBot", "Chrome-Lighthouse"]) assert.equal(shouldDropAnalytics({ ...base, userAgent }), true, userAgent);
  assert.equal(shouldDropAnalytics({ ...base, optedOut: true }), true);
});

test("?notrack=1 opts out, ?notrack=0 opts back in, nothing else touches it", () => {
  assert.equal(optOutFromQuery("?notrack=1"), "1");
  assert.equal(optOutFromQuery("?a=b&notrack=0"), "0");
  assert.equal(optOutFromQuery("?notrack=yes"), null);
  assert.equal(optOutFromQuery(""), null);
});

test("Analytics mounts once, from the root layout, with beforeSend", () => {
  const c = readFileSync("src/components/ConsentGatedAnalytics.tsx", "utf8");
  assert.match(c, /<Analytics beforeSend=\{beforeSend\} \/>/);
  assert.equal((readFileSync("src/app/layout.tsx", "utf8").match(/<ConsentGatedAnalytics \/>/g) || []).length, 1);
});
