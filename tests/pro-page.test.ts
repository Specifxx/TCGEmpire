import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RATE_AFTER_MS,
  RATE_AFTER_PAGES,
  RATE_MAX_ASKS,
  RATE_SNOOZE_MS,
  RATE_VISIT_GAP_MS,
  countPageView,
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

const V = { pages: 2, otherPromptShown: false };
const engaged = { ...freshRateState(T0), pages: RATE_AFTER_PAGES, visits: 2 };

test("the rate prompt never asks a new visitor: a return visit, a day and several pages first", () => {
  const now = T0 + RATE_AFTER_MS;
  assert.equal(shouldAskRating(engaged, now, "/card/x", V), true);
  assert.equal(shouldAskRating({ ...engaged, pages: RATE_AFTER_PAGES - 1 }, now, "/card/x", V), false, "too few pages");
  assert.equal(shouldAskRating(engaged, now - 1, "/card/x", V), false, "too soon");
  assert.equal(shouldAskRating({ ...engaged, visits: 1, pages: 50 }, now, "/card/x", V), false, "a first visit is never asked, however long");
  assert.equal(shouldAskRating(engaged, now, "/card/x", { pages: 1, otherPromptShown: false }), false, "never on a visit's first page");
  assert.equal(shouldAskRating(engaged, now, "/card/x", { pages: 3, otherPromptShown: true }), false, "one uninvited prompt per visit");
  for (const p of ["/login", "/admin/x", "/premium", "/premium/start", "/embed/card", "/games/x", "/contact"]) assert.equal(shouldAskRating(engaged, now, p, V), false, p);
  assert.ok(RATE_AFTER_PAGES >= 5 && RATE_AFTER_MS >= 86_400_000, "not a quick ask");
});

test("a page view after a long gap is a new visit", () => {
  const a = countPageView(freshRateState(T0), T0);
  const b = countPageView(a, T0 + 60_000);
  assert.equal(b.visits, 1);
  assert.equal(countPageView(b, T0 + 60_000 + RATE_VISIT_GAP_MS).visits, 2);
  assert.equal(b.pages, 2);
});

test("a rating or Don't ask again ends it for good; closing waits; it gives up after two asks", () => {
  const now = T0 + RATE_AFTER_MS;
  assert.equal(shouldAskRating({ ...engaged, rated: true }, now, "/", V), false);
  assert.equal(shouldAskRating({ ...engaged, optedOut: true }, now, "/", V), false);
  assert.equal(shouldAskRating({ ...engaged, snoozedAt: now }, now + RATE_SNOOZE_MS - 1, "/", V), false);
  assert.equal(shouldAskRating({ ...engaged, snoozedAt: now }, now + RATE_SNOOZE_MS, "/", V), true);
  assert.ok(RATE_SNOOZE_MS >= 30 * 86_400_000);
  assert.equal(RATE_MAX_ASKS, 2);
  assert.equal(shouldAskRating({ ...engaged, asks: RATE_MAX_ASKS }, now, "/", V), false);
  assert.deepEqual(parseRateState("not json", T0), freshRateState(T0));
  assert.equal(parseRateState(JSON.stringify({ firstSeen: T0, pages: 4, rated: false }), T0 + 5).visits, 1, "an old stored state still reads");
  assert.equal(ratingFollowUp(3), "fix");
  assert.equal(ratingFollowUp(4), "thanks");
});

test("the prompt is a closable corner card, not a modal, and still posts a rating", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /<RateUsPrompt \/>/);
  const c = read("src/components/RateUsPrompt.tsx");
  assert.doesNotMatch(c, /<Dialog\b/, "no modal: the page stays usable");
  assert.match(c, /useEscapeLayer\(open, close\)/, "Escape closes it");
  assert.match(c, /aria-label="Close"/);
  assert.match(c, />\s*Not now\s*</);
  assert.match(c, /Don&apos;t ask again/);
  assert.match(c, /armNudge\(/, "waits for a quiet moment");
  assert.match(c, /source: "rating"/);
  assert.match(read("src/components/PricingNudge.tsx"), /RATE_SESSION_KEY/, "the Pricing callout yields to it");
  const route = read("src/app/api/feedback/route.ts");
  assert.match(route, /"rating", "rating-review"\]\)/, "the API accepts both sources");
  assert.match(route, /!source\.startsWith\("rating"\) && feedbackPremiumActive\(\)/, "a star tap or its review earns no free Pro");
});

test("the feedback panel has no floating button: it opens from the footer link", () => {
  const w = read("src/components/FeedbackWidget.tsx");
  assert.doesNotMatch(w, /fixed right-4/, "no floating launcher");
  assert.match(w, /FEEDBACK_OPEN_EVENT/);
  assert.match(read("src/components/FeedbackLink.tsx"), /FEEDBACK_OPEN_EVENT/);
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
