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
// Stripe (override any of them via the NEXT_PUBLIC_* env vars).
export const PREMIUM_PRICE_AMOUNT = process.env.NEXT_PUBLIC_PREMIUM_PRICE_AMOUNT || "$9.99";
export const PREMIUM_PRICE_PERIOD = process.env.NEXT_PUBLIC_PREMIUM_PRICE_PERIOD || "month";
export const PREMIUM_PRICE_LABEL = process.env.NEXT_PUBLIC_PREMIUM_PRICE || `${PREMIUM_PRICE_AMOUNT}/mo`;

// Annual plan (display only; the actual charge comes from the Stripe annual price,
// enabled via STRIPE_PREMIUM_ANNUAL_PRICE_ID — see lib/premium.ts).
export const PREMIUM_ANNUAL_AMOUNT = process.env.NEXT_PUBLIC_PREMIUM_ANNUAL_AMOUNT || "$79.99";
export const PREMIUM_ANNUAL_PERIOD = process.env.NEXT_PUBLIC_PREMIUM_ANNUAL_PERIOD || "year";

// Percent saved on annual vs paying monthly for a year (rounded). Parses the numeric
// part of each amount; falls back to 0 if either can't be read.
export function annualSavingPct(): number {
  const num = (s: string) => Number(s.replace(/[^0-9.]/g, ""));
  const monthly = num(PREMIUM_PRICE_AMOUNT);
  const annual = num(PREMIUM_ANNUAL_AMOUNT);
  if (!monthly || !annual) return 0;
  return Math.max(0, Math.round((1 - annual / (monthly * 12)) * 100));
}

// ── Announced price increase ────────────────────────────────────────────────
// Premium's price is going up for NEW subscribers, to $19.99/mo — a real,
// decided change (2026-09), not yet scheduled to an exact date, hence the
// default below rather than a dated countdown. When the real cutover happens,
// the fix is ONE edit: bump PREMIUM_PRICE_AMOUNT itself to $19.99. The moment
// it matches PREMIUM_NEXT_PRICE_AMOUNT, premiumPriceIncreaseAnnounced() goes
// false and every "lock in your price" surface below retires itself — no
// second flag to remember to flip off. Same self-retiring shape as
// release-calendar.ts's countdown, and for the same reason: a manually-retired
// banner is exactly the failure mode /vendetta-countdown and
// /radiance-countdown both died from.
//
// The "your price never rises while you stay subscribed" half of this is true
// regardless of whether an increase is announced — checkout always creates a
// subscription against whatever price is CURRENTLY configured, and nothing in
// this codebase ever migrates an existing subscription to a different Stripe
// price (see api/premium/checkout's one-shot line_items and the absence of any
// subscriptions.update price-sync). An announced increase only changes WHY
// that existing guarantee is worth acting on today, not whether it holds.
export const PREMIUM_NEXT_PRICE_AMOUNT = process.env.NEXT_PUBLIC_PREMIUM_NEXT_PRICE_AMOUNT || "$19.99";
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
