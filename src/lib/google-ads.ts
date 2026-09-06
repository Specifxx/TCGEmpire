// Google Ads conversion tracking — the PAID counterpart to AdSense (lib/ads.ts)
// and GA4 (lib/ga.ts). It does NOT load its own copy of gtag.js: GoogleAnalytics
// (components/GoogleAnalytics.tsx) already loads gtag.js and gates it behind
// Consent Mode v2 (see ConsentDefaults.tsx) for GA4's own measurement id, and a
// second script tag pointed at a second id would just double-load the same
// library. Instead, GoogleAnalytics also issues `gtag('config', GOOGLE_ADS_ID)`
// on that same already-loaded tag when this is configured, so a Google Ads
// conversion inherits the exact same consent gate GA4 already has: denied by
// default, granted only once the visitor consents (or falls outside the CMP's
// scope) — see lib/use-consent.ts.
//
// Quick start (to run paid Google Search ads):
//   1. Create a Google Ads account, then a "Website" conversion action whose
//      goal is an outbound "Buy / View deal" click (Tools → Conversions → New).
//   2. Google gives you a Conversion ID ("AW-XXXXXXXXXX") and a conversion label.
//   3. Set the two env vars below and redeploy. That's it — every outbound
//      retailer click reports a conversion Google Ads can optimise toward.
//
// Leaving the id empty disables all of this: no extra `gtag('config', ...)` call
// is made and reportOutboundConversion() becomes a harmless no-op.

// Google Ads Conversion ID, e.g. "AW-1234567890". Unlike AdSense/GA4 there is no
// safe public default — paid campaigns are account-specific — so this is opt-in.
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "";
export const GOOGLE_ADS_ENABLED = /^AW-\d{9,}$/.test(GOOGLE_ADS_ID);

// The full conversion "send_to" value: "AW-1234567890/AbC-D_efGhIjKl". Copied
// straight from the Google Ads conversion-action "Tag setup → install manually"
// snippet. Empty = outbound clicks are not reported as conversions (Ads still
// gets a page-level hit if GOOGLE_ADS_ID is set, so remarketing keeps working).
export const GOOGLE_ADS_CONVERSION_OUTBOUND = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_OUTBOUND ?? "";

// Fire a Google Ads conversion for an outbound "Buy / View deal" click. Safe to
// call from anywhere on the client: a no-op when tracking is off, gtag hasn't
// loaded (ad blocker, consent denied, GOOGLE_ADS_ENABLED off) or is unreachable,
// and it never throws — this must never block the user's click.
export function reportOutboundConversion(): void {
  if (!GOOGLE_ADS_CONVERSION_OUTBOUND) return;
  try {
    window.gtag?.("event", "conversion", { send_to: GOOGLE_ADS_CONVERSION_OUTBOUND });
  } catch {
    /* gtag not loaded / blocked — never fail a click */
  }
}
