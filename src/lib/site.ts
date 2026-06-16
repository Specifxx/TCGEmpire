// Site-wide constants.

// Public contact address — shown on the site and used to forward feedback emails.
export const CONTACT_EMAIL = "riftcompare@gmail.com";

export const SITE_NAME = "RiftCompare";

// Community Discord invite (permanent; opens in a new tab from the navbar icon).
export const DISCORD_URL = "https://discord.gg/NypdmfAMTa";

// Canonical origin (no trailing slash). Used for metadata, sitemap and robots.
export const SITE_URL = "https://riftcompare.com";

// "Buy me a coffee" tip link, shown at the foot of every page. Override the handle
// with NEXT_PUBLIC_BUYMEACOFFEE_URL if the username differs.
export const BUYMEACOFFEE_URL = process.env.NEXT_PUBLIC_BUYMEACOFFEE_URL || "https://www.buymeacoffee.com/riftcompare";

// Display price for RiftCompare Premium (e.g. "$4.99/mo"). Set
// NEXT_PUBLIC_PREMIUM_PRICE to match the price you created in Stripe so the
// /premium page shows the real cost. Empty = show the generic "booster pack a
// month" copy instead of a number.
export const PREMIUM_PRICE_LABEL = process.env.NEXT_PUBLIC_PREMIUM_PRICE || "";
