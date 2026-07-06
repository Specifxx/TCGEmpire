// Site-wide constants.

// Public contact address — shown on the site and used to forward feedback emails.
export const CONTACT_EMAIL = "riftcompare@gmail.com";

export const SITE_NAME = "RiftCompare";

// Community Discord invite (permanent; opens in a new tab from the navbar icon).
export const DISCORD_URL = "https://discord.gg/NypdmfAMTa";

// Canonical origin (no trailing slash). Used for metadata, sitemap and robots.
export const SITE_URL = "https://riftcompare.com";

// Meta (Facebook) Pixel ID — powers Meta ad measurement + retargeting/lookalike
// audiences. PUBLIC by design (it ships in the page HTML). Override per-deploy with
// NEXT_PUBLIC_META_PIXEL_ID; set it to an empty string to disable the pixel entirely.
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "4210297419228994";

// "Buy me a coffee" tip link, shown at the foot of every page. Override the handle
// with NEXT_PUBLIC_BUYMEACOFFEE_URL if the username differs.
export const BUYMEACOFFEE_URL = process.env.NEXT_PUBLIC_BUYMEACOFFEE_URL || "https://buymeacoffee.com/riftcompare";

// Display price for RiftCompare Premium (e.g. "$4.99/mo"). Set
// NEXT_PUBLIC_PREMIUM_PRICE to match the price you created in Stripe so the
// /premium page shows the real cost. Empty = show the generic "booster pack a
// month" copy instead of a number.
export const PREMIUM_PRICE_LABEL = process.env.NEXT_PUBLIC_PREMIUM_PRICE || "";
