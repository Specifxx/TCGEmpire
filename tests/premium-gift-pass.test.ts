import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GIFT_FEATURES, GIFT_PASS, buildGiftPassEmail, giftAudience, giftEndDay, giftPassOpen, giftPassUntil, giftSiteOf, type GiftUserRow } from "../src/lib/premium-gift-pass";
import { MARKETING_ALLOWED } from "../src/lib/email";
import { RIFT_BRAND, brandFromSignupSource } from "../src/lib/premium-brand";

// The 3-day Premium pass email (owner, 2026-11-27; DECISIONS.md "A 3-day Premium pass, emailed per site to free accounts").

const NOW = Date.UTC(2026, 10, 27, 14);
const row = (o: Partial<GiftUserRow> & { id: string }): GiftUserRow => ({
  email: `${o.id}@example.com`,
  displayName: "Sam Collector",
  isAdmin: false,
  premiumUntil: null,
  premiumTier: null,
  premiumTierFloor: null,
  emailVerified: new Date(NOW - 86_400_000),
  googleId: null,
  signupSource: null,
  priceDropEmailSentAt: null,
  ...o,
});

test("sends stop by themselves before the Week Pass test opens", () => {
  assert.equal(new Date(GIFT_PASS.sendUntil).toISOString(), "2026-12-01T12:00:00.000Z");
  assert.equal(giftPassOpen(NOW), true);
  assert.equal(giftPassOpen(GIFT_PASS.sendUntil), false);
  assert.ok(GIFT_PASS.sendUntil + GIFT_PASS.days * 86_400_000 < Date.UTC(2026, 11, 7));
});

test("the pass is 3 days and extend-only", () => {
  assert.equal(giftPassUntil(NOW, null), NOW + 3 * 86_400_000);
  const later = NOW + 30 * 86_400_000;
  assert.equal(giftPassUntil(NOW, later), later);
});

test("each account belongs to the site it was made on; OP and merged sites are left out", () => {
  assert.equal(giftSiteOf(null), "rift");
  assert.equal(giftSiteOf("email_link"), "rift");
  assert.equal(giftSiteOf("sister:dex"), "dex");
  assert.equal(giftSiteOf("sister:mtg:restock"), "mtg");
  assert.equal(giftSiteOf("sister:bandai"), null);
  assert.equal(giftSiteOf("sister:op"), null);
});

test("never paying, admins, seeds, unverified, opted out, already sent or recently emailed", () => {
  const rows = [
    row({ id: "ok1", signupSource: "sister:dex" }),
    row({ id: "pay", premiumUntil: new Date(NOW + 86_400_000) }),
    row({ id: "adm", isAdmin: true }),
    row({ id: "seed", email: "x@tcgempire.au" }),
    row({ id: "unv", emailVerified: null }),
    row({ id: "goog", emailVerified: null, googleId: "g1" }),
    row({ id: "out", signupSource: "sister:dex" }),
    row({ id: "done", signupSource: "sister:dex" }),
    row({ id: "recent", priceDropEmailSentAt: new Date(NOW - 3_600_000) }),
    row({ id: "lapsed", premiumUntil: new Date(NOW - 86_400_000), signupSource: "sister:mtg" }),
    row({ id: "dup", email: "OK1@example.com" }),
  ];
  const a = giftAudience(rows, { optedOut: new Set(["out@example.com"]), sent: new Set(["done"]), now: NOW });
  assert.deepEqual(a.pending.map((r) => r.id), ["ok1", "goog", "lapsed"]);
  assert.deepEqual(a.excluded, { paying: 1, admins: 1, seeds: 1, unverified: 1, optedOut: 1, recent: 1, otherSite: 0 });
  assert.deepEqual(a.bySite.dex, { pending: 1, sent: 1 });
  const dexOnly = giftAudience(rows, { optedOut: new Set(), sent: new Set(), site: "dex", now: NOW });
  assert.ok(dexOnly.pending.every((r) => r.site === "dex"));
});

test("a sister's email names only that site, never RiftCompare, and lists its own features", () => {
  for (const key of Object.keys(GIFT_FEATURES).filter((k) => k !== "rift")) {
    const brand = brandFromSignupSource(`sister:${key}`);
    assert.equal(brand.key, key);
    const m = buildGiftPassEmail({ brand, displayName: "Sam Collector", until: NOW + 3 * 86_400_000, unsubUrl: "https://riftcompare.com/api/premium-gift-pass/unsubscribe?token=t", oneClickUrl: "https://riftcompare.com/api/premium-gift-pass/unsubscribe?token=t" });
    const visible = m.html.replace(/href="[^"]*"/g, "") + m.subject;
    assert.ok(!/rift/i.test(visible), `${key} email shows RiftCompare`);
    assert.ok(m.html.includes(brand.name) && m.subject.includes(brand.name));
    for (const f of GIFT_FEATURES[key]!) assert.ok(m.html.includes(f.title));
    assert.ok(m.html.includes(`${new URL(brand.url).host}/account`), "signs in on its own site");
    assert.ok(m.headers["List-Unsubscribe"]);
    assert.ok(m.text.includes("Unsubscribe"));
  }
});

test("the email says when it ends, that there is no card, and the real prices", () => {
  const m = buildGiftPassEmail({ brand: RIFT_BRAND, displayName: "Sam", until: Date.UTC(2026, 10, 30, 14), unsubUrl: "u", oneClickUrl: "u" });
  assert.equal(giftEndDay(Date.UTC(2026, 10, 30, 14)), "Monday 30 November");
  assert.ok(m.html.includes("Monday 30 November"));
  assert.ok(/nothing to cancel/.test(m.text));
  assert.ok(m.text.includes("US$4.99") && m.text.includes("US$39.99"));
});

test("the campaign is allowed through the marketing switch, and the send is per site, dry by default", () => {
  assert.ok(MARKETING_ALLOWED.has("premium-gift-pass"));
  const route = readFileSync("src/app/api/cron/premium-gift-pass/route.ts", "utf8");
  assert.ok(route.includes(`p.get("dry") !== "0"`));
  const wf = readFileSync(".github/workflows/premium-gift-pass-send.yml", "utf8");
  assert.ok(!/schedule:/.test(wf), "dispatch only");
});

test("a pass holder may still subscribe, on RiftCompare and on a sister site", () => {
  assert.ok(readFileSync("src/lib/premium-free-week-server.ts", "utf8").includes("giftPassCounterKey"));
  assert.ok(readFileSync("src/app/api/sister-premium/checkout/route.ts", "utf8").includes("freeWeekMayCheckout"));
});
