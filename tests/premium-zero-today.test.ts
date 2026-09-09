import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { premiumZeroAmount, premiumCurrencySymbol, PREMIUM_COPY_VERSION } from "../src/lib/site";

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
// ─────────────────────────────────────────────────────────────────────────────

test("premiumZeroAmount() is the bare currency symbol + 0, matching premiumCurrencySymbol()", () => {
  assert.equal(premiumZeroAmount(), `${premiumCurrencySymbol()}0`);
});

test("TrialPriceBlock is presentational only — no hooks, safe to render on the server", () => {
  const src = read("src/components/TrialPriceBlock.tsx");
  assert.ok(!/^"use client";/m.test(src), "must not be a client component — used from the server /premium page");
  assert.ok(!/\buseState\b|\buseEffect\b|\buseMe\b/.test(src), "must not use any hook");
  assert.match(src, /premiumZeroAmount\(\)/, "must render the shared bare-$0 helper");
  assert.match(src, /PREMIUM_PRICE_AMOUNT/, "must read the real monthly price constant");
  assert.match(src, /PREMIUM_ANNUAL_AMOUNT/, "must read the real annual price constant");
  assert.match(src, /premiumEffectiveMonthly\(\)/, "must read the shared effective-monthly helper");
});

test("PremiumDialog reuses TrialPriceBlock and no longer has the doubled 'today due today' bug", () => {
  const src = read("src/components/PremiumDialog.tsx");
  assert.match(src, /<TrialPriceBlock/, "expected the dialog's trial branch to render the shared block");
  assert.ok(!/ZERO_DUE_TODAY/.test(src), "the old local constant (source of the doubled 'today due today' text) must be gone");
});

test("/premium treats a signed-out, never-trialed visitor as trial-available, and both cards use TrialPriceBlock", () => {
  const src = read("src/app/premium/page.tsx");
  assert.match(
    src,
    /const trialAvailable = premiumTrialEnabled\(\) && !already && \(!user \|\| !dbUser\?\.trialStartedAt\);/,
    "trialAvailable must not require a signed-in user, unlike trialEligible",
  );
  assert.match(src, /<TrialPriceBlock plan="monthly"/, "the monthly card must render TrialPriceBlock when trial-available");
  assert.match(src, /<TrialPriceBlock plan="annual"/, "the annual card must render TrialPriceBlock when trial-available");
  assert.match(src, /trialAvailable=\{trialAvailable\}/, "trialAvailable must be threaded down to PremiumCta");
});

test("PremiumCta's signed-out state sells the trial when one is available, honestly", () => {
  const src = read("src/components/PremiumCta.tsx");
  assert.match(src, /Create a free account/, "expected a trial-specific signed-out CTA label");
  assert.match(src, /no card needed/i, "signing up itself must still be free and cardless");
  // The disclosure that a card IS required once the trial itself starts must
  // sit in the same signed-out branch as any $0/free-trial claim — otherwise
  // "start a free trial" would read as needing nothing at all.
  const signedOutAt = src.indexOf("if (!signedIn)");
  assert.ok(signedOutAt >= 0, "expected the signed-out branch");
  const signedOutBlock = src.slice(signedOutAt, src.indexOf("if (!checkoutLive)"));
  assert.match(signedOutBlock, /card is required/i, "the trial CTA must disclose that a card is required to actually start it");
});

test("PremiumSlideIn's price now precedes its CTA button, not the other way around", () => {
  const src = read("src/components/PremiumSlideIn.tsx");
  const priceAt = src.indexOf("{PREMIUM_PRICE_AMOUNT ? (");
  const ctaAt = src.indexOf("onClick={accept}");
  assert.ok(priceAt >= 0 && ctaAt >= 0, "expected both the price block and the accept button");
  assert.ok(priceAt < ctaAt, "the price block must render above the CTA row, not below it as a footnote");
});

test("PremiumButton is trial-aware but still opens the shared dialog", () => {
  const src = read("src/components/PremiumButton.tsx");
  assert.match(src, /premiumZeroToday\(\)/, "expected a trial-eligible label using the shared $0-today helper");
  assert.match(src, /usePremiumDialog/, "must still open the site-wide dialog — this instruction never touched that");
});

test("the Premium funnel events carry PREMIUM_COPY_VERSION so before/after can be split in GA4", () => {
  for (const file of [
    "src/components/PremiumSlideIn.tsx",
    "src/components/SignupPromoPopup.tsx",
    "src/components/PremiumCta.tsx",
    "src/components/PremiumDialog.tsx",
  ]) {
    const src = read(file);
    assert.match(src, /PREMIUM_COPY_VERSION/, `${file} must tag its funnel event(s) with PREMIUM_COPY_VERSION`);
  }
  assert.equal(PREMIUM_COPY_VERSION, "zero-today-2026-09-09");
});

test("none of the touched surfaces grew fake scarcity or a countdown while promoting the price", () => {
  for (const file of [
    "src/components/TrialPriceBlock.tsx",
    "src/components/PremiumDialog.tsx",
    "src/app/premium/page.tsx",
    "src/components/PremiumCta.tsx",
    "src/components/PremiumSlideIn.tsx",
  ]) {
    const src = read(file);
    assert.ok(!/only \d+ (left|spots|seats)/i.test(src), `${file}: no fake scarcity`);
    assert.ok(!/expires? in/i.test(src), `${file}: no countdown pressure`);
  }
});
