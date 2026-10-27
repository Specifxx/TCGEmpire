import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RATE_AFTER_MS,
  RATE_AFTER_PAGES,
  RATE_MAX_ASKS,
  RATE_SNOOZE_MS,
  freshRateState,
  parseRateState,
  ratingFollowUp,
  shouldAskRating,
} from "../src/lib/rate-prompt";
import { MIN_RATINGS_TO_SHOW, ratingLine, ratingToShow } from "../src/lib/site-rating";
import { PREMIUM_ANNUAL_AMOUNT, PREMIUM_PRICE_AMOUNT, annualSavingPct, premiumEffectiveMonthly } from "../src/lib/site";

// The Collectr-style Pro page and the "Rate RiftCompare" prompt (owner,
// 2026-10-26). DECISIONS.md, "Pro: Collectr's model, $6.99 or $3.99/mo yearly".
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const T0 = 1_800_000_000_000;

test("Pro is $6.99 a month or $47.88 a year, which is exactly $3.99 a month", () => {
  assert.equal(PREMIUM_PRICE_AMOUNT, "$6.99");
  assert.equal(PREMIUM_ANNUAL_AMOUNT, "$47.88");
  assert.equal(premiumEffectiveMonthly("premium"), "$3.99");
  assert.equal(annualSavingPct("premium"), 43);
});

test("the rate prompt never asks on the landing page, and asks after a few pages and some time", () => {
  const s = { ...freshRateState(T0), pages: 1 };
  assert.equal(shouldAskRating(s, T0 + RATE_AFTER_MS, "/card/x"), false, "first page: never");
  const later = { ...s, pages: RATE_AFTER_PAGES };
  assert.equal(shouldAskRating(later, T0 + RATE_AFTER_MS - 1, "/card/x"), false, "too soon");
  assert.equal(shouldAskRating(later, T0 + RATE_AFTER_MS, "/card/x"), true);
  for (const p of ["/login", "/admin/x", "/premium/start", "/embed/card", "/games/x"]) assert.equal(shouldAskRating(later, T0 + RATE_AFTER_MS, p), false, p);
});

test("a rating ends it for good; Not now waits, and it gives up after a few asks", () => {
  const ready = { ...freshRateState(T0), pages: 9 };
  const now = T0 + RATE_AFTER_MS;
  assert.equal(shouldAskRating({ ...ready, rated: true }, now, "/"), false);
  assert.equal(shouldAskRating({ ...ready, snoozedAt: now }, now + RATE_SNOOZE_MS - 1, "/"), false);
  assert.equal(shouldAskRating({ ...ready, snoozedAt: now }, now + RATE_SNOOZE_MS, "/"), true);
  assert.equal(shouldAskRating({ ...ready, asks: RATE_MAX_ASKS }, now, "/"), false);
  assert.deepEqual(parseRateState("not json", T0), freshRateState(T0));
  assert.equal(ratingFollowUp(3), "fix");
  assert.equal(ratingFollowUp(4), "thanks");
});

test("the prompt is mounted site-wide, closes only through its own buttons, and posts a rating", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /<RateUsPrompt \/>/);
  const c = read("src/components/RateUsPrompt.tsx");
  assert.match(c, /onClose=\{\(\) => \{\}\}/, "backdrop and Escape do not close it");
  assert.match(c, />\s*Not now\s*</, "but Not now is always there");
  assert.match(c, /source: "rating"/);
  const route = read("src/app/api/feedback/route.ts");
  assert.match(route, /"rating", "rating-review"\]\)/, "the API accepts both sources");
  assert.match(route, /!source\.startsWith\("rating"\) && feedbackPremiumActive\(\)/, "a star tap or its review earns no free Pro");
});

test("the rating shown is real and only shown once there are enough", () => {
  // 100 since 2026-10-27 (owner: "once we have like 100 people provide us feedback").
  assert.equal(MIN_RATINGS_TO_SHOW, 100);
  assert.equal(ratingToShow(4.8, 99), null);
  assert.equal(ratingToShow(null, 500), null);
  assert.deepEqual(ratingToShow(4.66, 120), { average: 4.7, count: 120 });
  assert.equal(ratingLine({ average: 4.7, count: 1234 }), "4.7 rating · 1,234 ratings");
  const landing = read("src/components/premium/ProLanding.tsx");
  assert.match(landing, /<SiteRatingBadge rating=\{rating\}/);
  assert.match(landing, /\{rating && \(\s*<div className="pt-16">\s*<ReviewsSection \/>/, "reviews only once the rating is shown");
  const badge = read("src/components/SiteRatingBadge.tsx");
  assert.match(badge, /if \(!rating\) return null;/, "no rating line without a rating");
  assert.doesNotMatch(badge, /itemprop|aggregateRating|application\/ld\+json/i, "plain HTML, never review markup");
  assert.match(read("src/components/home/CinematicHero.tsx"), /<SiteRatingBadge rating=\{rating\}/, "the homepage hero shows it too");
  assert.match(read("src/lib/site-rating.ts"), /NOT: \{ source: "rating-review" \}/, "a review's stars are not counted twice");
  const prompt = read("src/components/RateUsPrompt.tsx");
  assert.match(prompt, /useState\(false\); \/\/ never pre-ticked/, "consent to show a review is opt-in");
  assert.doesNotMatch(landing, /\b(100,000|4\.8)\b/, "no borrowed or invented rating");
  assert.doesNotMatch(read("src/app/premium/page.tsx"), /aggregateRating/, "never in JSON-LD");
});

test("the landing reads its prices from the page and labels its example", () => {
  const page = read("src/app/premium/page.tsx");
  assert.match(page, /monthly: tierMonthlyAmount\("premium"\)/);
  assert.match(page, /perMonth: premiumEffectiveMonthly\("premium"\)/);
  const landing = read("src/components/premium/ProLanding.tsx");
  assert.match(landing, />Example</);
  assert.match(landing, /href="#features"[\s\S]{0,200}See all features/);
  assert.match(read("src/components/premium/ProPricePicker.tsx"), /role="switch"/);
});
