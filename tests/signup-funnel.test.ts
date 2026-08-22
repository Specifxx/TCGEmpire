import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseSignupSource, SIGNUP_SOURCES, SIGNUP_SOURCE_COOKIE } from "../src/lib/signup-source-shared";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Signup-funnel measurement (Phase 0 of the signup-growth plan).
//
// The failure mode all of these pin is SILENT: an unfired analytics event
// doesn't error, it just leaves the funnel unmeasurable again — which is the
// exact state this instrumentation was built to end. Style follows
// tests/analytics-events.test.ts: source-regex assertions on the wiring, plus
// real unit tests where the logic is a pure function.
// ─────────────────────────────────────────────────────────────────────────────

// ── The source whitelist (pure function — real assertions) ───────────────────

test("parseSignupSource accepts only whitelisted values and never passes raw strings through", () => {
  for (const s of SIGNUP_SOURCES) assert.equal(parseSignupSource(s), s);
  assert.equal(parseSignupSource("evil'); DROP TABLE users;--"), null);
  assert.equal(parseSignupSource(""), null);
  assert.equal(parseSignupSource(null), null);
  assert.equal(parseSignupSource(undefined), null);
  // Sources later phases depend on must stay in the set — removing one would
  // silently null that surface's attribution.
  for (const s of ["navbar", "popup", "alert_modal", "login", "email"]) {
    assert.ok(SIGNUP_SOURCES.has(s), `${s} missing from SIGNUP_SOURCES`);
  }
});

test("markSignupSource is the single choke point: one event name, cookie + click event together", () => {
  const src = read("src/lib/signup-source.ts");
  assert.match(src, /trackEvent\("sign_in_click", \{ source: safe \}\)/);
  assert.match(src, /document\.cookie = `\$\{SIGNUP_SOURCE_COOKIE\}=\$\{safe\}; path=\/; max-age=1800/);
  // Unknown sources degrade to "other", never to a raw value.
  assert.match(src, /parseSignupSource\(source\) \?\? "other"/);
});

// ── The sign_up completed event ──────────────────────────────────────────────

test("the OAuth callback stamps signupSource and flags new accounts with ?welcome=", () => {
  const src = read("src/app/api/auth/oauth/[provider]/callback/route.ts");
  // Attribution is whitelisted server-side and written best-effort inside the
  // isNew branch only.
  assert.match(src, /parseSignupSource\(cookies\(\)\.get\(SIGNUP_SOURCE_COOKIE\)\?\.value\)/);
  assert.match(src, /data: \{ signupSource \} \}\)\.catch\(\(\) => \{\}\)/);
  // The welcome param is the isNew bridge to client analytics — appended only
  // for new accounts, so a returning sign-in can never fire sign_up.
  assert.match(src, /if \(isNew\) dest\.searchParams\.set\("welcome", provider\)/);
  // The old unconditional literal redirect must be gone (it threw isNew away).
  assert.doesNotMatch(src, /NextResponse\.redirect\(new URL\("\/profile", req\.url\)\)/);
  // The source cookie is cleared on every sign-in, new or returning — a stale
  // cookie must not claim credit for a later unrelated session.
  assert.match(src, /cookies\(\)\.set\(SIGNUP_SOURCE_COOKIE, "", \{ path: "\/", maxAge: 0 \}\)/);
});

test("SignupWelcome fires sign_up exactly once and strips the param so refresh/share can't re-fire", () => {
  const src = read("src/components/SignupWelcome.tsx");
  assert.match(src, /trackEvent\("sign_up", \{ method: welcome \}\)/);
  assert.match(src, /router\.replace\(/);
  assert.match(src, /rest\.delete\("welcome"\)/);
  // A ref guard on top of the URL rewrite — belt and braces against re-fires
  // from effect re-runs before the replace lands.
  assert.match(src, /if \(!welcome \|\| fired\.current\) return/);
  // useSearchParams needs a Suspense boundary; the component self-wraps (same
  // pattern as GAPageViewTracker) so no mount site can forget it.
  assert.match(src, /<Suspense fallback=\{null\}>/);
});

test("SignupWelcome is mounted in the root layout", () => {
  const src = read("src/app/layout.tsx");
  assert.match(src, /<SignupWelcome \/>/);
});

// ── Popup + alert-modal instrumentation ──────────────────────────────────────

test("the signup popup reports shown and dismissed — its conversion rate is measurable", () => {
  const src = read("src/components/SignupPromoPopup.tsx");
  // Both events carry `variant`, so the comparison layout stays separable from
  // the perk-list version it replaced instead of being averaged together across
  // the changeover in Vercel Analytics.
  assert.match(src, /trackEvent\("signup_promo_shown", \{ path: pathname \?\? "\/", variant: PROMO_VARIANT \}\)/);
  assert.match(src, /trackEvent\("signup_promo_dismissed", \{ variant: PROMO_VARIANT \}\)/);
  assert.match(src, /const PROMO_VARIANT = "comparison"/, "the variant must be a named constant, not inlined at each call");
  // The embedded AuthForm attributes its provider clicks to the popup.
  assert.match(src, /source="popup"/);
});

test("PriceAlertModal events reach BOTH analytics systems, and the silent path is finally visible", () => {
  const src = read("src/components/PriceAlertModal.tsx");
  // price_alert_subscribed used to be Vercel-only (bare track()), which left
  // GA4 blind to the site's highest-volume conversion. It must go through the
  // dual dispatcher now — and no bare Vercel import may come back.
  assert.match(src, /trackEvent\("price_alert_subscribed", \{ card: pendingCardId \}\)/);
  assert.doesNotMatch(src, /from "@vercel\/analytics"/);
  // Modal impressions, split by how they opened (passive watch-click vs the
  // explicit card-page CTA) — the denominators for its conversion rate.
  assert.match(src, /trackEvent\("price_alert_modal_shown", \{ trigger: "auto" \}\)/);
  assert.match(src, /trackEvent\("price_alert_modal_shown", \{ trigger: "explicit" \}\)/);
  // The returning-subscriber path that extends a watch with NO UI — the cohort
  // that repeatedly gets value while never seeing an account pitch.
  assert.match(src, /trackEvent\("price_alert_silent_extend", \{ card: cardId \}\)/);
});

test("the navbar sign-in link attributes its clicks", () => {
  const src = read("src/components/UserMenu.tsx");
  assert.match(src, /markSignupSource\("navbar"\)/);
});

test("AuthForm's provider buttons attribute their clicks, defaulting to the login page", () => {
  const src = read("src/components/AuthForm.tsx");
  // Since Phase 2 a ?src= landing (urlSrc) outranks the generic default but
  // never outranks an explicit source prop from the mounting surface.
  assert.match(src, /markSignupSource\(source \?\? urlSrc \?\? "login"\)/);
  // Both provider anchors carry the click handler — one instrumented button
  // and one silent one would skew every per-provider comparison.
  const clicks = src.match(/onClick=\{onProviderClick\}/g) ?? [];
  assert.equal(clicks.length, 2, "both provider anchors must fire the source click");
});

// ── Schema + admin visibility ────────────────────────────────────────────────

test("User.signupSource exists and is nullable (additive push, no default)", () => {
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model User {"));
  const body = model.slice(0, model.indexOf("\n}"));
  assert.match(body, /signupSource\s+String\?/);
  assert.doesNotMatch(body, /signupSource\s+String\?\s+@default/, "no default — old rows stay null");
});

test("the accounts admin page charts signups over time, by source, and the unclaimed-alerts pool", () => {
  const src = read("src/app/admin/accounts/page.tsx");
  assert.match(src, /signupSource: true/);
  // Daily bars zero-fill 30 days so a quiet day is a visible gap, not a
  // shorter axis.
  assert.match(src, /Array\.from\(\{ length: 30 \}/);
  // The convertible pool: distinct alert emails with no account.
  assert.match(src, /prisma\.priceAlert\.findMany\(\{ where: \{ userId: null \}, distinct: \["email"\]/);
  assert.match(src, /\(untracked\)/, "null sources must be labeled, not dropped from the breakdown");
});

// ── Phase 1: conversion fixes ────────────────────────────────────────────────

test("the signed-out navbar has a VISIBLE Sign in button, not just an icon", () => {
  const src = read("src/components/UserMenu.tsx");
  // Text pill on sm+, icon below sm — both attributed, both nofollow (the
  // ?next= family must stay out of the crawl graph, see the SEO note there).
  assert.match(src, />\s*Sign in\s*<\/Link>/);
  assert.match(src, /hidden whitespace-nowrap px-3 py-1\.5 text-xs sm:inline-flex/);
  assert.match(src, /sm:hidden/);
  const nofollow = src.match(/rel="nofollow"/g) ?? [];
  assert.ok(nofollow.length >= 2, "both signed-out links must keep rel=nofollow");
});

test("PriceAlertModal keeps the email path intact — the account option is a reframe, NOT a gate", () => {
  // Pins the product decision: the anonymous email flow was a deliberate prior
  // choice and survives account-first framing. Deleting the input or the
  // subscribe path here is a regression even if every account test passes.
  const src = read("src/components/PriceAlertModal.tsx");
  assert.match(src, /type="email"/);
  assert.match(src, /Notify me of price drops/);
  assert.match(src, /localStorage\.setItem\(EMAIL_KEY/);
  // Account option embedded for signed-out visitors, attributed to the modal.
  assert.match(src, /source="alert_modal"/);
  assert.match(src, /or just get emails — no account needed/);
  // The watch survives the OAuth trip via the stash SignupWelcome completes.
  assert.match(src, /PENDING_WATCH_KEY/);
  // Both post-subscribe surfaces upsell the account with the true "watches
  // come with you" claim (claimAlertsForUser adopts them by email match).
  const successLinks = src.match(/markSignupSource\("alert_success"\)/g) ?? [];
  assert.equal(successLinks.length, 2, "success phase AND silent toast both link to an account");
});

test("the card page CTA no longer undercuts the account pitch", () => {
  const src = read("src/components/CardConversionCta.tsx");
  assert.doesNotMatch(src, /No account needed/);
  assert.match(src, /watchlist syncs everywhere/);
});

test("the popup never fires on the first page of a session", () => {
  const src = read("src/components/SignupPromoPopup.tsx");
  assert.match(src, /const MIN_PAGEVIEWS = 2/);
  assert.match(src, /if \(pageviews < MIN_PAGEVIEWS\) return/);
  // The pageview counter increments once per pathname, in its own effect —
  // counting inside the arming effect would double-count when auth state loads.
  assert.match(src, /lastCountedPath/);
  // The hard-won dismissibility contract must survive this change untouched.
  assert.match(src, /SKIP_PATHS/);
  assert.match(src, /document\.body\.dataset\.rcDialog/);
  assert.match(src, /Maybe later/);
});

test("the homepage finally pitches the free account (AccountStrip)", () => {
  const strip = read("src/components/home/AccountStrip.tsx");
  assert.match(strip, /markSignupSource\("home"\)/);
  assert.match(strip, /Create your free account/);
  // Hidden for signed-in members; renders identically on first paint (ISR-safe).
  assert.match(strip, /if \(loaded && user\) return null/);
  const home = read("src/components/home/HomeSections.tsx");
  assert.match(home, /<AccountStrip \/>/);
});

test("/login leads with account creation, not returning-user framing", () => {
  const src = read("src/components/AuthForm.tsx");
  assert.match(src, /Create your free account/);
  assert.match(src, /Already have one\? The same buttons sign you in\./);
  // The perks row replaced the 12px grey prose as the page's value prop.
  assert.match(src, /const PERKS = \["Price alerts", "Portfolio tracking", "Watchlist"\]/);
});
