import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RATE_AFTER_MS,
  RATE_AFTER_PAGES,
  RATE_INTENT_PAGES,
  RATING_DRIVE_LANDING_MS,
  RATING_DRIVE_TARGET,
  ratingDriveActive,
  shouldAskRatingDrive,
  RATE_MAX_ASKS,
  RATE_SNOOZE_MS,
  RATE_VISIT_GAP_MS,
  countPageView,
  freshRateState,
  parseRateState,
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
  const I = { pages: 1, otherPromptShown: false, intent: true };
  assert.equal(shouldAskRating(s, T0 + 10_000, "/card/x", I), true);
  assert.equal(shouldAskRating({ ...s, pages: 1 }, T0 + 10_000, "/card/x", I), false, "one page is arrival");
  assert.equal(shouldAskRating(s, T0 + 10_000, "/card/x", { ...I, otherPromptShown: true }), false);
  assert.equal(shouldAskRating({ ...s, rated: true }, T0 + 10_000, "/card/x", I), false);
  const c = read("src/components/RateUsPrompt.tsx");
  assert.match(c, /BUY_CLICK_EVENT/);
  assert.match(c, /visibilitychange/);
});

test("the rating drive: a pop-up for every visitor until 100 ratings, then off by itself (owner, 2026-10-28)", () => {
  assert.equal(RATING_DRIVE_TARGET, 100);
  assert.equal(ratingDriveActive(9), true);
  assert.equal(ratingDriveActive(99), true);
  assert.equal(ratingDriveActive(100), false, "switches itself off at the target");
  assert.equal(ratingDriveActive(null), true, "unknown stays on (owner, 2026-10-29): only a real 100 ends it");
  const fresh = freshRateState(T0);
  const first = { shown: 0, pagesSince: 0 };
  assert.equal(shouldAskRatingDrive(fresh, "/card/x", first), true, "a new visitor is asked too");
  assert.equal(shouldAskRatingDrive({ ...fresh, rated: true }, "/card/x", first), false, "never someone who rated");
  assert.equal(shouldAskRatingDrive(fresh, "/card/x", { shown: 1, pagesSince: 2 }), false, "not straight back after Maybe later");
  assert.equal(shouldAskRatingDrive(fresh, "/card/x", { shown: 1, pagesSince: 3 }), true, "back three pages later");
  assert.equal(shouldAskRatingDrive(fresh, "/card/x", { shown: 2, pagesSince: 9 }), false, "at most twice a visit");
  for (const p of ["/login", "/premium", "/checkout", "/feedback"]) assert.equal(shouldAskRatingDrive(fresh, p, first), false, p);
  assert.ok(RATING_DRIVE_LANDING_MS >= 15_000, "never in a visitor's first seconds (Google's intrusive-interstitial rule)");
  const c = read("src/components/RateUsPrompt.tsx");
  assert.match(c, /dismissOnBackdrop=\{false\}/, "a click on the page behind does not close it");
  // 2026-10-29: the pop-up shipped wearing data-rate-prompt, which globals.css
  // hides whenever a Dialog is open, so it hid ITSELF: a dimmed page and no box.
  assert.match(c, /<div data-rating-drive>/);
  assert.doesNotMatch(c.slice(c.indexOf("if (popup) {"), c.indexOf("</Dialog>")), /data-rate-prompt/, "the pop-up must not carry the corner card's hide-under-a-dialog hook");
  assert.match(c, /aria-label="Close"/);
  assert.match(c, /Maybe later/, "always a visible way out");
  assert.match(c, /fetch\("\/api\/rating-drive"\)/);
  const route = read("src/app/api/rating-drive/route.ts");
  assert.match(route, /s-maxage=21600/);
  assert.match(route, /getSiteRating/);
});

test("a page view after a long gap is a new visit", () => {
  const a = countPageView(freshRateState(T0), T0);
  const b = countPageView(a, T0 + 60_000);
  assert.equal(b.visits, 1);
  assert.equal(countPageView(b, T0 + 60_000 + RATE_VISIT_GAP_MS).visits, 2);
  assert.equal(b.pages, 2);
});

test("a rating or Don't ask again ends it for good; closing waits; it gives up after three asks", () => {
  const now = T0 + RATE_AFTER_MS;
  assert.equal(shouldAskRating({ ...engaged, rated: true }, now, "/", V), false);
  assert.equal(shouldAskRating({ ...engaged, optedOut: true }, now, "/", V), false);
  assert.equal(shouldAskRating({ ...engaged, snoozedAt: now }, now + RATE_SNOOZE_MS - 1, "/", V), false);
  assert.equal(shouldAskRating({ ...engaged, snoozedAt: now }, now + RATE_SNOOZE_MS, "/", V), true);
  assert.ok(RATE_SNOOZE_MS >= 14 * 86_400_000, "not all the time");
  assert.equal(RATE_MAX_ASKS, 3);
  assert.equal(shouldAskRating({ ...engaged, asks: RATE_MAX_ASKS }, now, "/", V), false);
  assert.deepEqual(parseRateState("not json", T0), freshRateState(T0));
  assert.equal(parseRateState(JSON.stringify({ firstSeen: T0, pages: 4, rated: false }), T0 + 5).visits, 1, "an old stored state still reads");
});

test("the prompt is a closable corner card, not a modal, and still posts a rating", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /<RateUsPrompt \/>/);
  const c = read("src/components/RateUsPrompt.tsx");
  assert.equal(c.match(/<Dialog\b/g)?.length, 1, "a modal only during the rating drive");
  assert.match(c, /if \(popup\) \{[\s\S]{0,120}<Dialog\b/, "outside the drive the page stays usable");
  assert.match(c, /useEscapeLayer\(open && !popup, close\)/, "Escape closes it");
  assert.match(c, /aria-label="Close"/);
  assert.match(c, />\s*Not now\s*</);
  assert.match(c, /Don&apos;t ask again/);
  assert.match(c, /armNudge\(/, "waits for a quiet moment");
  assert.match(c, /<RatingReviewForm[\s\S]{0,80}source="rating"/, "the same form as every rating surface");
  assert.match(read("src/components/PricingNudge.tsx"), /RATE_SESSION_KEY/, "the Pricing callout yields to it");
  const route = read("src/app/api/feedback/route.ts");
  assert.match(route, /"rating", "rating-review"\]\)/, "the API accepts both sources");
  assert.match(route, /!source\.startsWith\("rating"\) && feedbackPremiumActive\(\)/, "a star tap or its review earns no free Pro");
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
  assert.match(landing, /<div className="pt-16 empty:hidden">\s*<ReviewsSection \/>/, "approved reviews on the Pro page");
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

test("the landing reads its prices from the page and labels its example", () => {
  const page = read("src/app/premium/page.tsx");
  assert.match(page, /monthly: tierMonthlyAmount\("premium"\)/);
  assert.match(page, /perMonth: premiumEffectiveMonthly\("premium"\)/);
  const landing = read("src/components/premium/ProLanding.tsx");
  assert.match(landing, />Example</);
  assert.match(landing, /href="#features"[\s\S]{0,200}See all features/);
  assert.match(read("src/components/premium/ProPricePicker.tsx"), /role="switch"/);
});
