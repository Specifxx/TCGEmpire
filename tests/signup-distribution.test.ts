import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { accountCtaBlock } from "../src/lib/email";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Distribution & dormant assets (Phase 2 of the signup-growth plan).
//
// Three email lists received regular value from RiftCompare and were never
// once asked to create an account; the referral program was fully implemented
// server-side with no UI; and /alerts — the SEO page for the account feature —
// exited to "Browse cards". These pin the fixes.
// ─────────────────────────────────────────────────────────────────────────────

// ── Email footers ────────────────────────────────────────────────────────────

test("accountCtaBlock builds an attributable /login link", () => {
  const html = accountCtaBlock("newsletter");
  assert.match(html, /\/login\?src=email&utm_source=email&utm_medium=email&utm_campaign=newsletter/);
  assert.match(html, /Create your free account/);
  // Campaign is URL-encoded — a future campaign name with spaces can't break the link.
  assert.match(accountCtaBlock("price drop"), /utm_campaign=price%20drop/);
});

test("the account CTA reaches exactly the emails whose recipients lack accounts", () => {
  const email = read("src/lib/email.ts");
  // Price-drop + confirmation carry it ONLY for anonymous recipients — the
  // callers know PriceAlert.userId and gate on it.
  assert.match(email, /sendPriceDropEmail\(to: string, items: PriceDropItem\[\], unsubUrl: string, anonymous = false\)/);
  assert.match(email, /sendAlertConfirmationEmail\(to: string, cardCount: number, unsubUrl: string, anonymous = false\)/);
  const ctaUses = email.match(/\$\{anonymous \? accountCtaBlock\(/g) ?? [];
  assert.equal(ctaUses.length, 2, "both alert emails must gate the CTA on anonymity");
  // The newsletter digest (account-less list by construction) carries it always.
  assert.match(email, /inner \+ accountCtaBlock\("newsletter"\)/);

  // The registered-users digest must NOT pitch accounts at account holders.
  const digest = read("src/lib/user-digest.ts");
  assert.doesNotMatch(digest, /accountCtaBlock/);
});

test("the alert callers thread real anonymity into the senders", () => {
  const alerts = read("src/lib/price-alerts.ts");
  assert.match(alerts, /userId: true/);
  assert.match(alerts, /if \(a\.userId != null\) bucket\.anonymous = false/);
  assert.match(alerts, /sendPriceDropEmail\(email, items, unsubUrl, anonymous\)/);
  const subscribe = read("src/app/api/alerts/subscribe/route.ts");
  assert.match(subscribe, /sendAlertConfirmationEmail\(email, total, unsubUrl, userId == null\)/);
});

test("/login converts ?src= into stashed attribution without inflating the click metric", () => {
  const form = read("src/components/AuthForm.tsx");
  // The landing stashes the cookie silently (stashSignupSource = no event) and
  // the provider CLICK attributes to the campaign over the generic default.
  assert.match(form, /stashSignupSource\(src\)/);
  assert.match(form, /markSignupSource\(source \?\? urlSrc \?\? "login"\)/);
  const lib = read("src/lib/signup-source.ts");
  assert.match(lib, /export function stashSignupSource/);
  // stashSignupSource must not fire the click event.
  const stashBody = lib.slice(lib.indexOf("export function stashSignupSource"));
  assert.doesNotMatch(stashBody, /trackEvent/);
});

// ── Referral UI ──────────────────────────────────────────────────────────────

test("the referral program finally has a share surface, gated on the program being on", () => {
  const profile = read("src/app/profile/page.tsx");
  assert.match(profile, /REFERRAL_PREMIUM_DAYS > 0 && \(/);
  assert.match(profile, /\$\{SITE_URL\}\/\?ref=\$\{user\.id\}/);
  const card = read("src/components/ReferralLinkCard.tsx");
  assert.match(card, /trackEvent\("referral_link_copied"\)/);
  // The link shape must match what ReferralCapture actually parses (?ref=<id>).
  const capture = read("src/components/ReferralCapture.tsx");
  assert.match(capture, /get\("ref"\)/);
});

// ── /alerts page CTA ─────────────────────────────────────────────────────────

test("/alerts leads with the watchlist signup, keeping browse as the secondary route", () => {
  const page = read("src/app/alerts/page.tsx");
  assert.match(page, /<AlertsSignupCta \/>/);
  assert.match(page, /className="btn-ghost">Browse cards/);
  const cta = read("src/components/AlertsSignupCta.tsx");
  assert.match(cta, /\/login\?next=\/watching/);
  assert.match(cta, /markSignupSource\("alerts_page"\)/);
  assert.match(cta, /Start your watchlist — free/);
});
