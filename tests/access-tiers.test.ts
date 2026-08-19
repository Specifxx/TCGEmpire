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

test("the two list tools gate on Premium, not merely on an account", () => {
  // Deliberate reversal (see the tier note in lib/premium.ts): these two used to
  // be "the reason to sign up" for a free account. hasAccount() here would put
  // them back on the free tier — the exact state this change exists to undo.
  for (const page of [BULK, BASKET]) {
    const src = read(page);
    assert.match(src, /isPremium\(/, `${page} must gate via isPremium()`);
    assert.ok(!/hasAccount\s*\(/.test(src), `${page} must not gate on hasAccount()`);
  }
});

test("the basket API requires Premium, not just a session", () => {
  // The page only conditionally RENDERS <BestBasket> — that's no obstacle to a
  // signed-in-but-not-Premium caller hitting this route directly, and its output
  // (the optimized store split) is the exact thing Premium is sold on.
  const src = read(BASKET_API);
  assert.match(src, /if \(!user\) return NextResponse\.json\(/, "must still reject signed-out callers");
  assert.match(src, /isPremium\(user\)/, "basket API must also reject a signed-in non-Premium caller");
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

test("neither tool still advertises itself as needing no account", () => {
  // Both pages used to say exactly this, and a stale claim here is a promise the
  // gate immediately breaks.
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

test("the popup pitches the account tier rather than a Premium comp", () => {
  const src = read(POPUP);
  // The exact promise the old popup made, verbatim: "comp <N> of Premium free".
  // Matching the rendered phrase rather than the word "comp" keeps this from
  // tripping over prose that merely mentions the retired promo.
  assert.ok(!/of Premium free/i.test(src), "popup must not promise a comped subscription");
  // Scope to the PERKS array itself (not the whole file — a comment is allowed to
  // explain, in prose, that Bulk Pricer/Best Basket moved to Premium) so this
  // checks what's actually PITCHED, not whether the tool names appear anywhere.
  const perksMatch = src.match(/const PERKS[^=]*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(perksMatch, "expected a PERKS array declaration");
  const perks = perksMatch![1];
  assert.ok(!/Bulk Pricer/.test(perks), "popup must not pitch Bulk Pricer — it's Premium now");
  assert.ok(!/Best Basket/.test(perks), "popup must not pitch Best Basket — it's Premium now");
  assert.match(perks, /Price alerts/, "popup should name what an account actually unlocks");
  assert.match(perks, /Marketplace/, "popup should name what an account actually unlocks");
});

test("the retired signup comp is gone from the codebase, not just switched off", () => {
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
