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
  // the changeover. Read them in GA4 — see the GA4_ONLY_EVENTS test below.
  // Asserted on the PROPERTIES the funnel needs, not on one literal argument
  // list — this pinned the exact object and then had to change the moment
  // `trigger` was added to separate the buy-path cases. What must hold is that
  // the impression carries the path and the layout variant.
  assert.match(src, /trackEvent\("signup_promo_shown", \{[^}]*path: pathname/);
  assert.match(src, /trackEvent\("signup_promo_shown", \{[^}]*variant: PROMO_VARIANT/);
  assert.match(src, /trackEvent\("signup_promo_dismissed", \{ variant: PROMO_VARIANT \}\)/);
  assert.match(src, /const PROMO_VARIANT = "comparison"/, "the variant must be a named constant, not inlined at each call");
  // The embedded AuthForm attributes its provider clicks to the popup.
  assert.match(src, /source="popup"/);
});

test("the promo impression events are GA4-only — they must not bill Vercel's event quota", () => {
  // signup_promo_shown fires for a large share of visitors (26% at its peak,
  // the site's #1 event by volume) and _dismissed tracks it closely. Vercel
  // bills custom events against a monthly quota, so the pair was crowding out
  // buy_click, sign_up and price_alert_subscribed — the handful-a-day events
  // that actually decide whether the site works.
  const src = read("src/lib/analytics.ts");
  const setMatch = src.match(/const GA4_ONLY_EVENTS = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(setMatch, "expected a GA4_ONLY_EVENTS set");
  assert.match(setMatch![1], /"signup_promo_shown"/);
  assert.match(setMatch![1], /"signup_promo_dismissed"/);
  // The Vercel leg must be the one that is gated, and GA4's must NOT be —
  // suppressing both would delete the funnel rather than move it.
  assert.match(src, /if \(!GA4_ONLY_EVENTS\.has\(name\)\) vercelTrack\(name, cleaned\);/);
  // Pinned as a POSITIVE match on the whole statement: the GA4 leg is guarded
  // by the window check and nothing else. A negative "GA4_ONLY_EVENTS near
  // gtag" regex looks equivalent and is not — the two dispatch lines are
  // adjacent, so any proximity window spans them and fails on correct code.
  assert.match(
    src,
    /\n {2}if \(typeof window !== "undefined"\) window\.gtag\?\.\("event", name, cleaned\);/,
    "the GA4 dispatch must be guarded only by the window check, never by GA4_ONLY_EVENTS"
  );

  // The call sites stay intact — the exclusion is a destination policy, not a
  // deletion. Dropping the trackEvent() call instead is what makes the two
  // destinations silently diverge, which is why this dispatcher exists.
  const popup = read("src/components/SignupPromoPopup.tsx");
  assert.match(popup, /trackEvent\("signup_promo_shown"/);
  assert.match(popup, /trackEvent\("signup_promo_dismissed"/);

  // Nothing may reach Vercel around these events except through trackEvent().
  assert.ok(!/@vercel\/analytics/.test(popup), "the popup must not import Vercel's track() directly");
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
  //
  // Asserted on the SHAPE of the question, not on one implementation of it.
  // This used to pin the literal `prisma.priceAlert.findMany({ where: { userId:
  // null }, distinct: ["email"] })`, which then had to be rewritten — Prisma
  // dedupes `distinct` in the client, so that form selected every unclaimed
  // alert row to read its .length (see tests/prisma-client-side-distinct.test.ts).
  // What this test exists to protect is that the page still measures the pool
  // claimAlertsForUser() converts, and still counts EMAILS rather than rows.
  assert.match(src, /COUNT\(DISTINCT email\)[\s\S]{0,80}"PriceAlert"[\s\S]{0,60}"userId" IS NULL/);
  assert.match(src, /unclaimedAlertEmails\s*=/, "the count must still reach the rendered stat");
  assert.match(src, /\(untracked\)/, "null sources must be labeled, not dropped from the breakdown");
});

// ── Phase 1: conversion fixes ────────────────────────────────────────────────

test("the signed-out navbar names BOTH logging in and signing up, not just an icon", () => {
  const src = read("src/components/UserMenu.tsx");
  // A lone "Sign in" reads as a door for people who already have an account, so
  // a first-time visitor has no reason to think it's for them. Both halves must
  // be named — that's what makes the header an entry point, not a return path.
  assert.match(src, />\s*Log in \/ Sign up\s*<\/Link>/, "the sm+ pill must name both halves");
  // Below sm the glyph can't carry text, so its accessible name must.
  assert.match(src, /aria-label="Log in or sign up"/, "the mobile icon needs both halves in its label");
  // ONE control, not two: both words open the same OAuth screen (there is no
  // separate registration flow), so two links would imply a distinction the
  // auth system doesn't have.
  const links = src.match(/href=\{loginHref\}/g) ?? [];
  assert.equal(links.length, 2, "expected exactly the sm+ pill and the below-sm icon, both to /login");
  assert.match(src, /hidden whitespace-nowrap px-3 py-1\.5 text-xs sm:inline-flex/);
  assert.match(src, /sm:hidden/);
  const nofollow = src.match(/rel="nofollow"/g) ?? [];
  assert.ok(nofollow.length >= 2, "both signed-out links must keep rel=nofollow");
});

test("the header row has the slack to actually RENDER the wider signed-out CTA", () => {
  // Widening the CTA to "Log in / Sign up" made the nav row's intrinsic minimum
  // exceed the container between 1024 and ~1056px, and the container CLIPPED it
  // — "Log in / Sign up" rendered as "Log". No page scroll, so
  // scripts/mobile-check.ts's overflow sweep could not see it; measured with a
  // real browser instead (ctaRight === viewportWidth, i.e. hard against the
  // edge, at 1024/1032/1040/1048/1056).
  //
  // Two independent reservations of slack, both pinned here because either one
  // silently reverting re-clips the CTA:
  const src = read("src/components/Navbar.tsx");
  // 1. The nav LINKS turn on at the same breakpoint as the search bar — the only
  //    element in the row that can flex and absorb the difference.
  assert.ok(!/md:block md:px-2\.5/.test(src), "nav links must not turn on at md — the flexible search bar is lg-and-up");
  // Was >= 4 (Sealed, Decks, Best Basket, Blog) — Best Basket lost its header
  // slot when it moved back to Premium (see lib/premium.ts's tier note and
  // Navbar.tsx's own comment where the link used to be), leaving three. Only
  // ever removes slack pressure on this row, so the overflow fix this test
  // guards still holds; the floor drops to match.
  const lgLinks = src.match(/lg:block lg:px-2\.5/g) ?? [];
  assert.ok(lgLinks.length >= 3, `expected the nav links gated at lg, found ${lgLinks.length}`);
  // 2. The two NON-navigational items defer to xl, which is what buys the
  //    1024-1056 band its headroom. Premium stays reachable from UserMenu and
  //    /premium; Discord from the footer.
  assert.match(src, /<PremiumButton className="[^"]*\bxl:block\b/, "the Premium button must defer to xl");
  assert.match(src, /aria-label="Join our Discord"[\s\S]{0,300}?\bxl:grid\b/, "the Discord icon must defer to xl");
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

test("the popup gates on engagement, now via the delay rather than a second pageview", () => {
  const src = read("src/components/SignupPromoPopup.tsx");
  // MIN_PAGEVIEWS was 2 because a 5s timer fired on page ONE for everyone, and
  // requiring a second pageview was the only way to express "has engaged".
  // PROMO_DELAY_MS is 15s now and expresses that directly, so the pageview gate
  // relaxed to 1 — stacking both gated the dialog twice for one reason, and with
  // bounce up 5pts it excluded every single-page session from ever seeing the
  // pitch. The counter itself stays (it's how the gate is enforced at all).
  assert.match(src, /const MIN_PAGEVIEWS = 1/);
  assert.match(src, /if \(pageviews < MIN_PAGEVIEWS\) return/);
  assert.match(src, /export const PROMO_DELAY_MS = 30_000;/, "the delay must carry the engagement gate now");
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

// ─────────────────────────────────────────────────────────────────────────────
// THE PROMO MUST NOT LAND ON TOP OF A BUY CLICK.
//
// buy_click is the event every affiliate dollar depends on. The delay ladder
// (5s → 15s → 30s) only ever changed how long the interruption waited before
// covering the buy button; it never moved it off the buy path. The trigger is
// now conditional on what is on the page and what the visitor has already done:
//
//   no buy link on the page  → ordinary timer (PROMO_DELAY_MS)
//   buy link, not clicked    → hold off until BUY_SURFACE_BACKSTOP_MS
//   already clicked a buy    → POST_BUY_DELAY_MS, the only moment that cannot
//                              cost a buy_click because it already happened
//
// The page-has-a-buy-link fact comes from OutboundLink REGISTERING ITSELF, not
// from a list of "pages with buy links" — such a list rots the first time a new
// surface renders one, and the failure mode is silent (the popup goes back to
// covering the buy button on exactly the new page nobody remembered to add).
// ─────────────────────────────────────────────────────────────────────────────
test("the signup promo stays off the buy path", () => {
  const src = read("src/components/SignupPromoPopup.tsx");
  const outbound = read("src/components/OutboundLink.tsx");
  const intent = read("src/lib/buy-intent.ts");

  // The popup asks the shared signal, rather than testing the pathname.
  assert.match(src, /buyLinksOnPage\(\)/, "the popup must ask whether a buy link is present");
  assert.match(src, /hasBoughtThisSession\(\)/, "the popup must know whether the buy already happened");
  assert.doesNotMatch(
    src,
    /startsWith\("\/card/,
    "a hardcoded card-page path would rot — the signal must come from OutboundLink registering itself"
  );

  // OutboundLink is what makes the rule self-maintaining, on BOTH halves.
  assert.match(outbound, /registerBuyLink\(\)/, "OutboundLink must register its presence on mount");
  assert.match(outbound, /markBuyClick\(\)/, "OutboundLink must record the click");
  // Order matters: the flag must be set before the beacon, or a re-arm can race it.
  const markAt = outbound.indexOf("markBuyClick()");
  const trackAt = outbound.indexOf('trackEvent("buy_click"');
  assert.ok(markAt > -1 && trackAt > -1 && markAt < trackAt, "markBuyClick() must run before the buy_click beacon");

  // A buy click mid-timer must re-arm to the short delay, or the best moment on
  // the site is missed while the two-minute backstop runs out.
  assert.match(src, /addEventListener\(BUY_CLICK_EVENT/, "a buy during the wait must re-arm the promo");
  assert.match(src, /removeEventListener\(BUY_CLICK_EVENT/, "and must be cleaned up");

  // Which trigger fired has to be separable in GA4, or the three cases average
  // together and none of them can be judged.
  assert.match(src, /trigger: firedAs/, "the impression must report which trigger fired");
  assert.match(src, /trigger: "post_buy"/, "the post-buy path must label itself");

  // Private mode must fail toward protecting the buy, not toward showing.
  assert.match(
    intent,
    /catch\s*\{[\s\S]{0,400}?return false;/,
    "an unreadable session must read as 'has not bought', which keeps the promo off the buy path"
  );
});
