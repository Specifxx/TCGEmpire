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

test("Best Basket gates on Premium, not merely on an account", () => {
  // Best Basket moved BACK to the Premium tier (see the tier note in
  // lib/premium.ts), reversing the free-account experiment described in an
  // earlier version of this test. hasAccount() here would put it back on the
  // free tier this change moves it off of.
  const src = read(BASKET);
  assert.match(src, /isPremium\(/, `${BASKET} must gate via isPremium()`);
  assert.ok(!/hasAccount\s*\(/.test(src), `${BASKET} must not gate on hasAccount()`);
});

test("the basket API requires Premium, not merely a session", () => {
  // The page only conditionally RENDERS <BestBasket> — that's no obstacle to a
  // non-Premium caller hitting this route directly, so the Premium check has to
  // live here too, on top of the sign-in check.
  const src = read(BASKET_API);
  assert.match(src, /if \(!user\) return NextResponse\.json\(/, "must still reject signed-out callers");
  assert.match(src, /isPremium\(/, "basket API must require Premium — it's Premium-tier again");
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
  // gate immediately breaks — both tools are Premium-gated now, which requires
  // an account a fortiori.
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
  assert.match(src, /setShown\(true\)/, "popup must still have its auto-show path");
  // The only conditions on showing are: loaded, signed out, not an auth page,
  // not already dismissed.
  assert.match(src, /if \(!loaded \|\| user \|\| shown\) return/, "still only shown to signed-out visitors");
});

test("the popup's comparison never pitches a Premium-gated tool", () => {
  const src = read(POPUP);
  // Scope to the COMPARISON array itself (not the whole file — a comment is
  // allowed to explain, in prose, that these tools are Premium only) so this
  // checks what's actually PITCHED as a free-account perk, not whether the tool
  // names appear anywhere.
  const rowsMatch = src.match(/const COMPARISON[^=]*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(rowsMatch, "expected a COMPARISON array declaration");
  const rows = rowsMatch![1];
  assert.ok(!/Bulk Pricer/.test(rows), "popup must not pitch Bulk Pricer — it's Premium only");
  assert.ok(!/Best Basket/.test(rows), "popup must not pitch Best Basket — it moved back to Premium only");
  assert.match(rows, /Price alerts/, "popup should name what an account actually unlocks");
  assert.match(rows, /Watchlist/, "popup should name what an account actually unlocks");
  // 4-6 rows: fewer reads as thin, more makes a bigger interruption than a
  // corner slide-in card should ever be (see tests/signup-slidein.test.ts).
  const rowCount = (rows.match(/\{\s*label:/g) ?? []).length;
  assert.ok(rowCount >= 4 && rowCount <= 6, `expected 4-6 comparison rows, found ${rowCount}`);
});

test("the popup is a free-account moment only — Premium never appears in it", () => {
  // The dialog used to lead with a Premium comp (first a free WEEK, later the
  // shorter automatic signup preview threaded down as a prop). That made the
  // ask about the PAID tier at the moment the visitor hadn't yet agreed to the
  // free one. That signup grant has since been removed entirely (2026-08-23),
  // so no surface offers Premium for registering any more. What this test pins
  // is narrower and still worth pinning: the POPUP never mentions Premium.
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

test("the promo has no artificial delay — shows the instant it's eligible (2026-09-01)", () => {
  // History, oldest to newest: a bare 5s timer (26% shown, 78% dismissed,
  // pages/visitor and buy_click both fell) → a named 30s constant plus a
  // buy_click-aware 3-case system so the delay could never cost a buy_click →
  // no delay at all, by explicit instruction. Each step was a real, deliberate
  // decision — this test pins the current one and guards against the old
  // constants quietly reappearing.
  const src = read(POPUP);
  assert.doesNotMatch(src, /PROMO_DELAY_MS|BUY_SURFACE_BACKSTOP_MS|POST_BUY_DELAY_MS/, "the old delay constants must be fully gone");
  assert.doesNotMatch(src, /setTimeout\(\(\) => \{[\s\S]{0,50}setShown\(true\)/, "must not gate showing itself behind a setTimeout");
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
  assert.match(src, /if \(!loaded \|\| user \|\| shown\) return;/, "the arming effect must bail for a signed-in user");
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
// NO PREMIUM ON SIGNUP — removed 2026-08-23, and it must not come back by
// accident.
//
// New accounts used to get an automatic 3-day Premium grant in the OAuth
// callback's isNew branch, read from SIGNUP_PREMIUM_DAYS. The whole mechanism
// was deleted: the constant, the grant call, and the pitches on /login,
// AuthForm and /premium.
//
// THE CONSTANT WAS DELETED RATHER THAN DEFAULTED TO ZERO, and that is what
// these tests protect. SIGNUP_PREMIUM_DAYS read from process.env, so setting
// the default to 0 would have left a lingering SIGNUP_PREMIUM_DAYS=3 in Vercel
// silently granting Premium while the code claimed the feature was off — a
// discrepancy invisible until someone audited premiumUntil against Stripe. With
// no constant to read, no environment variable can switch it back on.
//
// Premium is now reached only by: the card-gated Stripe trial
// (PREMIUM_TRIAL_DAYS), checkout, feedback, or a referral.
// ─────────────────────────────────────────────────────────────────────────────

test("no signup-time Premium constant exists anywhere", () => {
  for (const f of [PREMIUM_LIB, OAUTH_CALLBACK, "src/app/login/page.tsx", "src/components/AuthForm.tsx", "src/app/premium/page.tsx"]) {
    const src = read(f);
    // Comments explaining the removal are fine; a live reference is not.
    const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    assert.doesNotMatch(
      code,
      /SIGNUP_PREMIUM_DAYS|signupPremiumDays/,
      `${f} still references the removed signup Premium grant — deleting the constant is what makes a stale env var harmless`
    );
  }
});

test("the OAuth callback creates an account WITHOUT granting Premium", () => {
  const src = read(OAUTH_CALLBACK);
  const ifNewMatch = src.match(/if \(isNew\) \{([\s\S]*?)\n {2}\}/);
  assert.ok(ifNewMatch, "expected an `if (isNew) { ... }` block");
  assert.doesNotMatch(
    ifNewMatch![1],
    /grantPremiumDays/,
    "a new account must not be granted Premium — the free ACCOUNT tier is the payoff for signing up"
  );
  // The referral credit is a separate, earned thing and must survive.
  assert.match(ifNewMatch![1], /applyReferral\(user\.id\)/, "referral crediting must still happen on account creation");
});

test("grantPremiumDays is a real, generic helper the signup grant can reuse", () => {
  // Confirms the new mechanism didn't need its own bespoke grant function —
  // it reuses the same day-granular helper feedback/referral-style comps use.
  const src = read(PREMIUM_LIB);
  assert.match(src, /export async function grantPremiumDays\(userId: string, days: number\)/);
});

// ─────────────────────────────────────────────────────────────────────────────
// THE TIER TABLE IS ONE TABLE, AND THE DIALOG THAT SHOWS IT MUST STAY CLOSABLE.
//
// The Premium dialog used to show a hand-written six-item list of Premium-only
// perks while /premium showed a fourteen-row three-tier table — two different
// answers to "what do I get?", updated independently. Both now render
// TierComparisonTable. The Best Basket tier change had to be chased through six
// files for exactly this reason.
//
// Putting the full table in a modal has a cost, and it is one this codebase has
// already paid once: the dialog was `fixed inset-0 flex items-center
// justify-center` with an overflow-hidden card and NO scroll container. A centred
// card taller than the viewport overflows EQUALLY in both directions, so the ✕
// pinned to its header goes above the top of the screen with nothing to scroll to
// reach it — the SignupPromoPopup bug fixed in 263eaeb.
//
// Measured in a real browser with the table added and the OLD overlay restored:
// the close button rendered at y = -3 (375x553) and y = -23 (360x480). With the
// fix: y = 29, hit-testable, dismisses, and the below-fold CTA is reachable by
// scrolling. Verified down to 320x480.
// ─────────────────────────────────────────────────────────────────────────────

test("the Premium dialog and /premium show the SAME tier table, from one source", () => {
  const shared = read("src/components/TierComparisonTable.tsx");
  const dialog = read("src/components/PremiumDialog.tsx");
  const page = read("src/app/premium/page.tsx");

  assert.match(shared, /export const TIER_COMPARISON/, "the rows must be exported from the shared module");
  for (const [file, name] of [[dialog, "the dialog"], [page, "/premium"]] as const) {
    assert.match(file, /TierComparisonTable/, `${name} must render the shared table`);
    assert.doesNotMatch(
      file,
      /const COMPARE(_\w+)?\s*(:|=)/,
      `${name} must not keep its own copy of the comparison rows`
    );
  }
  assert.doesNotMatch(dialog, /const FEATURES\s*:/, "the dialog's hand-written perk list is superseded by the table");

  // Rows that are neither a flat yes nor a flat no stay strings — rounding
  // "Top pick" up to a tick would overstate the free tier.
  assert.match(shared, /anon: "Top pick", account: "Top pick", premium: "Full list"/);
});

test("every dialog-only row override names a row that actually exists", async () => {
  // The dialog trims and rewrites specific rows by matching TIER_COMPARISON's
  // `feature` string. A typo, or a later reword of the row itself, makes the
  // entry match nothing — and the failure is SILENT: the row simply keeps
  // rendering as if the override had never been written. Nobody reviewing a
  // rename of "Price alerts" would think to check a Set in another const.
  //
  // Both sets carry an em dash and an ampersand between them, which is exactly
  // the kind of character a hand-retyped string gets wrong.
  const { TIER_COMPARISON, DIALOG_OMIT_FEATURES, DIALOG_BINARY_FEATURES } = await import(
    "../src/components/TierComparisonTable"
  );
  const real = new Set(TIER_COMPARISON.map((r) => r.feature));

  for (const [set, name] of [
    [DIALOG_OMIT_FEATURES, "DIALOG_OMIT_FEATURES"],
    [DIALOG_BINARY_FEATURES, "DIALOG_BINARY_FEATURES"],
  ] as const) {
    for (const feature of set) {
      assert.ok(
        real.has(feature),
        `${name} names "${feature}", which is not a TIER_COMPARISON row — the override is a no-op. ` +
          `Rows are: ${[...real].map((f) => `"${f}"`).join(", ")}`
      );
    }
  }

  // The dialog must still show something worth reading. If a future edit omits
  // so much that only flat-tick rows survive, the table stops making any case
  // for paying and should be removed rather than left as decoration.
  const shown = TIER_COMPARISON.filter((r) => !DIALOG_OMIT_FEATURES.has(r.feature));
  assert.ok(shown.length >= 4, `the dialog table is down to ${shown.length} rows — too few to be worth rendering`);
  assert.ok(
    shown.some((r) => r.premium === true && r.account !== true),
    "the dialog table must keep at least one row where Premium gives something a free account does not"
  );
});

test("the Premium dialog stays closable once the table makes it tall", () => {
  const src = read("src/components/PremiumDialog.tsx");
  assert.match(src, /fixed inset-0[^"]*overflow-y-auto/, "the overlay must scroll, or a tall card hides its own close button");
  assert.match(src, /min-h-full items-center justify-center/, "min-h-full (not h-full) is what stops the card overflowing above the viewport");
  assert.doesNotMatch(
    src,
    /fixed inset-0 z-\[120\] flex items-center justify-center/,
    "the old centred, non-scrolling overlay put the close button at y = -23 on a 360x480 screen"
  );
  assert.match(src, /h-\[100dvh\]/, "dvh, or iOS Safari puts the dialog behind its own toolbars");
  assert.match(src, /safe-area-inset-top/, "the top inset is what keeps the close button clear of the notch");
  assert.match(src, /max-h-\[\d+vh\] overflow-y-auto/, "the table needs its own height cap and scroll");
});
