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

test("the popup's permanent perks include Best Basket but never Bulk Pricer", () => {
  const src = read(POPUP);
  // Scope to the PERKS array itself (not the whole file — a comment is allowed to
  // explain, in prose, that Bulk Pricer stays Premium) so this checks what's
  // actually PITCHED as a permanent account perk, not whether the tool names
  // appear anywhere.
  const perksMatch = src.match(/const PERKS[^=]*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(perksMatch, "expected a PERKS array declaration");
  const perks = perksMatch![1];
  assert.ok(!/Bulk Pricer/.test(perks), "popup must not pitch Bulk Pricer — it's Premium only");
  assert.match(perks, /Best Basket/, "popup must pitch Best Basket — it's a free account perk again, and the whole point of this change is to advertise it");
  assert.match(perks, /Price alerts/, "popup should name what an account actually unlocks");
  assert.match(perks, /Watchlist/, "popup should name what an account actually unlocks");
});

test("the popup's Premium preview is sourced from a prop, not a hardcoded duration", () => {
  // SIGNUP_PREMIUM_DAYS (lib/premium.ts) is a DELIBERATE reintroduction of a
  // short signup-time Premium comp — see that constant's comment for why this
  // differs from the week-long one retired below. This popup can't import a
  // server-only module, so the day count must arrive as a prop (threaded from
  // app/layout.tsx), never baked into the component as a literal — that's what
  // keeps SIGNUP_PREMIUM_DAYS=0 actually able to turn the pitch off again.
  const src = read(POPUP);
  assert.match(src, /signupPremiumDays\s*=\s*0/, "must default the prop to 0 (comp off) if the caller omits it");
  assert.ok(!/\b1 day of Premium\b/.test(src), "must not hardcode a specific day count in the pitched copy");
  assert.match(src, /of Premium free/i, "must pitch the preview when signupPremiumDays > 0");
});

test("the popup frames the Premium preview as temporary and the account perks as kept", () => {
  // The old, week-long comp's actual failure (per lib/premium.ts's tier note) was
  // reading as the account's own payoff, so losing it read as a downgrade. The
  // reintroduced version must not repeat that: the copy has to say the preview
  // ends and the perks below survive it.
  const src = read(POPUP);
  assert.match(src, /you keep/i, "copy must say the account perks are kept after the preview lapses");
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

test("SIGNUP_PREMIUM_DAYS is exported and env-configurable, defaulting to 1", () => {
  const src = read(PREMIUM_LIB);
  assert.match(
    src,
    /export const SIGNUP_PREMIUM_DAYS = Math\.max\(0, Math\.floor\(Number\(process\.env\.SIGNUP_PREMIUM_DAYS \?\? 1\)\)\);/,
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
