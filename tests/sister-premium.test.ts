import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signSisterSignIn, signInSite } from "../src/lib/sister-sign-in";
import { maskEmail, SISTER_PREMIUM_SITES, premiumSite, premiumSiteForOrigin, premiumCors, signPremiumSession, verifyPremiumSession } from "../src/lib/sister-premium";
import { evaluateAlert, isRestockTarget, RESTOCK_TARGET_CENTS } from "../src/lib/sister-alerts/evaluate";
import { buildAlertEmail } from "../src/lib/sister-alerts/email";

// DexCompare Premium is a RiftCompare Premium account (2026-11-10).
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

test("only DexCompare's exact https origin may ask", () => {
  assert.equal(premiumSiteForOrigin("https://dexcompare.app")?.key, "dex");
  assert.equal(premiumSiteForOrigin("https://www.dexcompare.app")?.key, "dex");
  for (const o of [null, "http://dexcompare.app", "https://dexcompare.app:8443", "https://dexcompare.app.evil.com", "https://mtgcompare.app", "https://riftcompare.com"]) {
    assert.equal(premiumSiteForOrigin(o), null, String(o));
  }
  assert.equal(premiumCors("https://evil.com")["Access-Control-Allow-Origin"], undefined);
  assert.equal(premiumCors("https://dexcompare.app")["Access-Control-Allow-Origin"], "https://dexcompare.app");
  assert.deepEqual(SISTER_PREMIUM_SITES.map((s) => s.key), ["dex"]);
});

test("a premium session verifies for its own site and address only; a sign-in link never stands in", async () => {
  const dex = premiumSite("dex")!;
  const token = await signPremiumSession(dex, "a@b.co");
  assert.equal(await verifyPremiumSession(token, dex), "a@b.co");
  assert.equal(await verifyPremiumSession(token, { key: "x", name: "X", url: "https://mtgcompare.app" }), null);
  assert.equal(await verifyPremiumSession(token + "x", dex), null);
  assert.equal(await verifyPremiumSession(undefined, dex), null);
  // an OP sign-in link (no `use` claim) is refused, even re-audienced
  const link = await signSisterSignIn(signInSite("opcompare")!, "a@b.co");
  assert.equal(await verifyPremiumSession(link, dex), null);
  assert.equal(await verifyPremiumSession(link, { key: "o", name: "o", url: "https://opcompare.app" }), null);
});

const base = { targetCents: RESTOCK_TARGET_CENTS, lastNotifiedCents: null, lastNotifiedAt: null, missingSince: null, createdAt: new Date("2026-11-01") };
const now = new Date("2026-11-10");

test("a back-in-stock watch fires on the first price, then waits, re-arms when sold out, never fires on a drop", () => {
  assert.equal(isRestockTarget(RESTOCK_TARGET_CENTS), true);
  assert.equal(isRestockTarget(5000), false);
  assert.deepEqual(evaluateAlert(base, 12900, now), { kind: "fire", priceCents: 12900 });
  const sent = { ...base, lastNotifiedCents: 12900, lastNotifiedAt: new Date("2026-11-02") };
  assert.equal(evaluateAlert(sent, 9000, now).kind, "hold", "a lower price is not a restock");
  const out = evaluateAlert(sent, null, now);
  assert.equal(out.kind, "hold");
  assert.equal(out.kind === "hold" && out.rearm, true);
  assert.equal(evaluateAlert(base, null, now).kind, "hold");
  // sold out for over 90 days does not remove a restock watch
  assert.equal(evaluateAlert({ ...base, missingSince: new Date("2026-06-01") }, null, now).kind, "hold");
  // an ordinary price alert still expires then
  assert.equal(evaluateAlert({ ...base, targetCents: 5000, missingSince: new Date("2026-06-01") }, null, now).kind, "expire");
});

test("the restock email says back in stock, not price drop", () => {
  const row = { id: "1", site: "dex", name: "Delta Reign Booster Box", path: "/us/p/x", region: "US" as const, priceCents: 14999, targetCents: RESTOCK_TARGET_CENTS, restock: true };
  const m = buildAlertEmail("dex", [row], "tok", null);
  assert.match(m.subject, /^Back in stock: Delta Reign Booster Box from US\$149\.99/);
  assert.doesNotMatch(m.html + m.text, /your alert:/);
  const p = buildAlertEmail("dex", [{ ...row, restock: false, targetCents: 15000 }], "tok", null);
  assert.match(p.subject, /^Price drop:/);
});

test("the status route masks the address", () => {
  assert.equal(maskEmail("bill@gmail.com"), "bi**@gmail.com");
});

test("the signup route takes a member token, never trusts the form email for a member, and gates restock", () => {
  const s = read("src/app/api/sister-alerts/route.ts");
  assert.match(s, /verifyPremiumSession\(token, psite\)/);
  assert.match(s, /email = proven/);
  assert.match(s, /kind === "restock"/);
  assert.match(s, /status\.premium\) maxAlerts = MEMBER_MAX_ALERTS/);
});

test("the sign-in redirect fixes its destination and keeps the token in the fragment", () => {
  const s = read("src/app/sister-premium/[site]/route.ts");
  assert.match(s, /\$\{site\.url\}\/premium\/return#t=/);
  assert.doesNotMatch(s, /searchParams|return=|next=\$\{.*req/);
});

test("sign-in on the sister site: an email-link code is its own kind, for its own site, and never a session", async () => {
  const { signEmailLinkCode, verifyEmailLinkCode, signPremiumSession, verifyPremiumSession, premiumSite, emailLinkUrl, googleClientIdFor } = await import("../src/lib/sister-premium");
  const dex = premiumSite("dex")!;
  const code = await signEmailLinkCode(dex, "a@b.com");
  assert.equal(await verifyEmailLinkCode(code, dex), "a@b.com");
  assert.equal(await verifyPremiumSession(code, dex), null, "a link code is not a session");
  const sess = await signPremiumSession(dex, "a@b.com");
  assert.equal(await verifyEmailLinkCode(sess, dex), null, "a session is not a link code");
  assert.equal(await verifyEmailLinkCode(code, { ...dex, url: "https://evil.example" }), null);
  assert.match(emailLinkUrl(dex, code), /^https:\/\/dexcompare\.app\/account\/verify#c=/);
  assert.equal(googleClientIdFor(dex, {}), null);
  assert.equal(googleClientIdFor(dex, { DEX_GOOGLE_CLIENT_ID: " abc.apps.googleusercontent.com " }), "abc.apps.googleusercontent.com");
});

test("a Google credential that is not a Google-signed token is refused", async () => {
  const { verifyGoogleCredential } = await import("../src/lib/sister-premium");
  assert.equal(await verifyGoogleCredential("x".repeat(200), "abc.apps.googleusercontent.com"), null);
  assert.equal(await verifyGoogleCredential(42, "abc"), null);
});
