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
  assert.match(src, /trackEvent\("signup_promo_shown", \{ path: pathname \?\? "\/" \}\)/);
  assert.match(src, /trackEvent\("signup_promo_dismissed"\)/);
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
  assert.match(src, /markSignupSource\(source \?\? "login"\)/);
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
