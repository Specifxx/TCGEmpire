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
