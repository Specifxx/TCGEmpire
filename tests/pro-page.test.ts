import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RATE_AFTER_MS,
  RATE_AFTER_PAGES,
  RATE_INTENT_PAGES,
  RATE_MAX_ASKS,
  RATE_SNOOZE_MS,
  RATE_VISIT_GAP_MS,
  countPageView,
  freshRateState,
  parseRateState,
  shouldAskRating,
  shouldShowPricingNudge,
} from "../src/lib/rate-prompt";
import { MIN_RATINGS_TO_SHOW, ratingLine, ratingToShow } from "../src/lib/site-rating";
import { PREMIUM_ANNUAL_AMOUNT, PREMIUM_PRICE_AMOUNT, annualSavingPct, premiumEffectiveMonthly } from "../src/lib/site";

// The Collectr-style Premium page and the "Rate RiftCompare" prompt (owner,
// 2026-10-26). DECISIONS.md, "Premium: Collectr's model, $6.99 or $3.99/mo yearly".
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const T0 = 1_800_000_000_000;

test("Premium is $4.99 a month or $39.99 a year ($3.33 a month) again from 2026-11-05, August's price", () => {
  assert.equal(PREMIUM_PRICE_AMOUNT, "$4.99");
  assert.equal(PREMIUM_ANNUAL_AMOUNT, "$39.99");
  assert.equal(premiumEffectiveMonthly("premium"), "$3.33");
  assert.equal(annualSavingPct("premium"), 33, "$39.99 against 12 × $4.99 = $59.88");
});

const V = { pages: 2, otherPromptShown: false };
const engaged = { ...freshRateState(T0), pages: RATE_AFTER_PAGES, visits: 2 };

test("the rate prompt never asks on arrival: a few minutes and pages first (relaxed 2026-10-28)", () => {
  const now = T0 + RATE_AFTER_MS;
  const first = { ...engaged, visits: 1 };
  assert.equal(shouldAskRating(first, now, "/card/x", V), true, "a first visit may be asked after real use");
  assert.equal(shouldAskRating({ ...engaged, pages: RATE_AFTER_PAGES - 1 }, now, "/card/x", V), false, "too few pages");
  assert.equal(shouldAskRating(engaged, now - 1, "/card/x", V), false, "too soon");
  assert.equal(shouldAskRating(engaged, now, "/card/x", { pages: 1, otherPromptShown: false }), false, "never on a visit's first page");
  assert.equal(shouldAskRating(engaged, now, "/card/x", { pages: 3, otherPromptShown: true }), false, "one uninvited prompt per visit");
  for (const p of ["/login", "/admin/x", "/premium", "/premium/start", "/embed/card", "/games/x", "/contact"]) assert.equal(shouldAskRating(engaged, now, p, V), false, p);
  assert.ok(RATE_AFTER_PAGES >= 4 && RATE_AFTER_MS >= 3 * 60_000, "never on arrival");
});

test("coming back from a store tab may bring the card early, but not on a first page view", () => {
  const s = { ...freshRateState(T0), pages: RATE_INTENT_PAGES };
  const I = { pages: RATE_INTENT_PAGES, otherPromptShown: false, intent: true };
  assert.equal(shouldAskRating(s, T0 + 10_000, "/card/x", I), true);
  // 2026-11-03: not even after a store click on the page they landed on.
  assert.equal(shouldAskRating(s, T0 + 10_000, "/card/x", { ...I, pages: 1 }), false, "one page of this visit is arrival");
  assert.equal(shouldAskRating(s, T0 + 10_000, "/card/x", { ...I, otherPromptShown: true }), false);
  assert.equal(shouldAskRating({ ...s, rated: true }, T0 + 10_000, "/card/x", I), false);
  const c = read("src/components/RateUsPrompt.tsx");
  assert.match(c, /BUY_CLICK_EVENT/);
  assert.match(c, /visibilitychange/);
});

test("one interruption per visit, never on arrival: the rating drive is over (owner, 2026-11-03)", () => {
  const c = read("src/components/RateUsPrompt.tsx");
  assert.doesNotMatch(c, /<Dialog\b/, "no centred pop-up any more");
  assert.doesNotMatch(c, /rating-drive/, "and no drive to ask about");
  assert.doesNotMatch(read("src/lib/rate-prompt.ts"), /export const RATING_DRIVE/);
  // The Pricing callout: a returning visitor, from the second page of a visit.
  const fresh = freshRateState(T0);
  assert.equal(shouldShowPricingNudge(fresh, 5), false, "never in a first visit");
  assert.equal(shouldShowPricingNudge({ ...fresh, visits: 2 }, 1), false, "never on a visit's first page");
  assert.equal(shouldShowPricingNudge({ ...fresh, visits: 2 }, 2), true);
  // The callout itself went on 2026-11-03 (owner: no Premium or sign-up sliders).
  assert.ok(!existsSync(join(process.cwd(), "src/components/PricingNudge.tsx")));
  assert.match(c, /otherPromptShown: otherPromptShown\(\)/, "the card still yields to the visit's slot");
});

test("a page view after a long gap is a new visit", () => {
  const a = countPageView(freshRateState(T0), T0);
  const b = countPageView(a, T0 + 60_000);
  assert.equal(b.visits, 1);
  assert.equal(countPageView(b, T0 + 60_000 + RATE_VISIT_GAP_MS).visits, 2);
  assert.equal(b.pages, 2);
});

test("a rating or Don't ask again ends it for good; closing waits a month; it gives up after two asks", () => {
  const now = T0 + RATE_AFTER_MS;
  assert.equal(shouldAskRating({ ...engaged, rated: true }, now, "/", V), false);
  assert.equal(shouldAskRating({ ...engaged, optedOut: true }, now, "/", V), false);
  assert.equal(shouldAskRating({ ...engaged, snoozedAt: now }, now + RATE_SNOOZE_MS - 1, "/", V), false);
  assert.equal(shouldAskRating({ ...engaged, snoozedAt: now }, now + RATE_SNOOZE_MS, "/", V), true);
  assert.ok(RATE_SNOOZE_MS >= 30 * 86_400_000, "not all the time");
  assert.equal(RATE_MAX_ASKS, 2);
  assert.equal(shouldAskRating({ ...engaged, asks: RATE_MAX_ASKS }, now, "/", V), false);
  assert.deepEqual(parseRateState("not json", T0), freshRateState(T0));
  assert.equal(parseRateState(JSON.stringify({ firstSeen: T0, pages: 4, rated: false }), T0 + 5).visits, 1, "an old stored state still reads");
});

test("the prompt is a closable corner card, not a modal, and still posts a rating", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /<RateUsPrompt \/>/);
  const c = read("src/components/RateUsPrompt.tsx");
  assert.doesNotMatch(c, /<Dialog\b/, "never a modal: the page stays usable");
  assert.match(c, /useEscapeLayer\(open, close\)/, "Escape closes it");
  assert.match(c, /aria-label="Close"/);
  assert.match(c, />\s*Not now\s*</);
  assert.match(c, /Don&apos;t ask again/);
  assert.match(c, /armNudge\(/, "waits for a quiet moment");
  assert.match(c, /<RatingReviewForm[\s\S]{0,80}source="rating"/, "the same form as every rating surface");
  const route = read("src/app/api/feedback/route.ts");
  assert.match(route, /"rating", "rating-review"\]\)/, "the API accepts both sources");
  assert.match(route, /!source\.startsWith\("rating"\) && feedbackPremiumActive\(\)/, "a star tap or its review earns no free Premium");
});

test("a tapped star counts even when the form is closed unsent, and never twice", () => {
  const f = read("src/components/RatingReviewForm.tsx");
  assert.match(f, /sendBeacon/, "saved as the form goes away");
  assert.match(f, /message: "", source: cur\.source/, "stars only: a half-typed review is never sent");
  assert.match(f, /reviewOnly && rating \? "rating-review" : source/, "a later review repeats the stars and is left out of the average");
  assert.match(f, /useState\(initialRating > 0 && presetIsTap\)/, "a link-preset rating needs a gesture here first");
  assert.match(f, /"pointerdown", arm/);
  assert.match(read("src/components/FeedbackWidget.tsx"), /presetIsTap/, "the strip's stars are the visitor's tap");
  assert.doesNotMatch(read("src/components/FeedbackForm.tsx"), /presetIsTap/, "the email's ?rating= link is not a tap");
  assert.match(read("src/lib/site-rating.ts"), /NOT: \{ source: "rating-review" \}/);
});

test("the feedback panel has no floating button: it opens from the footer link", () => {
  const w = read("src/components/FeedbackWidget.tsx");
  assert.doesNotMatch(w, /fixed right-4/, "no floating launcher");
  assert.match(w, /FEEDBACK_OPEN_EVENT/);
  assert.match(read("src/components/FeedbackLink.tsx"), /openFeedback\(\)/);
  assert.match(w, /<RatingReviewForm/, "the panel is the shared form");
  assert.match(read("src/app/layout.tsx"), /<RateUsStrip \/>/, "a Rate us row on every page");
  assert.match(read("src/components/RateUsStrip.tsx"), /openFeedback\(n\)/);
});

test("the rating shown is real and only shown once there are enough", () => {
  // 1 since 2026-10-27 (owner: "we've collected enough feedback … show the feedback on the site now").
  assert.equal(MIN_RATINGS_TO_SHOW, 1);
  assert.equal(ratingToShow(4.8, 0), null);
  assert.equal(ratingToShow(null, 500), null);
  assert.deepEqual(ratingToShow(4.66, 120), { average: 4.7, count: 120 });
  assert.equal(ratingLine({ average: 4.7, count: 1234 }), "4.7 rating · 1,234 ratings");
  const landing = read("src/components/premium/ProLanding.tsx");
  assert.match(landing, /<SiteRatingBadge rating=\{rating\}/);
  assert.match(landing, /<div className="pt-12 empty:hidden">\s*<ReviewsSection rating=\{rating\} \/>/, "approved reviews on the Premium page");
  assert.ok(landing.indexOf("<ReviewsSection") < landing.indexOf('id="features"'), "reviews sit under the hero, above the feature panels (owner, 2026-11-03)");
  const home = read("src/app/page.tsx");
  assert.match(home, /<ReviewsSection rating=\{rating\} \/>/, "the homepage shows the reviews too");
  assert.ok(home.indexOf("<ReviewsSection") < home.indexOf("<TodaysTopDeals"), "right under the homepage hero");
  assert.match(home, /showReviews=\{false\}/, "and only once");
  const reviews = read("src/components/ReviewsSection.tsx");
  assert.match(reviews, /if \(reviews\.length < MIN_REVIEWS_TO_DISPLAY\) return null;/, "no reviews, no section");
  assert.doesNotMatch(reviews, /itemprop|itemscope|aggregateRating|application\/ld\+json/i, "plain HTML, never self-serving review markup");
  const badge = read("src/components/SiteRatingBadge.tsx");
  assert.match(badge, /if \(!rating\) return null;/, "no rating line without a rating");
  assert.doesNotMatch(badge, /itemprop|aggregateRating|application\/ld\+json/i, "plain HTML, never review markup");
  assert.match(read("src/components/home/CinematicHero.tsx"), /<SiteRatingBadge rating=\{rating\}/, "the homepage hero shows it too");
  assert.match(read("src/lib/site-rating.ts"), /NOT: \{ source: "rating-review" \}/, "a review's stars are not counted twice");
  const form = read("src/components/RatingReviewForm.tsx");
  assert.match(form, /useState\(true\); \/\/ opt-out/, "a review is shown unless its writer unticks it (owner, 2026-10-27)");
  assert.match(form, /Show my review on RiftCompare/);
  assert.match(form, /consentPublic: showPublicly/);
  assert.doesNotMatch(landing, /\b(100,000|4\.8)\b/, "no borrowed or invented rating");
  assert.doesNotMatch(read("src/app/premium/page.tsx"), /aggregateRating/, "never in JSON-LD");
});

test("the landing reads its prices from the page, in the site's own theme (owner, 2026-11-02)", () => {
  const page = read("src/app/premium/page.tsx");
  assert.match(page, /monthly: tierMonthlyAmount\("premium"\)/);
  assert.match(page, /perMonth: premiumEffectiveMonthly\("premium"\)/);
  const landing = read("src/components/premium/ProLanding.tsx");
  assert.match(landing, /href="#features"[\s\S]{0,200}See all features/);
  assert.match(landing, /id="compare"/, "Free and Premium in one table");
  // No made-up portfolio, no gold gradients, no emoji icons: "too gimmicky".
  assert.doesNotMatch(landing, /\$1,284|bg-gradient|bg-clip-text|#f6dc8f/);
  assert.doesNotMatch(landing, /\p{Extended_Pictographic}/u, "line icons, not emoji");
  const picker = read("src/components/premium/ProPricePicker.tsx");
  assert.match(picker, /role="radiogroup"/);
  assert.match(picker, /\bpro\b\s*\/>/, "the orange primary button");
  assert.match(read("src/components/PremiumCta.tsx"), /const CTA_PRO = "btn-primary /);
});

test("a review card needs a written comment (owner, 2026-11-03)", async () => {
  const { hasComment } = await import("../src/lib/reviews");
  assert.equal(hasComment({ message: "" }), false);
  assert.equal(hasComment({ message: "   \n" }), false);
  assert.equal(hasComment({ message: null }), false);
  assert.equal(hasComment({ message: "Great site" }), true);
  assert.match(read("src/lib/reviews.ts"), /rows\.filter\(hasComment\)/);
});
