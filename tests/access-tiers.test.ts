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

const BASKET = "src/app/tools/best-basket/page.tsx";
const BASKET_API = "src/app/api/basket/route.ts";
const PREMIUM_LIB = "src/lib/premium.ts";
const OAUTH_CALLBACK = "src/app/api/auth/oauth/[provider]/callback/route.ts";

test("the Bulk Pricer is gone: its list pricing is free on /deck, and /bulk-pricer redirects there", () => {
  // 2026-09-25: the Premium Bulk Pricer was a wall over the same /api/deck/price
  // the free, no-account /deck uses. Its capabilities (plain names, unmatched
  // lines listed, quantity editing, search-to-add) moved into /deck.
  assert.ok(!exists("src/app/bulk-pricer/page.tsx"), "the /bulk-pricer page must be deleted");
  assert.ok(!exists("src/components/BulkPricer.tsx"), "BulkPricer.tsx must be deleted");
  assert.match(read("next.config.js"), /source: "\/bulk-pricer", destination: "\/deck", permanent: true/);
  const deck = read("src/components/DeckBuilder.tsx");
  assert.match(deck, /CardSearch/, "/deck keeps search-to-add");
  assert.match(deck, /QtyInput/, "/deck keeps quantity editing");
  assert.match(read("src/app/api/deck/price/route.ts"), /plainNames: true/, "/deck prices plain names without quantities");
});

test("Best Basket's store-by-store plan is Premium; an account gets its own total", () => {
  // Best Basket is Premium (see the tier note in lib/premium.ts). Since
  // 2026-09-25 a free account gets a click-only preview of its own delivered
  // total, so the page renders the tool for any account and tells it which
  // view to show; hasAccount() alone would hand everyone the full plan.
  const src = read(BASKET);
  assert.match(src, /isPremium\(user, "premium"\)/, `${BASKET} must decide the view via isPremium(user, "premium")`);
  assert.match(src, /full=\{premium\}/);
  assert.ok(!/hasAccount\s*\(/.test(src), `${BASKET} must not gate on hasAccount()`);
});

test("the basket API tiers its answer server-side, not in the page", () => {
  // The page only picks the UI — that's no obstacle to a caller hitting this
  // route directly, so the route decides what the response carries.
  const src = read(BASKET_API);
  assert.match(src, /if \(!user\) return NextResponse\.json\(/, "must still reject signed-out callers");
  assert.match(src, /const full = isPremium\(user, "premium"\)/);
  assert.match(src, /if \(!full\) \{\s*const preview = basketPreview\(optimizeBasket\(/, "non-Premium gets the preview aggregate only");
  // The aggregate plus where delivery was priced to — never the plan. For a set
  // (2026-09-29) it adds only setGapFields(false, …): counts, no store, line or link
  // (tests/set-gap.test.ts pins its keys and that no store name can be in it).
  assert.match(src, /res: NextResponse\.json\(\{ \.\.\.preview, shipping, \.\.\.\(setGap \? setGapFields\(false, setGap\) : \{\}\) \}, /);
});

test("Best Basket renders its heading and intro for everyone, above the sign-in split", () => {
  const src = read(BASKET);
  // The heading and intro must render for everyone, or the page drops out of the
  // index for the terms it ranks on.
  const gateIdx = src.indexOf("{user ? (");
  assert.ok(gateIdx > 0, "expected a signed-in ternary around the tool");
  const beforeGate = src.slice(0, gateIdx);
  assert.match(beforeGate, /<h1/, "the H1 must render above the gate, for signed-out visitors too");
  assert.match(beforeGate, /HubIntro/, "the hub intro must render above the gate");
});

test("Best Basket doesn't advertise itself as needing no account", () => {
  // It needs an account (and Premium for the plan); a stale claim here is a
  // promise the sign-in card immediately breaks.
  const src = read(BASKET);
  assert.ok(!/No account needed/i.test(src), `${BASKET} still claims "no account needed"`);
  assert.ok(!/no sign-in required/i.test(src), `${BASKET} still claims "no sign-in required"`);
});

// The signed-out sign-up popup's own guarantees (signed-out only, no promo
// gate, no price, "free, no card needed", no grant, no fake scarcity) lived
// here until the popup was removed on 2026-09-30 ("The sign-up slider is gone:
// sign-up prompts live in the page"). The same honesty guarantees now pin its
// replacement, InlineSignupPrompt, in tests/signup-inline.test.ts.

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
  assert.match(src, /export async function grantPremiumDays\(userId: string, days: number/);
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
// reach it — the (since removed) SignupPromoPopup's bug, fixed in 263eaeb.
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
  // "Full list" up to a plain tick would lose the Plus-vs-Premium distinction
  // this table exists to draw.
  assert.match(shared, /account: "Top 3", plus: "Full list", premium: "Full list"/);

  // THE FREE COLUMN ON THESE TWO IS "Top 3" (2026-09-23). A signed-in free
  // account sees the top three rows of each — both pages query at that size
  // for a free account (tests/tool-free-top3.test.ts pins the queries). It was
  // false from 2026-09-22 and "Top pick" before that. This is the assertion
  // that fails if the gate moves without the pricing page being told.
  for (const feature of ["Deal Finder", "Rising Cards"]) {
    assert.match(
      shared,
      new RegExp(`\\{ feature: "${feature}", account: "Top 3",`),
      `${feature} must say what a free account actually sees`,
    );
  }
  // Matched against the ROWS, not the file: the comment above them explains the
  // history and necessarily quotes the old strings.
  assert.doesNotMatch(
    shared.slice(shared.indexOf("TIER_COMPARISON: TierRow[]"), shared.indexOf("export function TierCell")).replace(/\/\/[^\n]*/g, "").replace(/"Rising Sealed[^\n]*/g, ""),
    /"Top pick"/,
    "no row but Rising Sealed's may promise a single free top pick",
  );

  // The "No account" column was removed on 2026-09-22 — signed-out and free
  // differ on two rows, which is the in-page sign-up prompts' job
  // (InlineSignupPrompt, since the popup's removal on 2026-09-30), not the
  // pricing page's.
  assert.doesNotMatch(shared, /\banon\b/, "the anon column must stay gone");
  assert.doesNotMatch(shared, /No account/, "the No account header must stay gone");
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

  // 2026-09-25: the compact table is exactly what a payment changes. Every
  // all-tick row is omitted (it tells a buyer nothing), every differentiating
  // row is shown, and the ad-free row — hidden "for length" until now, which
  // kept Plus's headline off the two surfaces that convert — is shown.
  const allTick = (r: (typeof TIER_COMPARISON)[number]) => r.account === true && r.plus === true && r.premium === true;
  for (const r of TIER_COMPARISON) {
    assert.equal(DIALOG_OMIT_FEATURES.has(r.feature), allTick(r), `${r.feature}: omitted from the dialog iff it is ticked for everyone`);
  }
  assert.ok(shown.some((r) => r.feature === "Ad-free experience"), "the dialog must show that Plus is ad-free");
  // The binary collapse only ever ticks a paid column that already gets the
  // FULL thing — never Best Basket, whose Plus cell is only "Your total".
  for (const f of DIALOG_BINARY_FEATURES) {
    const r = TIER_COMPARISON.find((x) => x.feature === f)!;
    assert.equal(r.plus, r.premium, `${f}: collapsing both paid cells to ✓ is only honest when they are equal`);
    assert.notEqual(r.plus, false);
  }
});

test("the Premium dialog stays closable once the table makes it tall", () => {
  // 2026-09-16: the scroll-safe overlay shape this test guards moved OUT of
  // PremiumDialog.tsx and into ui/Dialog.tsx — the shared shell six other
  // hand-rolled modals migrated onto in the same pass — rather than staying a
  // copy only this one dialog had. The protection is the same; where it lives
  // changed. See ui/Dialog.tsx's own "THE OVERLAY SCROLLS" comment for the
  // full history (the 263eaeb short-phone incident this test was written
  // for).
  const dialogSrc = read("src/components/ui/Dialog.tsx");
  assert.match(dialogSrc, /fixed inset-0[^"]*overflow-y-auto/, "the overlay must scroll, or a tall card hides its own close button");
  assert.match(dialogSrc, /min-h-full/, "min-h-full (not h-full) is what stops the card overflowing above the viewport");
  assert.match(dialogSrc, /items-center/, "the centred placement must actually centre");
  assert.doesNotMatch(
    dialogSrc,
    /fixed inset-0[^`]*flex items-center justify-center/,
    "the old centred, non-scrolling overlay put the close button at y = -23 on a 360x480 screen — the overlay itself must not be the flex-centring element"
  );
  assert.match(dialogSrc, /h-\[100dvh\]/, "dvh, or iOS Safari puts the dialog behind its own toolbars");
  assert.match(dialogSrc, /safe-area-inset-top/, "the top inset is what keeps the close button clear of the notch");

  // PremiumDialog itself must actually be ON this shell (not a stray copy)
  // and keep its own additional cap on the tier table.
  const src = read("src/components/PremiumDialog.tsx");
  assert.match(src, /import \{ Dialog \} from "\.\/ui\/Dialog"/, "PremiumDialog must render through the shared Dialog shell");
  assert.match(src, /<Dialog open=\{isOpen\}/, "PremiumDialog's provider must control Dialog's open state");
  assert.doesNotMatch(src, /document\.body\.style\.overflow/, "scroll lock now belongs to Dialog, not a private copy");
  assert.match(src, /max-h-\[\d+vh\] overflow-y-auto/, "the table needs its own height cap and scroll");
});
