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

// ── Sign-up prompt + alert-modal instrumentation ──────────────────────────────────────

test("the inline sign-up prompt's impression is GA4-only; its click reaches both", () => {
  // The popup's signup_promo_shown was an impression that fired for a large
  // share of visitors (26% at its peak, the site's #1 event by volume) and,
  // with _dismissed, crowded buy_click, sign_up and price_alert_subscribed out
  // of Vercel's monthly custom-event quota. The popup is gone (2026-09-30);
  // its replacement's impression, signup_inline_view, is the same shape and
  // gets the same treatment. The click is low-volume and decides things, so it
  // goes to both destinations.
  const src = read("src/lib/analytics.ts");
  const setMatch = src.match(/const GA4_ONLY_EVENTS = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(setMatch, "expected a GA4_ONLY_EVENTS set");
  assert.match(setMatch![1], /"signup_inline_view"/);
  assert.doesNotMatch(setMatch![1], /"signup_inline_click"/, "the click must still reach Vercel");
  assert.doesNotMatch(setMatch![1], /"signup_promo_/, "the retired popup's events fire nowhere now");
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
  // deletion — and nothing reaches Vercel around them except through trackEvent().
  const prompt = read("src/components/InlineSignupPrompt.tsx");
  assert.match(prompt, /trackEvent\("signup_inline_view"/);
  assert.match(prompt, /trackEvent\("signup_inline_click"/);
  assert.ok(!/@vercel\/analytics/.test(prompt), "the prompt must not import Vercel's track() directly");
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
  assert.match(src, /const stashed = \(source \?\? urlSrc\) \? null : readSignupSource\(\);\s*const placement = source \?\? urlSrc \?\? stashed \?\? "login";\s*if \(stashed\) stashSignupSource\(stashed\);\s*else markSignupSource\(placement\);/);
  // …and auth_start{provider,placement} (2026-09-24), which is why the handler
  // now takes the provider.
  assert.match(src, /trackAuthStart\(provider, placement\)/);
  // Both provider anchors carry the click handler — one instrumented button
  // and one silent one would skew every per-provider comparison.
  assert.match(src, /onClick=\{\(\) => onProviderClick\("google"\)\}/);
  assert.match(src, /onClick=\{\(\) => onProviderClick\("discord"\)\}/);
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
  // REVISED 2026-09-24 (growth-pass brief): TWO visible controls at every
  // width — a quiet "Log in" and a primary "Sign up free". The old single pill
  // hid below sm behind an unlabeled glyph, so phones were never asked to sign
  // up. Both still open the same OAuth screen; the split names two audiences.
  assert.match(src, />\s*Log in\s*<\/Link>/, "a visible Log in link");
  assert.match(src, /Sign up<span className="hidden min-\[420px\]:inline">&nbsp;free<\/span>/, "a visible Sign up free button");
  assert.match(src, /className="btn-primary whitespace-nowrap px-2\.5 py-1\.5 text-xs"/, "sign-up is the primary");
  assert.doesNotMatch(src, /sm:hidden|hidden whitespace-nowrap px-3/, "neither control hides at any width");
  const links = src.match(/href=\{loginHref\}/g) ?? [];
  assert.equal(links.length, 2, "both go to /login with the return path");
  assert.match(src, /trackSignupCta\("header"\)/);
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
  // REWRITTEN 2026-09-21. This used to reserve slack by gating things: the nav
  // links had to wait for lg (the breakpoint at which the flexible search bar
  // appeared to absorb them) and Premium/Discord had to wait for xl. Those
  // reservations are moot now, because from lg up the row no longer CARRIES
  // the items they were reserving against — the full-height rail took the
  // brand, the search box, the ⌘K button, Sealed/Decks/Blog/Auctions and the
  // desktop Premium link, and the header keeps only Discord, the theme
  // toggle, the country picker and this CTA.
  //
  // So the guarantee is asserted as an ABSENCE now, which is both stronger and
  // the thing that would actually re-break it: putting any of them back into
  // this row at lg is what would re-create the 1024-1056px clip.
  //
  // Re-measured in a real browser after the change, the same way the original
  // clip was found — "Log in / Sign up" renders in full with 32px to spare at
  // 1024/1032/1040/1048/1056/1279/1280/1440, and no width overflows.
  assert.ok(!/md:block md:px-2\.5/.test(src), "nav links must not turn on at md");

  // WHAT BUYS THE SLACK NOW (2026-09-21). It used to be gating: nav links
  // waited for lg, Premium and Discord for xl. It is SUBTRACTION instead —
  // the full-height rail permanently took four things out of this row from lg
  // up, which is far more headroom than any gate bought, and is why Premium
  // and Discord could come back down from xl to lg in the same pass.
  //
  // Asserted as absences, because putting any of them back is what would
  // re-create the 1024-1056px clip:
  // The desktop card search CAME BACK on 2026-09-21 (the rail's own box
  // searches features now), as did the Database link — so the row carries two
  // more things than it did an hour earlier, and the measurement below is the
  // check that matters rather than any particular absence.
  assert.match(src, /<HeaderSearchSlot>/, "the desktop card search is in the header");
  assert.doesNotMatch(src, /<CommandLauncherButton \/>/, "the ⌘K button stays out; the rail is the nav surface");
  assert.match(src, /className="tap-link min-w-11 shrink-0 gap-2 lg:hidden"/, "the brand is rail-only from lg");
  assert.doesNotMatch(src, /<Link href="\/auctions"/, "Auctions is rail-only (owner, 2026-09-21)");
  assert.doesNotMatch(src, /<Link href="\/deck"/, "Deck builder is rail-only (owner, 2026-09-21)");

  // And the curated shortlist that is deliberately still here, per the same
  // instruction: "I still want the sealed, the blog, premium, Discord, the
  // watch list, the light and dark mode, the country and the accounts."
  assert.equal((src.match(/lg:block lg:px-2\.5/g) ?? []).length, 3, "Sealed, Blog and Premium, and nothing more");
  assert.match(src, /aria-label="Join our Discord"[\s\S]{0,300}?\blg:grid\b/, "Discord comes back at lg with the reclaimed slack");
  assert.match(src, /<HeaderWatchButton className="hidden sm:inline-flex" \/>/, "the watchlist is a desktop control again");

  // Re-measured in a real browser after the change, the same way the original
  // clip was found: "Log in / Sign up" renders in full at
  // 1024/1032/1040/1048/1056/1279/1280/1440, with 72px of clearance at the
  // tightest, and no width overflows horizontally.
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
  // "Top 3 deals" joined 2026-09-23 — the free account's view of Deal Finder
  // and Rising Cards (DECISIONS.md, "Premium after sign-up").
  assert.match(src, /const PERKS = \["Price alerts", "Portfolio tracking", "Watchlist", "Top 3 deals"\]/);
});

// ─────────────────────────────────────────────────────────────────────────────
// OutboundLink's buy-signal machinery (registerBuyLink/markBuyClick) was built
// so the signup popup could stay off the buy path. The popup stopped consuming
// it on 2026-09-01 and was removed altogether on 2026-09-30; the signal is
// kept as general infrastructure and still deserves its ordering guarantee.
// ─────────────────────────────────────────────────────────────────────────────
test("OutboundLink's own buy-signal ordering still holds, independent of who consumes it", () => {
  const outbound = read("src/components/OutboundLink.tsx");
  assert.match(outbound, /registerBuyLink\(\)/, "OutboundLink must register its presence on mount");
  assert.match(outbound, /markBuyClick\(\)/, "OutboundLink must record the click");
  // Order matters: the flag must be set before the beacon, or a consumer
  // reading it in response to the beacon can race it.
  const markAt = outbound.indexOf("markBuyClick()");
  const trackAt = outbound.indexOf('trackEvent("buy_click"');
  assert.ok(markAt > -1 && trackAt > -1 && markAt < trackAt, "markBuyClick() must run before the buy_click beacon");

  const intent = read("src/lib/buy-intent.ts");
  // Private mode must fail toward "has not bought" — whatever consumes this
  // signal should get the conservative answer, not a throw.
  assert.match(
    intent,
    /catch\s*\{[\s\S]{0,400}?return false;/,
    "an unreadable session must read as 'has not bought'"
  );
});
