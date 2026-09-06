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
// "secure the current price before it increases" — a real Premium price
// increase (2026-09). It landed at $14.99 (the original announcement, kept live
// for a few days, named $19.99 as the target — the actual number that shipped
// was $14.99), which is why PREMIUM_NEXT_PRICE_AMOUNT was brought down to match
// PREMIUM_PRICE_AMOUNT rather than left pointing at the old figure: the
// announcement's whole job was done the moment the real price caught up to it,
// and it retires itself rather than needing a second edit to switch off. The
// honesty rule this file exists to pin: /editorial-policy's own line is
// "nothing here describes a process we don't actually run", and that applies to
// marketing copy exactly as much as to an article. Two things make the "lock in
// your price" claim true regardless of whether an increase is CURRENTLY
// announced:
//   • the "your price never rises while subscribed" guarantee holds either way
//     — checkout always creates a new subscription against whatever price is
//     currently configured, and nothing migrates an existing subscription to a
//     different one;
//   • the banner is SELF-RETIRING: the day PREMIUM_PRICE_AMOUNT is bumped to
//     match PREMIUM_NEXT_PRICE_AMOUNT, the announcement switches itself off
//     with no second flag to remember — the exact failure mode
//     /vendetta-countdown and /radiance-countdown both died from (see
//     tests/release-calendar.test.ts's own header for that history).
// ─────────────────────────────────────────────────────────────────────────────

test("the increase that just landed is reflected as today's price, and the announcement has retired", () => {
  // Pins the real, current business state (live price $14.99, nothing further
  // announced) so a careless edit changes it loudly rather than silently.
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

test("with nothing currently announced, the copy reads as the plain evergreen guarantee", () => {
  // No open increase to reference right now, so neither string should name a
  // price at all — inventing one here (even today's own $14.99) would read as
  // an announcement that doesn't exist.
  const line = premiumLockInLine();
  assert.equal(line, "Subscribe now and lock in this price for good — it never rises while you stay subscribed.");
  const tail = premiumLockInTail();
  assert.equal(tail, "locked in for good, cancel anytime");
});

test("the announced-increase branch is still correctly wired, for whenever the next one is set", () => {
  // Structural rather than behavioural, since flipping premiumPriceIncreaseAnnounced()
  // at runtime would mean re-importing the module under a different env — the
  // same "test the branch structurally" approach release-calendar.test.ts takes
  // for cases it can't cheaply flip either. Proves that WHEN
  // PREMIUM_NEXT_PRICE_AMOUNT next disagrees with PREMIUM_PRICE_AMOUNT, both
  // helpers still name both figures rather than silently reusing the retired
  // wording.
  const src = read("src/lib/site.ts");
  const lineFnAt = src.indexOf("export function premiumLockInLine()");
  const tailFnAt = src.indexOf("export function premiumLockInTail()");
  assert.ok(lineFnAt >= 0 && tailFnAt >= 0);
  const lineBody = src.slice(lineFnAt, tailFnAt);
  assert.match(lineBody, /PREMIUM_NEXT_PRICE_AMOUNT/, "premiumLockInLine's announced branch must reference the future price");
  assert.match(lineBody, /PREMIUM_PRICE_AMOUNT/, "premiumLockInLine's announced branch must still reference today's price");
  const tailBody = src.slice(tailFnAt);
  assert.match(tailBody, /PREMIUM_NEXT_PRICE_AMOUNT/, "premiumLockInTail's announced branch must reference the future price");
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
  for (const f of ["src/app/premium/page.tsx", "src/components/PremiumDialog.tsx", "src/components/PremiumSlideIn.tsx"]) {
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
