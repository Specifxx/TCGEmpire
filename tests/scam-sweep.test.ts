import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain .mjs
import { score, verdict, buildDenylist, pageSignals } from "../scripts/scam-sweep.mjs";

test("TCGShopUK-style evidence plus a young domain hides", () => {
  const s = score({ evidence: { reviews: 14, oneStarPct: 86, rating: 2.2, nonDelivery: true }, age: 40 });
  assert.equal(verdict(s), "hide");
});
test("one noisy signal alone never hides a real shop", () => {
  assert.equal(verdict(score({ flags: [{ kind: "no-contact" }] })), "ok");
  assert.notEqual(verdict(score({ evidence: { reviews: 20, oneStarPct: 70 } })), "ok");
  assert.equal(verdict(score({ evidence: { reviews: 20, oneStarPct: 70 } })), "watch");
});
test("a verified shop is never above watch", () => {
  const s = score({ verified: true, evidence: { reviews: 14, oneStarPct: 86, nonDelivery: true }, ai: { risk: 100 } });
  assert.ok(s.score < 40);
});
test("denylist: auto entries follow the flag and overrides", () => {
  const banned = [{ domain: "a.com", why: "x" }];
  const hidden = [{ domain: "b.com", why: "y", at: "t" }];
  assert.deepEqual(buildDenylist({ banned, hidden, overrides: [], autohide: true }).map((d: { domain: string }) => d.domain), ["a.com", "b.com"]);
  assert.deepEqual(buildDenylist({ banned, hidden, overrides: [], autohide: false }).map((d: { domain: string }) => d.domain), ["a.com"]);
  assert.deepEqual(buildDenylist({ banned, hidden, overrides: [{ domain: "b.com" }], autohide: true }).map((d: { domain: string }) => d.domain), ["a.com"]);
  assert.equal(buildDenylist({ banned, hidden, overrides: [{ domain: "a.com" }], autohide: true }).length, 2); // banned is never overridden
});
test("page text signals", () => {
  assert.ok(pageSignals("Pay a delivery insurance fee, contact us on WhatsApp").length >= 2);
  assert.equal(pageSignals("Welcome to our friendly card shop").length, 0);
});
