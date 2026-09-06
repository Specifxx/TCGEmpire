import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PREMIUM_PRICE_AMOUNT,
  PREMIUM_NEXT_PRICE_AMOUNT,
  premiumPriceIncreaseAnnounced,
  premiumLockInLine,
  premiumLockInTail,
} from "../src/lib/site";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// "secure the current price before it increases" — a real, decided Premium
// price change (2026-09), not yet scheduled to an exact date. The honesty rule
// this file exists to pin: /editorial-policy's own line is "nothing here
// describes a process we don't actually run", and that applies to marketing
// copy exactly as much as to an article. Two things make the claim actually
// true rather than just persuasive-sounding:
//   • the "your price never rises while subscribed" guarantee holds REGARDLESS
//     of whether an increase is announced — checkout always creates a new
//     subscription against whatever price is currently configured, and nothing
//     migrates an existing subscription to a different one;
//   • the banner is SELF-RETIRING: the day the real cutover happens and
//     PREMIUM_PRICE_AMOUNT is bumped to match PREMIUM_NEXT_PRICE_AMOUNT, the
//     announcement switches itself off with no second flag to remember — the
//     exact failure mode /vendetta-countdown and /radiance-countdown both died
//     from (see tests/release-calendar.test.ts's own header for that history).
// ─────────────────────────────────────────────────────────────────────────────

test("today's decided price increase is what the site actually announces", () => {
  // Pins the real business decision (current $9.99 → $19.99, no fixed date) so
  // a careless edit changes it loudly rather than silently.
  assert.equal(PREMIUM_PRICE_AMOUNT, "$9.99");
  assert.equal(PREMIUM_NEXT_PRICE_AMOUNT, "$19.99");
  assert.equal(premiumPriceIncreaseAnnounced(), true);
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

test("the full sentence and the compact tail both name the real future price when announced", () => {
  const line = premiumLockInLine();
  assert.ok(line.includes(PREMIUM_PRICE_AMOUNT), "must still state today's price");
  assert.ok(line.includes(PREMIUM_NEXT_PRICE_AMOUNT), "must state the announced future price");

  const tail = premiumLockInTail();
  assert.ok(tail.includes(PREMIUM_NEXT_PRICE_AMOUNT), "the compact caption must also name the future price");
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
  for (const f of ["src/app/premium/page.tsx", "src/components/PremiumDialog.tsx"]) {
    const src = read(f);
    const banner = /Price increasing soon[\s\S]{0,400}/.exec(src);
    if (banner) assert.ok(!datePattern.test(banner[0]), `${f}: the price-increase banner must not hard-code a date`);
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
  // rise too.
  for (const file of ["src/app/premium/page.tsx", "src/components/PremiumDialog.tsx"]) {
    const src = read(file);
    const bannerAt = src.indexOf("Price increasing soon");
    assert.ok(bannerAt >= 0, `${file}: expected the price-increase banner`);
    const before = src.slice(Math.max(0, bannerAt - 400), bannerAt);
    assert.match(before, /!already|!premium/, `${file}: the banner must be gated behind a "not already Premium" check`);
  }
});
