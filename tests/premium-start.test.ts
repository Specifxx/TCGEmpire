import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PREMIUM_START_PATH,
  PREMIUM_WELCOME_PATH,
  parseCheckoutSelection,
  parseStartSrc,
  premiumStartHref,
  sanitizeBackPath,
} from "../src/lib/premium-start";
import { SIGNUP_SOURCES } from "../src/lib/signup-source-shared";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
// Comment-stripped source, for assertions about what the code DOES — otherwise
// a header comment that merely quotes the old /login link (several of these
// files explain the change that way, deliberately) reads as the link itself.
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

// ─────────────────────────────────────────────────────────────────────────────
// SIGN-IN IS A STEP INSIDE CHECKOUT (2026-09-13). See DECISIONS.md.
//
// A signed-out visitor used to need five clicks to reach Stripe from /premium
// and six from a tool blur-wall, because "sign in" was a GATE in front of the
// buy button: /login?next=/premium, sign in, land back on /premium, find the
// button again. The blur-wall path additionally threw away the deck or card
// page the visitor was reading, because its link hardcoded next=/premium.
//
// What must keep holding: the selection is parsed by ONE rule shared with the
// checkout route, `back` can never be turned into an open redirect or a funnel
// loop, checkout still opens from the API route (not a second implementation),
// and the post-purchase page proves the Stripe session belongs to the viewer
// before it confirms anything.
// ─────────────────────────────────────────────────────────────────────────────

// ── The pure helpers ─────────────────────────────────────────────────────────

test("parseCheckoutSelection applies the checkout route's own rules, and only sells Plus when Plus is live", () => {
  assert.deepEqual(parseCheckoutSelection("plus", "annual", true), { tier: "plus", plan: "annual" });
  // Plus dark (its Stripe price id unset) must fall back to Premium, never sell
  // a tier with no price behind it.
  assert.deepEqual(parseCheckoutSelection("plus", "annual", false), { tier: "premium", plan: "annual" });
  // Anything unrecognised is the safe default, never passed through.
  assert.deepEqual(parseCheckoutSelection("gold", "weekly", true), { tier: "premium", plan: "monthly" });
  assert.deepEqual(parseCheckoutSelection(undefined, undefined, true), { tier: "premium", plan: "monthly" });
});

test("sanitizeBackPath keeps next-param's rules AND adds the funnel loop guards", () => {
  // Inherited from sanitizeNextPath — an open redirect here would ride through
  // Stripe's success_url.
  assert.equal(sanitizeBackPath("//evil.com"), null);
  assert.equal(sanitizeBackPath("https://evil.com"), null);
  assert.equal(sanitizeBackPath("/api/premium/checkout"), null);
  assert.equal(sanitizeBackPath(null), null);
  assert.equal(sanitizeBackPath(""), null);
  // The loop guards: returning someone to the start step, the welcome page or
  // /login after they have just paid would bounce them round the funnel.
  assert.equal(sanitizeBackPath(PREMIUM_START_PATH), null);
  assert.equal(sanitizeBackPath(`${PREMIUM_START_PATH}?tier=plus`), null);
  assert.equal(sanitizeBackPath(PREMIUM_WELCOME_PATH), null);
  assert.equal(sanitizeBackPath(`${PREMIUM_WELCOME_PATH}?session_id=cs_1`), null);
  assert.equal(sanitizeBackPath("/login?next=/premium"), null);
  // A real page the visitor could have been on still passes.
  assert.equal(sanitizeBackPath("/decks/abc?x=1"), "/decks/abc?x=1");
  assert.equal(sanitizeBackPath("/card/ogn-001"), "/card/ogn-001");
});

test("premiumStartHref carries the whole selection, and drops a back path it would refuse", () => {
  const href = premiumStartHref({ tier: "plus", plan: "annual", back: "/decks/abc", src: "dialog" });
  assert.ok(href.startsWith(`${PREMIUM_START_PATH}?`));
  const q = new URLSearchParams(href.split("?")[1]);
  assert.equal(q.get("tier"), "plus");
  assert.equal(q.get("plan"), "annual");
  assert.equal(q.get("src"), "dialog");
  assert.equal(q.get("back"), "/decks/abc");
  // A hostile back never reaches the URL at all.
  assert.equal(new URLSearchParams(premiumStartHref({ tier: "premium", plan: "monthly", back: "//evil.com", src: "premium-page" }).split("?")[1]).get("back"), null);
  assert.equal(parseStartSrc("dialog"), "dialog");
  assert.equal(parseStartSrc("nonsense"), "premium-page");
});

// ── The checkout route ───────────────────────────────────────────────────────

test("the checkout route shares the selection rule rather than keeping a second copy of it", () => {
  const src = code("src/app/api/premium/checkout/route.ts");
  assert.match(src, /parseCheckoutSelection\(body\?\.tier, body\?\.plan, premiumPlusEnabled\(\)\)/,
    "the page that shows the price and the route that charges for it must parse the selection identically");
  assert.match(src, /const priceId = priceIdFor\(tier, plan\)/, "the resolved selection must still feed priceIdFor");
  assert.match(src, /const back = sanitizeBackPath\(body\?\.back\)/, "`back` arrives from the client and must be sanitized");
});

test("checkout returns the buyer to a page that knows they bought something", () => {
  const src = read("src/app/api/premium/checkout/route.ts");
  // {CHECKOUT_SESSION_ID} is Stripe's own placeholder — it must stay literal.
  assert.match(src, /success_url: `\$\{SITE_URL\}\/premium\/welcome\?session_id=\{CHECKOUT_SESSION_ID\}/,
    "success_url must point at the welcome page and carry Stripe's session-id placeholder");
  assert.match(src, /cancel_url: `\$\{SITE_URL\}\$\{back \?\? "\/premium"\}`/,
    "cancelling at Stripe must return the visitor to where they started");
  // The old dead end: /portfolio?upgraded=1 was read by nothing, so a buyer
  // landed on the ordinary free-tier portfolio.
  for (const f of ["src/app/api/premium/checkout/route.ts", "src/app/portfolio/page.tsx"]) {
    assert.ok(!/upgraded=1|searchParams\.upgraded/.test(code(f)), `${f} must not carry the dead ?upgraded=1 handoff`);
  }
});

test("checkout refuses to open a SECOND subscription for someone who already pays", () => {
  const src = code("src/app/api/premium/checkout/route.ts");
  assert.match(src, /isPremium\(user\) && !user\.isAdmin/, "an entitled non-admin must not reach Stripe checkout");
  assert.match(src, /status: 409/, "the refusal must be a real error status, not a silent success");
});

// ── The start step ───────────────────────────────────────────────────────────

test("/premium/start is the sign-in step itself, not a redirect to /login", () => {
  const src = code("src/app/premium/start/page.tsx");
  assert.match(src, /<AuthForm/, "the provider buttons must render ON this page — that is the whole point");
  assert.match(src, /enabledProviders\(\)/, "only configured providers may be offered");
  assert.match(src, /source=\{src === "dialog" \? "premium_dialog" : "premium_cta"\}/,
    "the signup must be attributed to the Premium surface that produced it, not the generic login page");
  assert.match(src, /next=\{selfHref\}/, "?next= must return to this same URL so the selection survives the OAuth round trip");
  assert.match(src, /<CheckoutLauncher/, "a signed-in visitor must go straight to checkout");
  assert.match(src, /sanitizeBackPath\(searchParams\.back\)/);
  assert.match(src, /parseCheckoutSelection\(searchParams\.tier, searchParams\.plan, premiumPlusEnabled\(\)\)/);
});

test("/premium/start sends away everyone who must not buy from it", () => {
  const src = code("src/app/premium/start/page.tsx");
  assert.match(src, /if \(!premiumCheckoutEnabled\(\)\) redirect\("\/premium"\)/,
    "with checkout unconfigured there is nothing to open — /premium has the honest waitlist CTA");
  // Covers Premium members, admins AND Plus members: a Plus member upgrades in
  // place (prorated) on /premium, and pushing them through checkout would open
  // a second Stripe subscription alongside the one they already pay for.
  assert.match(src, /if \(isPremium\(user\)\) redirect\("\/premium"\)/,
    "an already-entitled visitor must never reach the launcher");
});

test("/premium/start and /premium/welcome are noindex and are not submitted in the sitemap", () => {
  assert.match(read("src/app/premium/start/page.tsx"), /robots: \{ index: false/);
  assert.match(read("src/app/premium/welcome/page.tsx"), /robots: \{ index: false/);
  const sitemapSrc = read("src/lib/sitemap-sections.ts");
  const submitted = [...sitemapSrc.matchAll(/^\s*\{\s*url:\s*`\$\{SITE_URL\}(\/[a-z0-9/-]*)`/gim)].map((m) => m[1]);
  assert.ok(submitted.length > 0, "fixture check: the parse should find sitemap entries");
  for (const p of [PREMIUM_START_PATH, PREMIUM_WELCOME_PATH]) {
    assert.ok(!submitted.includes(p), `${p} is a transient funnel step and must not be submitted for indexing`);
  }
});

test("the launcher fires the funnel event BEFORE the fetch, and opens checkout exactly once", () => {
  const src = code("src/components/CheckoutLauncher.tsx");
  const eventAt = src.indexOf('trackEvent("premium_checkout_started"');
  const fetchAt = src.indexOf('fetch("/api/premium/checkout"');
  assert.ok(eventAt >= 0 && fetchAt >= 0, "expected both the event and the checkout call");
  assert.ok(eventAt < fetchAt, "a checkout that redirects away can't fire its own event afterwards");
  assert.match(src, /via: "start"/, "the new path must be separable from the in-page CTAs in GA4");
  // SignupWelcome strips ?welcome= with router.replace the instant a brand-new
  // account lands here; without the guard that re-render opens a SECOND Stripe
  // session and writes a second PremiumClick row.
  assert.match(src, /launched\.current = true/, "the auto-launch must be guarded against a re-render");
  // Checkout itself still lives in exactly one place.
  assert.ok(!/checkout\.sessions\.create/.test(src), "the launcher must call the API route, not create a Stripe session itself");
});

// ── The buy buttons ──────────────────────────────────────────────────────────

test("no Premium buy button routes through /login any more", () => {
  for (const f of ["src/components/PremiumCta.tsx", "src/components/PremiumDialog.tsx"]) {
    assert.ok(!/\/login\?next=\/premium/.test(code(f)), `${f} must send buyers to the start step, not the login wall`);
  }
});

test("PremiumCta's signed-out CTA attributes the signup and records the funnel step", () => {
  const src = code("src/components/PremiumCta.tsx");
  assert.match(src, /markSignupSource\("premium_cta"\)/,
    "without this these signups record as \"login\" — indistinguishable from someone typing /login");
  assert.match(src, /trackEvent\("premium_signin_step"/, "the signed-out click had no event at all before this");
  assert.match(src, /premiumStartHref\(\{ tier, plan, src: "premium-page" \}\)/);
  // The required disclosures still live in the same branch as the trial claim.
  const signedOutAt = src.indexOf("if (!signedIn)");
  const signedOutBlock = src.slice(signedOutAt, src.indexOf("if (!checkoutLive)"));
  assert.match(signedOutBlock, /no card needed/i);
  assert.match(signedOutBlock, /card is required/i);
});

test("the wall dialog signs a visitor in IN PLACE, keeping both the tier choice and the page they were on", () => {
  const src = code("src/components/PremiumDialog.tsx");
  assert.match(src, /<AuthForm/, "the dialog must render the provider buttons itself");
  assert.match(src, /source="premium_dialog"/);
  assert.match(src, /premiumStartHref\(\{ tier: sellTier, plan: activePlan, back: pathname, src: "dialog" \}\)/,
    "the tier, the plan and the page behind the wall must all survive the OAuth round trip");
  assert.match(src, /providers \} = useMe\(\)|providers,/, "providers come from /api/me — the layout mounts the provider as a bare literal");
  // The selection is shown to signed-out visitors too, so the choice happens
  // BEFORE sign-in rather than being asked for again afterwards on /premium.
  assert.match(src, /const selector = \(/);
  const signedOutAt = src.indexOf(") : !user ? (");
  assert.ok(signedOutAt >= 0, "expected the signed-out branch");
  assert.match(src.slice(signedOutAt, signedOutAt + 1200), /\{selector\}/, "the signed-out branch must render the tier/plan selection");
  // A signed-out visitor has by definition never trialed, so the $0-today
  // framing applies to them — trialEligible alone can't answer for them.
  assert.match(src, /const showTrial = trialEligible \|\| \(!user && trialDays > 0\)/);
});

// ── The post-purchase page ───────────────────────────────────────────────────

test("/premium/welcome proves the Stripe session belongs to the viewer before it confirms anything", () => {
  const src = code("src/app/premium/welcome/page.tsx");
  // (2026-09-24) now with the subscription expanded, for the dated trial timeline.
  assert.match(src, /checkout\.sessions\.retrieve\(sessionId(, \{ expand: \[[^\]]*\] \})?\)/, "the session must be re-read from Stripe, never trusted from the URL");
  assert.match(src, /s\.metadata\?\.userId \?\? s\.client_reference_id/);
  assert.match(src, /ownerId !== user\.id\) redirect\("\/premium"\)/,
    "anyone can put any cs_ id in this URL — a mismatch must reveal nothing");
  assert.match(src, /if \(!sessionId\) redirect\("\/premium"\)/);
  assert.match(src, /sanitizeBackPath\(searchParams\.back\)/);
});

test("/premium/welcome waits for the webhook instead of lying about the tier", () => {
  const page = code("src/app/premium/welcome/page.tsx");
  assert.match(page, /<PremiumActivationPoller( trial=\{trial\})?>/, "entitlement is webhook-async — the page must wait for it");
  assert.match(page, /TIER_COMPARISON\.filter/, "what was unlocked must be read off the shared table, not re-typed here");

  const poller = code("src/components/PremiumActivationPoller.tsx");
  assert.match(poller, /fetch\("\/api\/me", \{ cache: "no-store" \}\)/);
  assert.match(poller, /invalidateMe\(\)/, "the cached session must be dropped so the chrome picks up the new tier");
  // Giving up must not claim the payment failed — the webhook retries for days
  // and the nightly reconcile is behind it.
  assert.match(poller, /Payment received/);
  assert.ok(!/expires? in|only \d+ (left|spots|seats)/i.test(poller), "no countdown or scarcity on a post-purchase page");
  // A synchronous reconcile here would sweep every Stripe subscription and
  // email the admin on a page view.
  assert.ok(!/runStripeReconcile/.test(poller));
});

// ── Plumbing ─────────────────────────────────────────────────────────────────

test("the Premium funnel's own signup sources are whitelisted, or the attribution silently nulls", () => {
  for (const s of ["premium_cta", "premium_dialog"]) {
    assert.ok(SIGNUP_SOURCES.has(s), `${s} missing from SIGNUP_SOURCES`);
  }
});

test("/api/me publishes the configured providers so a client component can render the sign-in form", () => {
  assert.match(code("src/app/api/me/route.ts"), /providers: enabledProviders\(\)/);
  const useMe = code("src/lib/use-me.ts");
  assert.match(useMe, /providers: \("google" \| "discord"\)\[\]/, "the type must stay narrowed to real providers");
  assert.match(useMe, /p === "google" \|\| p === "discord"/, "a malformed payload must never reach an OAuth href");
});

test("premium_signin_step and premium_checkout_started stay dual-destination", () => {
  const src = read("src/lib/analytics.ts");
  const setAt = src.indexOf("const GA4_ONLY_EVENTS");
  const set = src.slice(setAt, src.indexOf("]);", setAt));
  for (const e of ["premium_signin_step", "premium_checkout_started"]) {
    assert.ok(!set.includes(e), `${e} is a low-volume conversion step and must reach Vercel too`);
  }
});

test("an OAuth failure that started at the checkout step returns there, not to a login page with no memory of it", () => {
  const cb = code("src/app/api/auth/oauth/[provider]/callback/route.ts");
  assert.match(cb, /function errorBase\(/);
  assert.match(cb, /PREMIUM_START_PATH/);
  assert.match(cb, /: "\/login";/, "every other destination must still fall back to /login, the only other page that renders ?error=");
  const start = code("src/app/api/auth/oauth/[provider]/route.ts");
  assert.match(start, /PREMIUM_START_PATH/);
  assert.match(start, /dest\.searchParams\.set\("error", "provider_unavailable"\)/);
});
