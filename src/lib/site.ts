// Site-wide constants.

// Public contact address — shown on the site and used to forward feedback emails.
export const CONTACT_EMAIL = "riftcompare@gmail.com";

// Where marketplace support tickets are emailed (see lib/support-email.ts).
// Same inbox as CONTACT_EMAIL by default; override independently if that changes.
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? CONTACT_EMAIL;

export const SITE_NAME = "RiftCompare";

// Community Discord invite (permanent; opens in a new tab from the navbar icon).
export const DISCORD_URL = "https://discord.gg/NypdmfAMTa";

// Official social profiles — shown in the footer and listed in the Organization
// JSON-LD's sameAs (see app/layout.tsx) for entity-disambiguation SEO.
export const INSTAGRAM_URL = "https://www.instagram.com/riftcompare/";
export const X_URL = "https://x.com/RiftCompareTCG";
export const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61591482521945";

// Canonical origin (no trailing slash). Used for metadata, sitemap and robots.
export const SITE_URL = "https://riftcompare.com";

// Display price for RiftCompare Premium. Amount + period render the big price on the
// /premium pricing card; PREMIUM_PRICE_LABEL is the compact "$4.99/mo" used in CTAs.
// These are DISPLAY ONLY — set them to match the recurring price you created in
// Stripe (override any of them via the NEXT_PUBLIC_* env vars). Changing this
// constant alone does NOT change what Stripe actually charges: the real amount is
// whatever Price object STRIPE_PREMIUM_PRICE_ID / STRIPE_PREMIUM_ANNUAL_PRICE_ID
// (Vercel-only secrets, not in this repo) point to. Repoint those to match before
// or immediately after changing this, or the displayed price and the checkout
// price will disagree.
//
// Raised from $9.99/$79.99 to $14.99/$119.99 (2026-09-06), rolled back to
// $9.99/$79.99 (2026-09-09), then CUT to $4.99/$39.99 (2026-09-26, owner: "the
// price is not working") — see DECISIONS.md for all three. Stripe Prices are
// immutable, so every change here repoints STRIPE_PREMIUM_PRICE_ID /
// STRIPE_PREMIUM_ANNUAL_PRICE_ID at a different Price object. The 2026-09-26 cut
// is the first change that ALSO moves existing subscribers: the owner moves
// them DOWN onto the new Prices from their next renewal, in the Stripe
// dashboard. Nothing in this codebase re-prices a subscription by itself.
export const PREMIUM_PRICE_AMOUNT = process.env.NEXT_PUBLIC_PREMIUM_PRICE_AMOUNT || "$4.99";
export const PREMIUM_PRICE_PERIOD = process.env.NEXT_PUBLIC_PREMIUM_PRICE_PERIOD || "month";
export const PREMIUM_PRICE_LABEL = process.env.NEXT_PUBLIC_PREMIUM_PRICE || `${PREMIUM_PRICE_AMOUNT}/mo`;

// Annual plan (display only; the actual charge comes from the Stripe annual price,
// enabled via STRIPE_PREMIUM_ANNUAL_PRICE_ID — see lib/premium.ts).
export const PREMIUM_ANNUAL_AMOUNT = process.env.NEXT_PUBLIC_PREMIUM_ANNUAL_AMOUNT || "$39.99";
export const PREMIUM_ANNUAL_PERIOD = process.env.NEXT_PUBLIC_PREMIUM_ANNUAL_PERIOD || "year";

// ── Plus: the second, cheaper paid tier (2026-09-11) ────────────────────────
// Display only, same rule as the Premium constants above — the real charge
// comes from STRIPE_PLUS_PRICE_ID / STRIPE_PLUS_ANNUAL_PRICE_ID (Vercel-only
// secrets). Every existing flat PREMIUM_* export above is kept byte-for-byte
// (dozens of consumers and several tests read them directly) and doubles as
// the "premium" tier's amount for the helpers below — PLUS_* is additive.
// $4.99/$39.99 until 2026-09-26, then $2.99/$23.99 (same cut as Premium's).
// Subscribers still on the OLD Plus Prices resolve to Plus through
// STRIPE_PLUS_LEGACY_PRICE_IDS (lib/premium.ts tierFromPriceId).
export const PLUS_PRICE_AMOUNT = process.env.NEXT_PUBLIC_PLUS_PRICE_AMOUNT || "$2.99";
export const PLUS_ANNUAL_AMOUNT = process.env.NEXT_PUBLIC_PLUS_ANNUAL_AMOUNT || "$23.99";

// ── The founding-rate message: RETIRED 2026-09-26 ───────────────────────────
// FOUNDING_RATE_BADGE / _HEADLINE / _LINE / _SHORT ("Prices rise as coverage
// grows — your rate never does") lived here from 2026-09-22. They were never
// rendered anywhere, and on 2026-09-26 the owner CUT both tiers' prices and
// moved existing subscribers down onto the new ones, so "prices rise as the
// site grows" is contradicted by the site's own latest move. Deleted rather
// than left for someone to wire up. See premiumLockInLine() below for what the
// price banner says instead.

export type PremiumTierKey = "plus" | "premium";
export const TIER_NAMES: Record<PremiumTierKey, string> = { plus: "Plus", premium: "Premium" };

function monthlyAmountFor(tier: PremiumTierKey): string {
  return tier === "plus" ? PLUS_PRICE_AMOUNT : PREMIUM_PRICE_AMOUNT;
}
function annualAmountFor(tier: PremiumTierKey): string {
  return tier === "plus" ? PLUS_ANNUAL_AMOUNT : PREMIUM_ANNUAL_AMOUNT;
}
// The monthly/annual display amount for a given tier — "premium" (the
// default) returns exactly PREMIUM_PRICE_AMOUNT/PREMIUM_ANNUAL_AMOUNT, so
// every existing call site that never mentions a tier keeps reading the same
// number it always has.
export function tierMonthlyAmount(tier: PremiumTierKey = "premium"): string {
  return monthlyAmountFor(tier);
}
export function tierAnnualAmount(tier: PremiumTierKey = "premium"): string {
  return annualAmountFor(tier);
}

// Shared numeric parse for a display price string ("$9.99" -> 9.99). Lifted
// out of annualSavingPct/AnnualPriceBlock's own local copies so every "do the
// math on the display price" call site (this file, AnnualPriceBlock,
// PremiumDialog's $0-due-today derivation) reads the same parsing rule instead
// of three near-identical regexes drifting independently.
export function premiumMoneyNum(s: string): number {
  return Number(s.replace(/[^0-9.]/g, "")) || 0;
}

// The bare currency symbol/prefix off PREMIUM_PRICE_AMOUNT ("$9.99" -> "$"),
// for building a "$0 due today" string that carries whatever symbol the real
// price uses (a re-denominated £/€ amount) rather than assuming dollars.
// Falls back to "$" if the amount is bare digits.
export function premiumCurrencySymbol(): string {
  return PREMIUM_PRICE_AMOUNT.replace(/[\d.,]+.*$/, "") || "$";
}

// Percent saved on annual vs paying monthly for a year (rounded). Parses the numeric
// part of each amount; falls back to 0 if either can't be read. `tier` defaults to
// "premium" so a zero-arg call reads exactly PREMIUM_PRICE_AMOUNT/PREMIUM_ANNUAL_AMOUNT,
// same as before Plus existed.
export function annualSavingPct(tier: PremiumTierKey = "premium"): number {
  const monthly = premiumMoneyNum(monthlyAmountFor(tier));
  const annual = premiumMoneyNum(annualAmountFor(tier));
  if (!monthly || !annual) return 0;
  return Math.max(0, Math.round((1 - annual / (monthly * 12)) * 100));
}

// The annual price's per-month equivalent ("$39.99" -> "$3.33"), for the
// "from $3.33/mo billed yearly" framing used across the slide-in, dialog and
// /premium page. "" when there's no annual price configured, so callers can
// cleanly fall back to the monthly-only framing.
export function premiumEffectiveMonthly(tier: PremiumTierKey = "premium"): string {
  const annual = premiumMoneyNum(annualAmountFor(tier));
  if (!annual) return "";
  return `${premiumCurrencySymbol()}${(annual / 12).toFixed(2)}`;
}

// The lead price framing used across the slide-in, dialog and /premium page —
// "from $3.33/mo billed yearly, or $4.99 month-to-month" when an annual plan
// exists, otherwise just the monthly price. Centralised so the effective-annual
// number can't drift between surfaces the way the tool list once did (see
// PITCH_TOOLS's own header comment for that history repeating itself).
export function premiumFromLine(tier: PremiumTierKey = "premium"): string {
  const effective = premiumEffectiveMonthly(tier);
  const monthly = monthlyAmountFor(tier);
  if (!effective) return `${monthly}/${PREMIUM_PRICE_PERIOD}`;
  return `from ${effective}/mo billed yearly, or ${monthly}/${PREMIUM_PRICE_PERIOD} month-to-month`;
}

// "$0 today" — the trial-eligible lead-in, symbol derived from the real price
// rather than hardcoded so a re-denominated PREMIUM_PRICE_AMOUNT carries its
// own currency through.
export function premiumZeroToday(): string {
  return `${premiumCurrencySymbol()}0 today`;
}

// Bare "$0" (no "today" suffix) for a HEADLINE number — e.g. TrialPriceBlock's
// big price figure, styled the same way PREMIUM_PRICE_AMOUNT itself is
// rendered elsewhere ("due today" sits next to it as its own smaller label).
// premiumZeroToday() stays the inline-caption form ("$0 today, then …").
export function premiumZeroAmount(): string {
  return `${premiumCurrencySymbol()}0`;
}

// ── Intro offer: first 3 months half price (monthly plans) ─────────────────
// Owner's call, 2026-09-24, after the trial-cancel report showed 5 of the 6
// trials started since 11 Sept cancelled — half of them within the first hour,
// "too expensive" the top Stripe reason. DECISIONS.md, "Trial model: 3-day
// trial, then the first 3 months half price", 2026-09-24.
//
// ONE rule for "half": the discount is the price's cents halved and ROUNDED
// UP, so the charged amount rounds DOWN — $9.99 → $4.99, $4.99 → $2.49 (and,
// at the 2026-09-26 prices, $4.99 → $2.49 for Premium, $2.99 → $1.49 for Plus).
// lib/premium.ts builds the Stripe coupon from the same function applied to
// the Stripe Price's own unit_amount, so what these helpers print is, to the
// cent, what Stripe charges (the display amounts already mirror the Price
// objects — see the header of this block's price constants).
//
// Monthly only: annual stays the cheapest way to pay for a year even with the
// intro, so it needs no second discount. NEXT_PUBLIC_ so the checkout route and
// every client surface read one switch.
//
// OFF BY DEFAULT since 2026-09-26 (owner: "the price is not working" — both
// tiers' prices cut, and the intro and the free trial dropped with them;
// DECISIONS.md, 2026-09-26). The machinery stays, so NEXT_PUBLIC_PREMIUM_INTRO_OFFER=1
// turns the whole offer back on everywhere at once; unset, or anything else,
// is off. Existing rc-intro-* coupons on live subscriptions keep running out on
// their own schedule — the reminder, the /premium card and the plan-switch
// routes read the coupon ON the subscription, never this switch.
export const INTRO_MONTHS = 3;
export function introOfferEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PREMIUM_INTRO_OFFER === "1";
}
/** Cents taken off each of the first INTRO_MONTHS monthly invoices. */
export function introAmountOffCents(priceCents: number): number {
  return Math.ceil(priceCents / 2);
}
/** "$2.49" for Premium, "$1.49" for Plus at the 2026-09-26 prices — the monthly price during the intro months. */
export function tierIntroMonthlyAmount(tier: PremiumTierKey = "premium"): string {
  const cents = Math.round(premiumMoneyNum(monthlyAmountFor(tier)) * 100);
  return `${premiumCurrencySymbol()}${((cents - introAmountOffCents(cents)) / 100).toFixed(2)}`;
}
/** "$2.49/mo for your first 3 months, then $4.99/mo" */
export function introPriceLine(tier: PremiumTierKey = "premium"): string {
  return `${tierIntroMonthlyAmount(tier)}/mo for your first ${INTRO_MONTHS} months, then ${monthlyAmountFor(tier)}/mo`;
}

/**
 * premiumFromLine() for someone checkout will give the intro to: "from $6.67/mo
 * billed yearly, or $4.99/mo for your first 3 months, then $9.99/mo
 * month-to-month". Callers decide eligibility (lib/premium.ts introEligibleFor);
 * the kill switch is honoured here too.
 */
export function introFromLine(tier: PremiumTierKey = "premium", eligible = true): string {
  if (!eligible || !introOfferEnabled()) return premiumFromLine(tier);
  const effective = premiumEffectiveMonthly(tier);
  return effective ? `from ${effective}/mo billed yearly, or ${introPriceLine(tier)} month-to-month` : introPriceLine(tier);
}

// ── Announced price increase ────────────────────────────────────────────────
// History: $9.99/mo → $14.99/mo (2026-09-06) → back to $9.99/mo (2026-09-09) →
// CUT to $4.99/mo (2026-09-26, owner: "the price is not working"; existing
// subscribers moved DOWN onto the new Prices at their next renewal). There is
// no announced future increase, so PREMIUM_NEXT_PRICE_AMOUNT defaults to
// PREMIUM_PRICE_AMOUNT ITSELF rather than to a hand-typed copy of it: the day
// the price was cut, a copy left at "$9.99" would have made every surface below
// claim "we're raising Premium's price soon, to $9.99" — a fake increase, the
// exact thing /editorial-policy's "nothing here describes a process we don't
// actually run" rule exists to block. Defaulting to the live amount means a
// price change (in code OR via NEXT_PUBLIC_PREMIUM_PRICE_AMOUNT) can never
// announce an increase by itself; only setting NEXT_PUBLIC_PREMIUM_NEXT_PRICE_AMOUNT
// to a real, decided, HIGHER figure does. premiumPriceIncreaseAnnounced() also
// requires the next amount to be numerically higher, so a stale value left in
// the Vercel dashboard from the $9.99 era can't dress a price CUT up as a
// "rise". Same self-retiring shape as release-calendar.ts's countdown: the
// moment the two amounts match, every surface below retires itself.
export const PREMIUM_NEXT_PRICE_AMOUNT = process.env.NEXT_PUBLIC_PREMIUM_NEXT_PRICE_AMOUNT || PREMIUM_PRICE_AMOUNT;
export function premiumPriceIncreaseAnnounced(): boolean {
  return PREMIUM_NEXT_PRICE_AMOUNT !== PREMIUM_PRICE_AMOUNT && premiumMoneyNum(PREMIUM_NEXT_PRICE_AMOUNT) > premiumMoneyNum(PREMIUM_PRICE_AMOUNT);
}

// ── The price banner's copy, in both states ─────────────────────────────────
// One function per wording so an announced increase updates every surface at
// once (the /premium page, the Premium dialog, the corner slide-in) instead of
// hand-typed copies drifting independently.
//
// THE STEADY STATE WAS REWRITTEN 2026-09-26. From 2026-09-22 it said
// "Premium's price goes up as the site grows … Your rate doesn't: subscribe
// at $X and keep it for as long as you stay subscribed", and the headline
// "Lock in $X before the price goes up". Two things made that untrue on
// 2026-09-26: the owner CUT both tiers' prices (so "the price goes up as the
// site grows" is contradicted by the site's own latest move), and existing
// subscribers were moved onto the new Prices (down, but moved — so the
// "your rate is fixed to the Price you joined on" mechanism the promise
// rested on is no longer what happens). With no increase decided, "lock in"
// protects nobody from anything. The steady state now states the price and
// the one thing that is unconditionally true: no contract, cancel anytime
// from the account page (Stripe's portal, api/premium/portal).
//
// The ANNOUNCED branch is kept for the day a real, higher price is decided.
// Before anyone sets NEXT_PUBLIC_PREMIUM_NEXT_PRICE_AMOUNT, decide whether
// existing subscribers really will keep their rate — its "keep $X for as long
// as you stay subscribed" is a promise, and 2026-09-26 showed subscriptions
// CAN be moved in the Stripe dashboard. Neither branch names a date or an
// invented future figure (tests/premium-price-increase.test.ts).
export function premiumLockInLine(): string {
  return premiumPriceIncreaseAnnounced()
    ? `We're raising Premium's price soon, to ${PREMIUM_NEXT_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD}. Subscribe now and keep ${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD} for as long as you stay subscribed — no action needed when the price changes.`
    : `No contract: cancel anytime from your account page, in a couple of clicks.`;
}

export function premiumLockInHeadline(): string {
  return premiumPriceIncreaseAnnounced()
    ? `Price increasing soon — lock in ${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD} now`
    : `Premium is ${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD} — cancel anytime`;
}

// The compact tail for a small inline caption ("$4.99/month · …"), used by the
// low-intrusion corner slide-in, whose design intent is to stay out of the way
// rather than carry a full banner.
export function premiumLockInTail(): string {
  return premiumPriceIncreaseAnnounced()
    ? `locked in before it rises to ${PREMIUM_NEXT_PRICE_AMOUNT} — cancel anytime`
    : `cancel anytime`;
}

// Tags the Premium funnel events (slide-in/popup shown, checkout started) with
// which price/framing pass they were rendered under, so GA4 can split
// before/after instead of averaging different pitches (or different price
// levels) into one number. Bump this string — no other code changes required
// — whenever the wording OR the underlying price on any of these surfaces
// changes again, including a price-only change like this one: without a bump,
// events from the $14.99 era and the reverted $9.99 era would share one tag
// and the before/after comparison this constant exists for would be lost.
// lineup-2026-09-25: the new Plus/Premium lineup (Plus = no ads, every deal,
// target alerts; Premium = Best Basket's plan + Buy this list) and the four
// retired tools gone from every pitch. Prices, trial and intro unchanged.
// lineup-2026-09-25b: the same day, Demand Finder back as a Premium tool on
// every tier surface (table row, pricing cards, /premium, dialog, emails), to
// widen the Plus→Premium gap. Prices, trial and intro unchanged.
// price-2026-09-26: Premium $4.99/$39.99, Plus $2.99/$23.99 (were $9.99/$79.99
// and $4.99/$39.99); no free trial and no half-price intro by default; the
// "lock in before the price goes up" copy retired to "cancel anytime".
export const PREMIUM_COPY_VERSION = "price-2026-09-26";
