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
// /premium pricing card; PREMIUM_PRICE_LABEL is the compact "$9.99/mo" used in CTAs.
// These are DISPLAY ONLY — set them to match the recurring price you created in
// Stripe (override any of them via the NEXT_PUBLIC_* env vars). Changing this
// constant alone does NOT change what Stripe actually charges: the real amount is
// whatever Price object STRIPE_PREMIUM_PRICE_ID / STRIPE_PREMIUM_ANNUAL_PRICE_ID
// (Vercel-only secrets, not in this repo) point to. Repoint those to match before
// or immediately after changing this, or the displayed price and the checkout
// price will disagree.
//
// Raised from $9.99/$79.99 to $14.99/$119.99 (2026-09-06), then rolled back to
// $9.99/$79.99 (2026-09-09) — see DECISIONS.md for both. Existing subscribers from
// EITHER era are grandfathered: their Stripe subscription keeps referencing
// whichever Price object they originally subscribed against, since Prices are
// immutable and every price change here repoints STRIPE_PREMIUM_PRICE_ID /
// STRIPE_PREMIUM_ANNUAL_PRICE_ID at a (possibly pre-existing) Price object rather
// than editing one in place. Only new checkouts see this number.
export const PREMIUM_PRICE_AMOUNT = process.env.NEXT_PUBLIC_PREMIUM_PRICE_AMOUNT || "$9.99";
export const PREMIUM_PRICE_PERIOD = process.env.NEXT_PUBLIC_PREMIUM_PRICE_PERIOD || "month";
export const PREMIUM_PRICE_LABEL = process.env.NEXT_PUBLIC_PREMIUM_PRICE || `${PREMIUM_PRICE_AMOUNT}/mo`;

// Annual plan (display only; the actual charge comes from the Stripe annual price,
// enabled via STRIPE_PREMIUM_ANNUAL_PRICE_ID — see lib/premium.ts).
export const PREMIUM_ANNUAL_AMOUNT = process.env.NEXT_PUBLIC_PREMIUM_ANNUAL_AMOUNT || "$79.99";
export const PREMIUM_ANNUAL_PERIOD = process.env.NEXT_PUBLIC_PREMIUM_ANNUAL_PERIOD || "year";

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
// part of each amount; falls back to 0 if either can't be read.
export function annualSavingPct(): number {
  const monthly = premiumMoneyNum(PREMIUM_PRICE_AMOUNT);
  const annual = premiumMoneyNum(PREMIUM_ANNUAL_AMOUNT);
  if (!monthly || !annual) return 0;
  return Math.max(0, Math.round((1 - annual / (monthly * 12)) * 100));
}

// The annual price's per-month equivalent ("$79.99" -> "$6.67"), for the
// "from $6.67/mo billed yearly" framing used across the slide-in, dialog and
// /premium page. "" when there's no annual price configured, so callers can
// cleanly fall back to the monthly-only framing.
export function premiumEffectiveMonthly(): string {
  const annual = premiumMoneyNum(PREMIUM_ANNUAL_AMOUNT);
  if (!annual) return "";
  return `${premiumCurrencySymbol()}${(annual / 12).toFixed(2)}`;
}

// The lead price framing used across the slide-in, dialog and /premium page —
// "from $6.67/mo billed yearly, or $9.99 month-to-month" when an annual plan
// exists, otherwise just the monthly price. Centralised so the effective-annual
// number can't drift between surfaces the way the tool list once did (see
// PITCH_TOOLS's own header comment for that history repeating itself).
export function premiumFromLine(): string {
  const effective = premiumEffectiveMonthly();
  if (!effective) return `${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD}`;
  return `from ${effective}/mo billed yearly, or ${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD} month-to-month`;
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

// ── Announced price increase ────────────────────────────────────────────────
// History: $9.99/mo → $14.99/mo (2026-09-06, "the decided cutover price"; see
// this file's git history for the full account of the originally-announced-but-
// superseded $19.99 figure) → back down to $9.99/mo (2026-09-09, owner's call
// to revert before the three-week hold period in DECISIONS.md's 2026-09-08
// entry ran its course — see DECISIONS.md for the full account). There is no
// announced future increase right now, so PREMIUM_NEXT_PRICE_AMOUNT is pinned
// equal to PREMIUM_PRICE_AMOUNT rather than to some other yet-to-be-decided
// figure — claiming an increase that isn't real would be exactly the kind of
// thing /editorial-policy's "nothing here describes a process we don't
// actually run" rule exists to block. The moment the two amounts match, premiumPriceIncreaseAnnounced()
// goes false and every "lock in your price" surface below retires itself — no
// second flag to remember to flip off. Same self-retiring shape as
// release-calendar.ts's countdown, and for the same reason: a manually-retired
// banner is exactly the failure mode /vendetta-countdown and
// /radiance-countdown both died from. Should another increase ever actually be
// decided, the fix is ONE edit: set PREMIUM_NEXT_PRICE_AMOUNT to that real
// number, which re-arms every surface below automatically.
//
// The "your price never rises while you stay subscribed" half of this is true
// regardless of whether an increase is announced — checkout always creates a
// subscription against whatever price is CURRENTLY configured, and nothing in
// this codebase ever migrates an existing subscription to a different Stripe
// price (see api/premium/checkout's one-shot line_items and the absence of any
// subscriptions.update price-sync). An announced increase only changes WHY
// that existing guarantee is worth acting on today, not whether it holds.
export const PREMIUM_NEXT_PRICE_AMOUNT = process.env.NEXT_PUBLIC_PREMIUM_NEXT_PRICE_AMOUNT || "$9.99";
export function premiumPriceIncreaseAnnounced(): boolean {
  return PREMIUM_NEXT_PRICE_AMOUNT !== PREMIUM_PRICE_AMOUNT;
}

// The full sentence, for a banner or a dialog with room to spare. One function
// so an announced increase updates every surface at once, instead of four
// hand-typed copies (the /premium page, the Premium dialog, the corner
// slide-in, the signup popup) drifting independently the way PITCH_TOOLS's own
// header comment describes for the tool list.
export function premiumLockInLine(): string {
  return premiumPriceIncreaseAnnounced()
    ? `We're raising Premium's price soon, to ${PREMIUM_NEXT_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD}. Subscribe now and keep ${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD} for as long as you stay subscribed — no action needed when the price changes.`
    : `Subscribe now and lock in this price for good — it never rises while you stay subscribed.`;
}

// The compact tail for a small inline caption ("$9.99/month · …"), used by the
// two low-intrusion nudges (the corner slide-in, the signed-out popup) whose
// own design intent is to stay out of the way rather than carry a full banner.
export function premiumLockInTail(): string {
  return premiumPriceIncreaseAnnounced()
    ? `locked in before it rises to ${PREMIUM_NEXT_PRICE_AMOUNT} — cancel anytime`
    : `locked in for good, cancel anytime`;
}

// Tags the Premium funnel events (slide-in/popup shown, checkout started) with
// which price/framing pass they were rendered under, so GA4 can split
// before/after instead of averaging different pitches (or different price
// levels) into one number. Bump this string — no other code changes required
// — whenever the wording OR the underlying price on any of these surfaces
// changes again, including a price-only change like this one: without a bump,
// events from the $14.99 era and the reverted $9.99 era would share one tag
// and the before/after comparison this constant exists for would be lost.
export const PREMIUM_COPY_VERSION = "zero-only-slidein-2026-09-09";
