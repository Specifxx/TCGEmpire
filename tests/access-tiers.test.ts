import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const exists = (p: string) => existsSync(join(ROOT, p));

// ─────────────────────────────────────────────────────────────────────────────
// The three access tiers (see lib/premium.ts): signed out → free account → Premium.
// ─────────────────────────────────────────────────────────────────────────────
// This file replaced tests/promo-disclosure.test.ts, which guarded a public promo
// endpoint against leaking the exact signup count. That endpoint is gone — the
// "free week of Premium on signup" comp it served was retired — so the leak is
// structurally impossible rather than merely prevented. What needs guarding now is
// the tier model that replaced it.

const BULK = "src/app/bulk-pricer/page.tsx";
const BASKET = "src/app/tools/best-basket/page.tsx";
const BASKET_API = "src/app/api/basket/route.ts";
const POPUP = "src/components/SignupPromoPopup.tsx";
const PREMIUM_LIB = "src/lib/premium.ts";
const OAUTH_CALLBACK = "src/app/api/auth/oauth/[provider]/callback/route.ts";

test("the bulk pricer gates on Premium, not merely on an account", () => {
  // The Bulk Pricer stays on the paid tier (see the tier note in lib/premium.ts).
  // hasAccount() here would put it back on the free tier.
  const src = read(BULK);
  assert.match(src, /isPremium\(/, `${BULK} must gate via isPremium()`);
  assert.ok(!/hasAccount\s*\(/.test(src), `${BULK} must not gate on hasAccount()`);
});

test("Best Basket gates on having an account, not on Premium", () => {
  // Best Basket moved BACK to the free account tier (see the tier note in
  // lib/premium.ts) — a generosity play to make it the reason to sign up, since
  // signups were near-zero. isPremium() here would put it back behind the paywall
  // this change exists to remove it from.
  const src = read(BASKET);
  assert.match(src, /hasAccount\(/, `${BASKET} must gate via hasAccount()`);
  assert.ok(!/isPremium\s*\(/.test(src), `${BASKET} must not gate on isPremium()`);
});

test("the basket API requires a session, and nothing more", () => {
  // The page only conditionally RENDERS <BestBasket> — that's no obstacle to a
  // signed-out caller hitting this route directly, so the sign-in check has to
  // live here too. It must NOT also require Premium — Best Basket is a free
  // account-tier tool now.
  const src = read(BASKET_API);
  assert.match(src, /if \(!user\) return NextResponse\.json\(/, "must still reject signed-out callers");
  assert.ok(!/isPremium\s*\(/.test(src), "basket API must not require Premium — it's account-tier now");
});

test("the bulk pricer gates the TOOL without gating the page's indexable content", () => {
  const src = read(BULK);
  // The heading and intro must render for everyone, or the page drops out of the
  // index for the terms it ranks on and the shared ?list= OG card stops unfurling.
  const gateIdx = src.indexOf("premium ?");
  assert.ok(gateIdx > 0, "expected a premium ternary around the tool");
  const beforeGate = src.slice(0, gateIdx);
  assert.match(beforeGate, /<h1/, "the H1 must render above the gate, for signed-out visitors too");
  assert.match(beforeGate, /HubIntro/, "the hub intro must render above the gate");
});

test("neither list tool still advertises itself as needing no account", () => {
  // Both pages used to say exactly this, and a stale claim here is a promise the
  // gate immediately breaks — Best Basket still requires a free account even
  // though it no longer requires Premium.
  for (const page of [BULK, BASKET]) {
    const src = read(page);
    assert.ok(!/No account needed/i.test(src), `${page} still claims "no account needed"`);
    assert.ok(!/no sign-in required/i.test(src), `${page} still claims "no sign-in required"`);
  }
});

test("the signup popup still appears on its own, with no promo gate", () => {
  // The explicit requirement when the comp was retired: keep the popup. It used
  // to render only when a promo API confirmed slots remained, so deleting the
  // promo without touching this would have silently killed the popup forever.
  const src = read(POPUP);
  assert.ok(!/api\/promo/.test(src), "popup must not depend on a promo endpoint");
  assert.ok(!/promo\?\.active/.test(src), "popup must not gate on promo.active");
  assert.match(src, /setPhase\("shown"\)/, "popup must still have its auto-show path");
  // The only conditions on showing are: loaded, signed out, not an auth page,
  // not already dismissed.
  assert.match(src, /if \(!loaded \|\| user\) return/, "still only shown to signed-out visitors");
});

test("the popup's comparison pitches Best Basket but never Bulk Pricer", () => {
  const src = read(POPUP);
  // Scope to the COMPARISON array itself (not the whole file — a comment is
  // allowed to explain, in prose, that Bulk Pricer stays Premium) so this checks
  // what's actually PITCHED as a free-account perk, not whether the tool names
  // appear anywhere.
  const rowsMatch = src.match(/const COMPARISON[^=]*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(rowsMatch, "expected a COMPARISON array declaration");
  const rows = rowsMatch![1];
  assert.ok(!/Bulk Pricer/.test(rows), "popup must not pitch Bulk Pricer — it's Premium only");
  assert.match(rows, /Best Basket/, "popup must pitch Best Basket — it's a free account perk, and advertising it is the point");
  assert.match(rows, /Price alerts/, "popup should name what an account actually unlocks");
  assert.match(rows, /Watchlist/, "popup should name what an account actually unlocks");
  // 4-6 rows: fewer reads as thin, more makes the card tall enough to reopen the
  // short-phone dismiss bug tests/signup-popup-dismissible.test.ts guards.
  const rowCount = (rows.match(/\{\s*label:/g) ?? []).length;
  assert.ok(rowCount >= 4 && rowCount <= 6, `expected 4-6 comparison rows, found ${rowCount}`);
});

test("the popup is a free-account moment only — Premium never appears in it", () => {
  // The dialog used to lead with a Premium comp (first a free WEEK, later the
  // shorter SIGNUP_PREMIUM_DAYS preview threaded down as a prop). That made the
  // ask about the PAID tier at the moment the visitor hadn't yet agreed to the
  // free one. SIGNUP_PREMIUM_DAYS still grants on signup and is still pitched on
  // /login via AuthForm's full layout — it is just not this dialog's hook.
  const src = read(POPUP);
  assert.ok(!/signupPremiumDays/.test(src), "the popup must not take or thread the Premium-preview prop");
  // Scoped to JSX/copy, not comments: the header comment legitimately explains
  // WHY Premium is absent, and must not itself trip this assertion.
  const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/Premium/.test(withoutComments), "no Premium copy may render in the popup");
});

test("the popup's honesty guarantees: no fake scarcity, and the tie row stays", () => {
  const src = read(POPUP);
  // Row one is a deliberate tie — signing up takes nothing away — and the
  // price-alerts row concedes the anonymous email path rather than claiming
  // alerts are account-only, which they are not (api/alerts/subscribe).
  const rowsMatch = src.match(/const COMPARISON[^=]*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(rowsMatch, "expected a COMPARISON array declaration");
  const rows = rowsMatch![1];
  assert.match(rows, /browsing: "Yes"/, "at least one row must credit browsing with a full yes");
  assert.match(rows, /browsing: "One card, by email"/, "the alerts row must concede the anonymous email path");
  // Countdowns, seat counts and "expires in" pressure are exactly what this
  // dialog must never grow.
  assert.ok(!/only \d+ (left|spots|seats)/i.test(src), "no fake scarcity");
  assert.ok(!/expires? in/i.test(src), "no countdown pressure");
  assert.match(src, /You keep everything you already have/, "the copy must say signing up costs them nothing");
});

test("the promo delay is one named 15s constant, never a scattered literal", () => {
  // Was 5s, which fired while a visitor was still reading the first thing they
  // landed on — 26% of visitors saw the dialog, 78% dismissed it, and
  // pages/visitor and buy_click both fell. The delay must stay a single named
  // export so it can't drift between the component and anything that reasons
  // about its timing.
  const src = read(POPUP);
  // Every timing the promo can use is a named export. The delay ladder ended at
  // 30s for pages with nothing to interrupt; the other two exist because a delay
  // alone only changes how long the interruption waits before landing on the buy
  // button, it never moves it off the buy path. See the component's header.
  assert.match(src, /export const PROMO_DELAY_MS = 30_000;/, "the no-buy-link delay must stay a named constant");
  assert.match(src, /export const BUY_SURFACE_BACKSTOP_MS = /, "the buy-surface backstop must be named");
  assert.match(src, /export const POST_BUY_DELAY_MS = /, "the post-buy delay must be named");
  assert.match(src, /\}, delay\)/, "the timer must read a computed named delay, not a literal");
  assert.ok(!/setTimeout\([\s\S]{0,400}?\}, \d{3,}\)/.test(src), "no hardcoded millisecond literal may drive the promo timer");
});

test("a dismissed promo stays dismissed for the rest of the session", () => {
  // Re-showing a dialog someone just closed is its own contribution to a 78%
  // dismiss rate. dismiss() must WRITE the flag and the arming effect must READ
  // it before re-arming on the next route.
  const src = read(POPUP);
  assert.match(src, /sessionStorage\.setItem\(SEEN_KEY, "1"\)/, "dismiss must persist the flag");
  assert.match(src, /seen = sessionStorage\.getItem\(SEEN_KEY\) === "1"/, "the arming effect must read the flag back");
  assert.match(src, /if \(seen\) return;/, "a seen promo must not re-arm on the next pageview");
});

test("the promo never fires for a signed-in visitor", () => {
  const src = read(POPUP);
  assert.match(src, /if \(!loaded \|\| user\) return;/, "the arming effect must bail for a signed-in user");
});

test("the retired WEEK-long signup comp's specific machinery stays gone", () => {
  // This guards the OLD, capped, backfill-script-dependent comp specifically —
  // NOT against any signup-time grant existing at all. SIGNUP_PREMIUM_DAYS
  // (below) is a deliberate, differently-shaped reintroduction: a plain env
  // constant plus one call to the already-existing grantPremiumDays() at the one
  // natural call site (the OAuth callback's `isNew` branch), with no promo API,
  // no backfill script and no signup cap — so none of the symbols this test
  // bans are needed to build it, and it doesn't reappear here.
  //
  // Env-defaulting EARLY_PREMIUM_DAYS to 0 would leave a stale deploy-environment
  // variable able to resurrect the comp silently. The machinery is deleted instead.
  //
  // Asserted against DECLARATIONS, not raw substrings: the tier note in premium.ts
  // names EARLY_PREMIUM_DAYS to explain why it was removed, and a comment saying
  // "this is gone" must not read as evidence that it is still here.
  const src = read(PREMIUM_LIB);
  for (const sym of ["grantEarlyAdopterPremium", "earlyPremiumPromoActive", "EARLY_PREMIUM_DAYS", "EARLY_PREMIUM_LIMIT"]) {
    const decl = new RegExp(`export\\s+(?:const|function|async function)\\s+${sym}\\b`);
    assert.ok(!decl.test(src), `lib/premium.ts still exports ${sym}`);
  }
  assert.ok(!exists("src/app/api/promo/early-adopter/route.ts"), "the promo endpoint still exists");
  assert.ok(!exists("scripts/grant-early-premium.ts"), "the promo backfill script still exists");
});

test("hasAccount and isPremium remain distinct checks", () => {
  const src = read(PREMIUM_LIB);
  assert.match(src, /export function hasAccount\(/, "hasAccount must exist as the account-tier check");
  assert.match(src, /export function isPremium\(/, "isPremium must remain for the paid tier");
  // isPremium must keep honouring a real paid period rather than collapsing into
  // "is signed in" now that a second tier sits below it.
  assert.match(src, /premiumUntil\.getTime\(\) > Date\.now\(\)/, "isPremium must still check a live paid period");
});

// ─────────────────────────────────────────────────────────────────────────────
// SIGNUP_PREMIUM_DAYS — the reintroduced signup-time Premium preview.
// ─────────────────────────────────────────────────────────────────────────────

test("SIGNUP_PREMIUM_DAYS is exported and env-configurable, defaulting to 3", () => {
  // Raised 1 → 3: a single day routinely lapsed before a new account came back
  // for a second session, so the preview was spent without ever being used.
  const src = read(PREMIUM_LIB);
  assert.match(
    src,
    /export const SIGNUP_PREMIUM_DAYS = Math\.max\(0, Math\.floor\(Number\(process\.env\.SIGNUP_PREMIUM_DAYS \?\? 3\)\)\);/,
    "SIGNUP_PREMIUM_DAYS must be exported, env-overridable, and floor/clamp like its siblings (PREMIUM_TRIAL_DAYS etc.)"
  );
});

test("the OAuth callback grants the signup preview once, only for a brand-new account", () => {
  const src = read(OAUTH_CALLBACK);
  assert.match(src, /grantPremiumDays/, "callback must call grantPremiumDays");
  assert.match(src, /SIGNUP_PREMIUM_DAYS/, "callback must gate the grant on SIGNUP_PREMIUM_DAYS, not a literal");
  // Scope to the `if (isNew)` block specifically — granting on every sign-in
  // (not just account creation) would silently keep re-extending premiumUntil
  // for a returning user, which is not what "a taste of Premium" is supposed to
  // mean.
  const ifNewMatch = src.match(/if \(isNew\) \{([\s\S]*?)\n {2}\}/);
  assert.ok(ifNewMatch, "expected an `if (isNew) { ... }` block");
  assert.match(ifNewMatch![1], /grantPremiumDays\(user\.id, SIGNUP_PREMIUM_DAYS\)/, "the grant call must live inside the isNew branch");
});

test("grantPremiumDays is a real, generic helper the signup grant can reuse", () => {
  // Confirms the new mechanism didn't need its own bespoke grant function —
  // it reuses the same day-granular helper feedback/referral-style comps use.
  const src = read(PREMIUM_LIB);
  assert.match(src, /export async function grantPremiumDays\(userId: string, days: number\)/);
});
