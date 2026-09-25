import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PREMIUM_PRICE_AMOUNT,
  PREMIUM_NEXT_PRICE_AMOUNT,
  PREMIUM_ANNUAL_AMOUNT,
  premiumPriceIncreaseAnnounced,
  premiumLockInLine,
  premiumLockInTail,
  premiumLockInHeadline,
  annualSavingPct,
} from "../src/lib/site";
import { ARTICLES } from "../src/lib/articles";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// "secure the current price before it increases" — the mechanism behind a real
// Premium price change. The honesty rule this file exists to pin:
// /editorial-policy's own line is "nothing here describes a process we don't
// actually run", and that applies to marketing copy exactly as much as to an
// article. Two things make the claim actually true rather than just
// persuasive-sounding:
//   • the "your price never rises while subscribed" guarantee holds REGARDLESS
//     of whether an increase is announced — checkout always creates a new
//     subscription against whatever price is currently configured, and nothing
//     migrates an existing subscription to a different one;
//   • the banner is SELF-RETIRING: the day the real cutover happens and
//     PREMIUM_PRICE_AMOUNT is bumped to match PREMIUM_NEXT_PRICE_AMOUNT, the
//     announcement switches itself off with no second flag to remember — the
//     exact failure mode /vendetta-countdown and /radiance-countdown both died
//     from (see tests/release-calendar.test.ts's own header for that history).
//
// The originally-announced increase (from $9.99 to $19.99) landed 2026-09-06
// at a real decided cutover price of $14.99, not $19.99 — see site.ts's own
// header for that. That raise was itself rolled back to $9.99/mo on 2026-09-09
// (see DECISIONS.md) before its own three-week hold period ran its course.
// With no further increase currently decided, the two amounts are pinned
// EQUAL, which is what proves the banner actually retired rather than just
// changed its number.
// ─────────────────────────────────────────────────────────────────────────────

test("today's decided price is what the site actually announces, with no increase pending", () => {
  // Pins the real business decision (current $9.99, no announced future
  // increase) so a careless edit changes it loudly rather than silently.
  assert.equal(PREMIUM_PRICE_AMOUNT, "$9.99");
  assert.equal(PREMIUM_NEXT_PRICE_AMOUNT, "$9.99");
  assert.equal(premiumPriceIncreaseAnnounced(), false);
});

test("the announcement is keyed on the two prices actually disagreeing, not a separate flag", () => {
  // Structural, not just behavioural: proves the mechanism is genuinely
  // self-retiring rather than a boolean someone has to remember to flip. The
  // day PREMIUM_PRICE_AMOUNT is bumped to match PREMIUM_NEXT_PRICE_AMOUNT,
  // this same comparison goes false with no second edit anywhere.
  const src = read("src/lib/site.ts");
  const fnAt = src.indexOf("export function premiumPriceIncreaseAnnounced()");
  assert.ok(fnAt >= 0, "expected premiumPriceIncreaseAnnounced to exist");
  const body = src.slice(fnAt, fnAt + 150);
  assert.match(body, /PREMIUM_NEXT_PRICE_AMOUNT\s*!==\s*PREMIUM_PRICE_AMOUNT/, "must compare the two live constants directly");
});

test("the lock-in guarantee is unconditional: checkout never migrates an existing subscription to a new price", () => {
  // The claim "your price never rises while subscribed" would be false the
  // moment something re-priced an active subscription. checkout must only ever
  // create NEW subscriptions against whatever price is currently configured.
  const checkout = read("src/app/api/premium/checkout/route.ts");
  assert.match(checkout, /line_items:\s*\[\{\s*price:\s*priceId/, "checkout must create a subscription against a single, current price");

  // The one legitimate subscriptions.update call in the app is a user-initiated
  // monthly→annual switch, not an automatic re-price of an existing sub — every
  // OTHER file must stay clear of it.
  const files = ["src/lib/premium.ts", "src/app/api/premium/subscription/route.ts"];
  for (const f of files) {
    const src = read(f);
    assert.ok(!/subscriptions\.update/.test(src), `${f} must not silently migrate a subscription's price`);
  }
});

test("with no announcement live, both helpers still make the case that the price rises as the site grows", () => {
  // Live constants are currently equal (see the test above) — no increase is
  // announced right now, so both helpers must return their steady-state copy,
  // not the "raising Premium's price soon" branch.
  //
  // REWRITTEN 2026-09-22 (owner: "for premium, we need to emphasis get
  // premium now before the price increases as the site grows"). The old
  // steady-state copy was "Subscribe now and lock in this price for good —
  // it never rises while you stay subscribed": true, but purely defensive,
  // and it gave a visitor no reason to act TODAY rather than next month. The
  // new copy states the standing pricing policy (the price goes up as
  // coverage grows) alongside the guarantee (your rate doesn't).
  //
  // What must NOT come back is a specific future number or date in this
  // branch — see the "no surface invents an exact date" test below, and
  // premiumLockInHeadline's own comment for why the growth claim is honest
  // while an invented deadline would not be.
  assert.equal(
    premiumLockInLine(),
    "Premium's price goes up as the site grows — more markets, more stores, deeper history. Your rate doesn't: subscribe at $9.99/month and keep it for as long as you stay subscribed.",
  );
  assert.equal(premiumLockInTail(), "locked in before the price goes up — cancel anytime");
  // The steady-state branch must not SOUND announced: no "rises to $X",
  // no "soon". (It can't be checked by looking for PREMIUM_NEXT_PRICE_AMOUNT
  // itself — in the steady state that constant IS today's price by
  // definition, so it legitimately appears.)
  assert.ok(!/rises to|increasing soon/i.test(premiumLockInLine()), "steady state must not imply an announced increase");
});

test("the announced-increase branch, when it DOES fire, names both the current and future price", () => {
  // Can't flip PREMIUM_NEXT_PRICE_AMOUNT at runtime to exercise this branch live
  // (it's a module-level constant read once at import) — so this checks the
  // branch's own template source instead, the same way the self-retiring
  // comparison itself is checked structurally in the test above it.
  const src = read("src/lib/site.ts");
  const lineFnAt = src.indexOf("export function premiumLockInLine()");
  const lineBody = src.slice(lineFnAt, lineFnAt + 400);
  assert.match(lineBody, /\$\{PREMIUM_PRICE_AMOUNT\}/, "the announced sentence must still state today's price");
  assert.match(lineBody, /\$\{PREMIUM_NEXT_PRICE_AMOUNT\}/, "the announced sentence must state the future price");

  const tailFnAt = src.indexOf("export function premiumLockInTail()");
  const tailBody = src.slice(tailFnAt, tailFnAt + 300);
  assert.match(tailBody, /\$\{PREMIUM_NEXT_PRICE_AMOUNT\}/, "the announced compact caption must also name the future price");
});

test("no surface invents an exact date for an increase that doesn't have one yet", () => {
  // The whole reason this shipped as an amount-comparison rather than a
  // countdown: there is no real date to count down to. A hard-coded date
  // literal anywhere in this feature would be exactly the kind of claim
  // /editorial-policy exists to rule out — see the release-calendar tests for
  // the same guard applied to set release dates.
  const datePattern = /\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|\d{4}-\d{2}-\d{2}/;
  assert.ok(!datePattern.test(premiumLockInLine()), "premiumLockInLine must not name a specific date");
  assert.ok(!datePattern.test(premiumLockInTail()), "premiumLockInTail must not name a specific date");
  // Both branches of both banner helpers, now that the steady state renders a
  // banner of its own (2026-09-22) rather than only a caption.
  assert.ok(!datePattern.test(premiumLockInHeadline()), "premiumLockInHeadline must not name a specific date");
  const siteSrc = read("src/lib/site.ts");
  for (const fn of ["premiumLockInLine", "premiumLockInTail", "premiumLockInHeadline"]) {
    const at = siteSrc.indexOf(`export function ${fn}()`);
    assert.ok(at >= 0, `expected ${fn} to exist`);
    // The function BODY only — the comment above it is free to discuss real
    // historical dates ("$9.99 → $14.99 (2026-09-06)"), which is exactly what
    // a naive whole-file scan would trip over.
    const body = siteSrc.slice(at, siteSrc.indexOf("\n}", at));
    assert.ok(!datePattern.test(body), `${fn}'s returned copy must not hard-code a date`);
  }
  for (const f of [
    "src/app/premium/page.tsx",
    "src/components/PremiumDialog.tsx",
    "src/components/PremiumSlideIn.tsx",
    // SignupPromoPopup dropped 2026-09-16: it quotes no price, so it has no
    // price-increase banner to hard-code a date into.
  ]) {
    const src = read(f);
    // The announced branch still says "Price increasing soon" verbatim in the
    // slide-in and dialog, and via premiumLockInHeadline() on the page — so
    // match on the shared helper OR the literal, whichever that surface uses.
    const banner = /(Price increasing soon|premiumLockInHeadline\(\))[\s\S]{0,500}/.exec(src);
    assert.ok(banner, `${f}: expected the price-increase banner`);
    assert.ok(!datePattern.test(banner![0]), `${f}: the price-increase banner must not hard-code a date`);
  }
});

test("every surface that pitches a price shares the ONE lock-in helper, rather than a hand-typed copy each", () => {
  // Same drift PITCH_TOOLS's own header comment describes for the tool list:
  // four hand-written copies of the same claim is how one of them goes stale
  // the day the real increase lands and the others don't get updated with it.
  for (const [file, fn] of [
    ["src/app/premium/page.tsx", "premiumLockInLine"],
    ["src/components/PremiumDialog.tsx", "premiumLockInLine"],
    ["src/components/PremiumSlideIn.tsx", "premiumLockInTail"],
    // SignupPromoPopup dropped 2026-09-16: no price pitch, no lock-in copy.
  ] as const) {
    const src = read(file);
    assert.match(src, new RegExp(`\\b${fn}\\b`), `${file} must render its lock-in copy via ${fn}(), not a hand-typed string`);
    assert.ok(!/locked in for good, cancel anytime/.test(src), `${file} still hand-types the old, non-self-updating copy inline`);
  }
});

test("the full-banner treatment is gated on NOT already being Premium", () => {
  // An already-Premium visitor is grandfathered regardless of any announcement
  // — showing them urgency to \"lock in\" a price they're already locked into
  // is either confusing or, worse, reads as a threat that THEIR price might
  // rise too. The page and dialog gate the banner itself, immediately above
  // it; the slide-in instead gates its ENTIRE render behind `!premium` much
  // earlier (see premium-slidein.test.ts's own "only ever targets a...
  // non-Premium user" test for that), so the banner text just has to exist
  // somewhere after that check, not immediately above it.
  // 2026-09-22: the page and dialog now render this banner in BOTH states
  // (announced and steady), so the anchor is the shared headline helper rather
  // than the announced branch's literal text — but the gate it must sit behind
  // is unchanged, and that is the whole point of this test.
  for (const file of ["src/app/premium/page.tsx", "src/components/PremiumDialog.tsx"]) {
    const src = read(file);
    // The JSX call, not the import line at the top of the file.
    const bannerAt = src.indexOf("{premiumLockInHeadline()}");
    assert.ok(bannerAt >= 0, `${file}: expected the price-increase banner`);
    const before = src.slice(Math.max(0, bannerAt - 900), bannerAt);
    assert.match(before, /!already|!premium/, `${file}: the banner must be gated behind a "not already Premium" check`);
  }

  const slideIn = read("src/components/PremiumSlideIn.tsx");
  const eligibleAt = slideIn.indexOf("const eligible =");
  const bannerAt = slideIn.indexOf("Price increasing soon");
  assert.ok(eligibleAt >= 0 && bannerAt >= 0, "PremiumSlideIn.tsx: expected both the eligibility gate and the banner");
  assert.match(
    slideIn.slice(eligibleAt, eligibleAt + 200),
    /!premium/,
    "PremiumSlideIn.tsx: the whole component's render must be gated behind !premium",
  );
  assert.ok(eligibleAt < bannerAt, "PremiumSlideIn.tsx: the eligibility gate must be defined before the banner it protects");
});

// ─────────────────────────────────────────────────────────────────────────────
// FOUND live while landing the original $9.99→$14.99 increase: the editorial
// article about Premium's pricing (riftcompare-premium-explained) had its own
// hand-typed dollar/percentage figures — none of them wired to lib/site.ts at
// all, so bumping PREMIUM_PRICE_AMOUNT changed every LIVE surface (the page,
// the dialog, both nudges) and silently left this one article quoting a stale
// price and savings percentage. Markdown prose can't import a constant, so the
// fix here is this test: it re-derives every number the article states from
// the SAME constants the rest of the site reads, the same principle
// tests/deck-archetypes-article.test.ts and tests/best-cards-article.test.ts
// already apply to their own numeric claims. Caught the same class of bug
// again on the 2026-09-09 rollback to $9.99 — the article's hand-typed prose
// had to be edited by hand right alongside the constants, exactly as this
// test's own existence predicts it always will.
// ─────────────────────────────────────────────────────────────────────────────

test("the Premium-explained article states the price the site actually charges, not a stale one", () => {
  const article = ARTICLES.find((a) => a.slug === "riftcompare-premium-explained");
  assert.ok(article, "expected the riftcompare-premium-explained article to exist");

  const savePct = annualSavingPct();
  const monthlyNum = Number(PREMIUM_PRICE_AMOUNT.replace(/[^0-9.]/g, ""));
  const yearlyPayingMonthly = (monthlyNum * 12).toFixed(2);

  const haystack = [
    article!.excerpt,
    ...(article!.summary ?? []),
    ...(article!.faq ?? []).map((f) => f.a),
    article!.body,
  ].join("\n");

  assert.ok(haystack.includes(PREMIUM_PRICE_AMOUNT), `article must quote today's actual monthly price (${PREMIUM_PRICE_AMOUNT})`);
  assert.ok(haystack.includes(PREMIUM_ANNUAL_AMOUNT), `article must quote today's actual annual price (${PREMIUM_ANNUAL_AMOUNT})`);
  assert.ok(haystack.includes(`${savePct}%`), `article's stated annual saving must match the computed ${savePct}%`);
  assert.ok(
    haystack.includes(`$${yearlyPayingMonthly}`),
    `article's "paying monthly for a year" comparison must equal 12× today's monthly price ($${yearlyPayingMonthly})`,
  );

  // Belt-and-braces: a price this test doesn't happen to check for (a third
  // plan, a regional variant) could still go stale silently — so also assert
  // the RETIRED prices are gone outright, not just that the current ones are
  // present. $14.99/$119.99 are retired as of the 2026-09-09 rollback to
  // $9.99/$79.99 (see DECISIONS.md) — the inverse of this same check when
  // $9.99 was itself the retired price, right after the original raise.
  assert.ok(!haystack.includes("$14.99"), "article must not still quote the retired $14.99 price anywhere");
  assert.ok(!haystack.includes("$119.99"), "article must not still quote the retired $119.99 annual price anywhere");
});

// ─────────────────────────────────────────────────────────────────────────────
// "get rid of the pop up when you click premium and send them straight to the
// page" (2026-09-06, explicit product instruction). Every "✦ Premium" / "✦ Get
// Premium" entry point used to call usePremiumDialog().open(); each now
// navigates straight to /premium instead. PremiumButton itself is UNCHANGED —
// it still opens the dialog, deliberately, for the ~10 gated-tool-wall CTAs
// ("Upgrade now · $X/mo") that were never part of this instruction and still
// benefit from a one-click checkout without leaving the page they're on.
// ─────────────────────────────────────────────────────────────────────────────

test("every literal 'Premium' nav entry point navigates straight to /premium, not the dialog", () => {
  for (const file of [
    "src/components/Navbar.tsx",
    "src/components/CinematicNavMenu.tsx",
    "src/components/UserMenu.tsx",
  ]) {
    const src = read(file);
    assert.match(src, /PremiumNavLink/, `${file} must use PremiumNavLink, not the dialog, for its "Premium" link`);
    assert.ok(!/usePremiumDialog/.test(src), `${file} must no longer import the dialog hook at all`);
  }

  const slideIn = read("src/components/PremiumSlideIn.tsx");
  assert.ok(!/usePremiumDialog/.test(slideIn), "PremiumSlideIn must no longer import the dialog hook");
  assert.match(slideIn, /router\.push\(["']\/premium["']\)/, "PremiumSlideIn's CTA must navigate straight to /premium");
});

test("PremiumButton (the gated-tool-wall CTA) still opens the dialog — this instruction never touched it", () => {
  // The one deliberate exception, pinned so a future pass doesn't "finish the
  // job" by ripping the dialog out of the ~10 tool pages that still want a
  // one-click, stay-on-the-page checkout.
  const src = read("src/components/PremiumButton.tsx");
  assert.match(src, /usePremiumDialog/, "PremiumButton must still open the shared dialog");
  // The Bulk Pricer and Value Finder pages were the other two here until they
  // left the product on 2026-09-25 (both URLs 301 to free pages now).
  const usages = [
    "src/app/tools/best-basket/page.tsx",
    "src/components/BestBasket.tsx",
    "src/app/tools/deal-finder/page.tsx",
    "src/app/tools/rising/page.tsx",
  ];
  for (const f of usages) {
    assert.match(read(f), /<PremiumButton/, `${f} must still use the dialog-opening PremiumButton`);
  }
});

test("the premium-interest beacon still fires from every retired dialog entry point", () => {
  // PremiumDialog's own open() used to be the ONLY place this beacon fired —
  // losing it silently would blind the admin-facing "who clicked a Premium CTA"
  // signal the moment the dialog stopped being what those links open.
  const helper = read("src/lib/analytics.ts");
  assert.match(helper, /export function firePremiumClickBeacon/, "expected the shared beacon helper");
  assert.match(helper, /api\/premium\/click/, "the helper must hit the same endpoint the dialog used to");

  const navLink = read("src/components/PremiumNavLink.tsx");
  assert.match(navLink, /firePremiumClickBeacon/, "PremiumNavLink must fire the beacon on click");

  const slideIn = read("src/components/PremiumSlideIn.tsx");
  const acceptAt = slideIn.indexOf("const accept = ");
  assert.ok(acceptAt >= 0, "expected PremiumSlideIn's accept() handler");
  assert.match(slideIn.slice(acceptAt, acceptAt + 500), /firePremiumClickBeacon/, "PremiumSlideIn's CTA must fire the beacon before navigating");
});

test("SignupPromoPopup shows NO price at all — it sells the free account (2026-09-16)", () => {
  // THIS TEST USED TO PIN THE OPPOSITE, and the reversal is the point. From
  // 2026-09-06 the popup always showed a price ("we also need to show the
  // prices for non logged in users"), simplified on 2026-09-09 to a bare "$0
  // today". On 2026-09-16 the owner took the Premium pitch off this surface
  // entirely: it now sells the free account, so there is no price to show
  // honestly or dishonestly.
  //
  // The $0-today honesty guarantee that used to live here is NOT lost — it
  // moved with the pitch. PremiumSlideIn, PremiumDialog, PremiumCta and
  // /premium all still carry it, and all four are still in this file's own
  // surface lists above plus tests/premium-zero-today.test.ts.
  const src = read("src/components/SignupPromoPopup.tsx");
  assert.ok(!/PREMIUM_PRICE_AMOUNT/.test(src), "no price block on a card that asks for no money");
  assert.ok(!/premiumZeroToday|premiumFromLine|premiumLockInTail/.test(src), "no price helpers");
  assert.ok(!/Price increasing soon/.test(src), "no price-increase banner");
  // What it must say instead: signing up is free and needs no card.
  assert.match(src, /Free, no card needed/, "the free-account ask must state it costs nothing");
});

test("PremiumSlideIn always shows a price too; the trial-eligible branch is a bare $0 today (2026-09-09)", () => {
  // The slide-in had the SAME bug SignupPromoPopup was fixed for on 2026-09-06
  // (a price hidden whenever trialEligible — true for nearly every logged-in
  // free visitor) but was missed in that pass. Hiding the price never stopped
  // Stripe from charging it at checkout; it just moved the surprise to the
  // most expensive place to lose someone. Fixed 2026-09-08 (always show SOME
  // number) then simplified further 2026-09-09 (bare "$0 today", no recurring
  // price stated in this branch) — see PremiumSlideIn's own header comment on
  // the price block and DECISIONS.md for the full reasoning either way.
  const src = read("src/components/PremiumSlideIn.tsx");
  assert.ok(
    !/\{!trialEligible && PREMIUM_PRICE_AMOUNT/.test(src),
    "the price block must not be gated on !trialEligible — that was the exact bug",
  );
  const priceBlockAt = src.indexOf("{PREMIUM_PRICE_AMOUNT ? (");
  assert.ok(priceBlockAt >= 0, "expected an unconditional price block");
  // 1000, not 600 (2026-09-24): the trial branch now also states the intro
  // offer ("then $4.99/mo for 3 months (half price)") — still no recurring
  // premiumFromLine() there, which the assertions below keep pinning.
  const block = src.slice(priceBlockAt, priceBlockAt + 1000);
  const trialBranchAt = block.indexOf("trialEligible ? (");
  assert.ok(trialBranchAt >= 0, "expected a trialEligible branch");
  const elseAt = block.indexOf(") : (", trialBranchAt);
  assert.ok(elseAt >= 0, "expected the non-trial else branch");
  const trialBranch = block.slice(trialBranchAt, elseAt);
  const nonTrialBranch = block.slice(elseAt);
  assert.match(trialBranch, /premiumZeroToday\(\)/, "trial-eligible branch must use the shared $0-today helper");
  assert.match(trialBranch, /introOfferEnabled\(\) && introEligible &&[\s\S]*tierIntroMonthlyAmount\(\)/, "the intro price is stated beside the $0, from the shared helper");
  assert.ok(!/premiumFromLine\(\)/.test(trialBranch), "trial-eligible branch must NOT also state the recurring price — bare $0 today, by design");
  // introFromLine (2026-09-25): the real recurring price, with the half-price
  // months for a viewer checkout would give them to (a cancelled trialist).
  assert.match(nonTrialBranch, /introFromLine\("premium", introEligible\)/, "non-trial branch (no $0 to claim) must still state the real recurring price");
  assert.match(nonTrialBranch, /premiumLockInTail\(\)/, "non-trial branch must still use the shared lock-in helper");
});
