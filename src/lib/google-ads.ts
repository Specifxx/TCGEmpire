// Google tag (gtag.js) configuration — powers PAID Google Ads campaigns and,
// optionally, GA4 analytics. Like AdSense (lib/ads.ts), everything here is PUBLIC
// by design (it ships in the page HTML) and driven by env vars, so you can turn
// paid-search tracking on WITHOUT a code change — just set the id(s) and redeploy.
//
// Quick start (to run paid Google Search ads):
//   1. Create a Google Ads account, then a "Website" conversion action whose goal
//      is an outbound "Buy / View deal" click (Tools → Conversions → New).
//   2. Google gives you a Conversion ID ("AW-XXXXXXXXXX") and a Conversion label.
//   3. Set the two env vars below and redeploy. That's it — the tag loads and
//      every outbound retailer click reports a conversion Google can optimise to.
//
// Leaving the id empty disables ALL of this: no gtag script is loaded and the
// conversion reporter becomes a harmless no-op.

// Google Ads Conversion ID, e.g. "AW-1234567890". Unlike AdSense there is no safe
// public default — paid campaigns are account-specific — so this is opt-in.
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "";

// Optional GA4 Measurement ID, e.g. "G-XXXXXXXXXX". GA4 + Google Ads share the
// same gtag, and linking GA4 to Ads unlocks better audiences/remarketing. Optional.
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

// The full conversion "send_to" value: "AW-1234567890/AbC-D_efGhIjKl". Copy it
// straight from the Google Ads conversion-action "Tag setup → install manually"
// snippet. Empty = clicks are not reported as conversions (the tag still loads,
// so remarketing/auto-tagging keeps working).
export const GOOGLE_ADS_CONVERSION_OUTBOUND =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_OUTBOUND ?? "";

// True when a syntactically valid Conversion ID OR GA4 id is set. Guards the tag
// loader so we never inject an empty/broken gtag script.
export const GOOGLE_ADS_ENABLED = /^AW-\d{9,}$/.test(GOOGLE_ADS_ID);
export const GA_ENABLED = /^G-[A-Z0-9]{6,}$/.test(GA_MEASUREMENT_ID);
export const GOOGLE_TAG_ENABLED = GOOGLE_ADS_ENABLED || GA_ENABLED;

// The id used to bootstrap gtag.js (the script is loaded once with a single id and
// then `config`'d for each product). Prefer the Ads id since that's the paid use.
export const GOOGLE_TAG_BOOTSTRAP_ID = GOOGLE_ADS_ID || GA_MEASUREMENT_ID;

// Fire a Google Ads conversion for an outbound "Buy / View deal" click. Safe to
// call from anywhere on the client: it's a no-op when tracking is off or the tag
// hasn't loaded, and it never throws (must never block the user's click).
export function reportOutboundConversion(): void {
  if (!GOOGLE_ADS_CONVERSION_OUTBOUND) return;
  try {
    const w = window as unknown as { gtag?: (...args: unknown[]) => void };
    w.gtag?.("event", "conversion", { send_to: GOOGLE_ADS_CONVERSION_OUTBOUND });
  } catch {
    /* gtag not loaded / blocked — never fail a click */
  }
}
