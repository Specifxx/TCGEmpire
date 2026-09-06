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
// The originally-announced increase (from $9.99 to $19.99) landed 2026-09-06,
// except the real decided cutover price came in at $14.99, not $19.99 — see
// site.ts's own header for that. With no further increase currently decided,
// the two amounts are pinned EQUAL, which is what proves the banner actually
// retired rather than just changed its number.
// ─────────────────────────────────────────────────────────────────────────────

test("today's decided price increase is what the site actually announces", () => {
  // Pins the real business decision (current $14.99, no announced future
  // increase) so a careless edit changes it loudly rather than silently.
  assert.equal(PREMIUM_PRICE_AMOUNT, "$14.99");
  assert.equal(PREMIUM_NEXT_PRICE_AMOUNT, "$14.99");
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

test("with no announcement live, the full sentence and the compact tail both say the price is locked in for good", () => {
  // Live constants are currently equal (see the test above) — no increase is
  // announced right now, so both helpers must return their steady-state copy,
  // not the "raising Premium's price soon" branch.
  assert.equal(premiumLockInLine(), "Subscribe now and lock in this price for good — it never rises while you stay subscribed.");
  assert.equal(premiumLockInTail(), "locked in for good, cancel anytime");
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
  for (const f of [
    "src/app/premium/page.tsx",
    "src/components/PremiumDialog.tsx",
    "src/components/PremiumSlideIn.tsx",
    "src/components/SignupPromoPopup.tsx",
  ]) {
    const src = read(f);
    const banner = /Price increasing soon[\s\S]{0,400}/.exec(src);
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
    ["src/components/SignupPromoPopup.tsx", "premiumLockInTail"],
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
  for (const file of ["src/app/premium/page.tsx", "src/components/PremiumDialog.tsx"]) {
    const src = read(file);
    const bannerAt = src.indexOf("Price increasing soon");
    assert.ok(bannerAt >= 0, `${file}: expected the price-increase banner`);
    const before = src.slice(Math.max(0, bannerAt - 400), bannerAt);
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
// FOUND live while landing this exact increase: the editorial article about
// Premium's pricing (riftcompare-premium-explained) had its own hand-typed
// $9.99/$79.99/33%/$119.88 figures — none of them wired to lib/site.ts at all,
// so bumping PREMIUM_PRICE_AMOUNT changed every LIVE surface (the page, the
// dialog, both nudges) and silently left this one article quoting the retired
// price and a stale savings percentage. Markdown prose can't import a
// constant, so the fix here is this test: it re-derives every number the
// article states from the SAME constants the rest of the site reads, the same
// principle tests/deck-archetypes-article.test.ts and
// tests/best-cards-article.test.ts already apply to their own numeric claims.
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
  // the RETIRED price is gone outright, not just that the current one is present.
  assert.ok(!haystack.includes("$9.99"), "article must not still quote the retired $9.99 price anywhere");
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
  const usages = [
    "src/app/bulk-pricer/page.tsx",
    "src/app/tools/value-finder/page.tsx",
    "src/app/tools/deal-finder/page.tsx",
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

test("SignupPromoPopup always shows a price, even while a free trial is available", () => {
  // "we also need to show the prices for non logged in users" (2026-09-06) —
  // the price used to disappear entirely whenever a trial was configured
  // (which is the default), so a signed-out visitor almost never saw one.
  const src = read("src/components/SignupPromoPopup.tsx");
  const priceBlockAt = src.indexOf("{PREMIUM_PRICE_AMOUNT ? (");
  assert.ok(priceBlockAt >= 0, "expected an unconditional price block (not gated on !trialAvailable)");
  assert.ok(
    !/\{!trialAvailable && PREMIUM_PRICE_AMOUNT/.test(src),
    "the price block must no longer be hidden while a trial is available",
  );
  const block = src.slice(priceBlockAt, priceBlockAt + 400);
  assert.match(block, /trialAvailable \? " after your free trial" : ""/, "must say 'after your free trial' rather than contradict the trial CTA");
  assert.match(block, /premiumLockInTail\(\)/, "must still use the shared lock-in helper");
});
