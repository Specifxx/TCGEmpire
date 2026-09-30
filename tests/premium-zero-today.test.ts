import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  premiumTrialFee,
  premiumChargedToday,
  trialButtonLabel,
  trialOfferLead,
  trialThenLine,
  trialDisclosure,
  premiumCurrencySymbol,
  PREMIUM_COPY_VERSION,
} from "../src/lib/site";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// The 2026-09-09 Premium framing pass. See DECISIONS.md for the full account:
// the price was held at $14.99 (per the 2026-09-08 3-week-hold decision) and
// "$0 today" was promoted from a buried footnote to the headline number on
// every surface that still led with the recurring price — the signed-out
// corner slide-in, both /premium pricing cards (which also, for the first
// time, treat a signed-out visitor as trial-available), the gated-tool
// button, and the Premium dialog, which had a doubled "$0 today due today"
// bug fixed as part of the same pass. A copy-version tag was added to the
// funnel events so before/after can be split in GA4.
//
// 2026-09-30, the $1 first month (DECISIONS.md, "A $1 first month for both
// tiers"): the trial is PAID, so "what you pay today" is $1, not $0. The file
// keeps its name (other tests and docs point at it) and its INTENT: the number
// shown as due today is the number checkout charges today, always beside the real
// price. premiumZeroAmount()/premiumZeroToday() became premiumTrialFee() /
// premiumChargedToday(), which take the fee (PREMIUM_TRIAL_FEE_CENTS) as an
// argument and say "free" only when it is 0.
// ─────────────────────────────────────────────────────────────────────────────

test("premiumTrialFee() is the bare currency symbol + the fee, matching premiumCurrencySymbol()", () => {
  assert.equal(premiumTrialFee(100), `${premiumCurrencySymbol()}1`);
  assert.equal(premiumTrialFee(150), `${premiumCurrencySymbol()}1.50`);
  // A fee of 0 is a genuinely free trial and is the ONLY way this reads $0.
  assert.equal(premiumTrialFee(0), `${premiumCurrencySymbol()}0`);
  assert.equal(premiumChargedToday(100), `${premiumCurrencySymbol()}1 today`);
});

test("the trial copy helpers say $1 at the default fee and 'free' only when the fee is 0", () => {
  assert.equal(trialOfferLead(30, 100), "First 30 days for $1");
  assert.equal(trialThenLine(30, 100, "$2.99/mo"), "First 30 days for $1, then $2.99/mo");
  assert.equal(trialThenLine(30, 100, "$23.99/yr"), "First 30 days for $1, then $23.99/yr");
  assert.equal(trialButtonLabel(30, 100), "Start 30 days for $1");
  assert.equal(trialOfferLead(30, 0), "First 30 days free");
  assert.equal(trialButtonLabel(30, 0), "Start 30 days free");
  for (const fee of [100, 250]) {
    for (const line of [trialOfferLead(30, fee), trialButtonLabel(30, fee), trialDisclosure(30, fee, "$2.99/mo")]) {
      assert.doesNotMatch(line, /free|\$0/i, `a $${fee / 100} trial must never read as free or $0: ${line}`);
    }
  }
  // The disclosure a card-gated trial owes: card, amount today, when the plan
  // price starts, and how to stop it.
  const d = trialDisclosure(30, 100, "$2.99/mo");
  assert.match(d, /card is required/i);
  assert.match(d, /\$1 today/);
  assert.match(d, /then \$2\.99\/mo from day 30 unless you cancel first/);
  assert.match(d, /email you a day or two before/);
});

test("TrialPriceBlock is presentational only — no hooks, safe to render on the server", () => {
  const src = read("src/components/TrialPriceBlock.tsx");
  assert.ok(!/^"use client";/m.test(src), "must not be a client component — used from the server /premium page");
  assert.ok(!/\buseState\b|\buseEffect\b|\buseMe\b/.test(src), "must not use any hook");
  assert.match(src, /premiumTrialFee\(feeCents\)/, "must render the shared fee helper, from the fee it is given");
  assert.match(src, /PREMIUM_PRICE_AMOUNT/, "must read the real monthly price constant");
  assert.match(src, /PREMIUM_ANNUAL_AMOUNT/, "must read the real annual price constant");
  assert.match(src, /premiumEffectiveMonthly\(\)/, "must read the shared effective-monthly helper");
});

test("PremiumDialog reuses TrialPriceBlock and no longer has the doubled 'today due today' bug", () => {
  const src = read("src/components/PremiumDialog.tsx");
  assert.match(src, /<TrialPriceBlock/, "expected the dialog's trial branch to render the shared block");
  assert.ok(!/ZERO_DUE_TODAY/.test(src), "the old local constant (source of the doubled 'today due today' text) must be gone");
});

test("/premium treats a signed-out, never-trialed visitor as trial-available, and threads it through to the pricing cards", () => {
  // 2026-09-11: the pricing cards stopped leading with a "$0" TrialPriceBlock
  // headline (see PremiumPricingCards.tsx's own header and DECISIONS.md) —
  // trialAvailable itself is unchanged and still has to reach the real
  // component that renders the CTA and its trial disclosure.
  const src = read("src/app/premium/page.tsx");
  assert.match(
    src,
    /const trialAvailable = !already && \(await trialOfferedTo\(user \? dbUser : null\)\);/,
    "trialAvailable must not require a signed-in user, unlike trialEligible",
  );
  assert.match(src, /<PremiumPricingCards/, "expected the pricing cards component");
  assert.match(src, /trialAvailable=\{trialAvailable\}/, "trialAvailable must be threaded down to the pricing cards");

  const cards = read("src/components/PremiumPricingCards.tsx");
  assert.match(cards, /trialAvailable/, "the pricing cards must actually consume trialAvailable, not just accept it");
  assert.match(cards, /<PremiumCta/, "the real checkout button must still be PremiumCta, not a hand-rolled one");
});

test("PremiumCta's signed-out state sells the trial when one is available, honestly", () => {
  const src = read("src/components/PremiumCta.tsx");
  assert.match(src, /Create a free account/, "expected a trial-specific signed-out CTA label");
  assert.match(src, /no card needed/i, "signing up itself must still be free and cardless");
  // The disclosure that a card IS required once the trial itself starts must
  // sit in the same signed-out branch as any trial claim — otherwise "Start 30
  // days for $1" would read as needing nothing at all.
  const signedOutAt = src.indexOf("if (!signedIn)");
  assert.ok(signedOutAt >= 0, "expected the signed-out branch");
  const signedOutBlock = src.slice(signedOutAt, src.indexOf("if (!checkoutLive)"));
  assert.match(signedOutBlock, /trialButtonLabel\(trialDays, trialFeeCents\)/, "the button states the offer: 'Start 30 days for $1'");
  assert.match(signedOutBlock, /trialDisclosure\(trialDays, trialFeeCents, thenPrice\)/, "the trial CTA must disclose the card, the $1 and the plan price that follows");
  assert.match(trialDisclosure(30, 100, "$2.99/month"), /card is required/i);
});

test("PremiumButton is trial-aware but still opens the shared dialog", () => {
  const src = read("src/components/PremiumButton.tsx");
  assert.match(src, /trialButtonLabel\(trialDays, trialFeeCents\)/, "expected a trial-eligible label built from the shared helper and the configured fee");
  assert.match(src, /usePremiumDialog/, "must still open the site-wide dialog — this instruction never touched that");
});

test("the Premium funnel events carry PREMIUM_COPY_VERSION so before/after can be split in GA4", () => {
  for (const file of [
    "src/components/PremiumCta.tsx",
    "src/components/PremiumDialog.tsx",
  ]) {
    const src = read(file);
    assert.match(src, /PREMIUM_COPY_VERSION/, `${file} must tag its funnel event(s) with PREMIUM_COPY_VERSION`);
  }
  // Not pinned to an exact string — it is expected to change (and must, per
  // its own header comment in lib/site.ts) every time the price or framing on
  // these surfaces changes, e.g. the 2026-09-09 rollback to $9.99. What must
  // hold is that it's a real, non-empty tag, not that it's any specific value.
  assert.ok(typeof PREMIUM_COPY_VERSION === "string" && PREMIUM_COPY_VERSION.length > 0, "expected a non-empty copy-version tag");
});

test("none of the touched surfaces grew fake scarcity or a countdown while promoting the price", () => {
  for (const file of [
    "src/components/TrialPriceBlock.tsx",
    "src/components/PremiumDialog.tsx",
    "src/app/premium/page.tsx",
    "src/components/PremiumCta.tsx",
    "src/components/FreeLimitPanel.tsx",
  ]) {
    const src = read(file);
    assert.ok(!/only \d+ (left|spots|seats)/i.test(src), `${file}: no fake scarcity`);
    assert.ok(!/expires? in/i.test(src), `${file}: no countdown pressure`);
  }
});
