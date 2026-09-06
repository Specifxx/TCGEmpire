import Script from "next/script";
import { GA_ENABLED, GA_MEASUREMENT_ID } from "@/lib/ga";
import { GOOGLE_ADS_ENABLED, GOOGLE_ADS_ID } from "@/lib/google-ads";

// Google Analytics 4 (gtag.js).
//
// Google's copy-paste snippet says "immediately after the <head> element" and
// redefines window.dataLayer and gtag() itself. Pasted verbatim here that would
// have been actively harmful, for one reason: ConsentDefaults already defines
// both, as the FIRST thing in <head>, and uses them to set Consent Mode v2
// defaults before any Google tag runs. So this deliberately differs from the
// snippet in three ways:
//
//   1. It is rendered AFTER <ConsentDefaults />, never before. Consent Mode only
//      works if the defaults are queued ahead of the tag's config command; put
//      gtag.js first and every hit before the CMP resolves is recorded against
//      an unset state instead of a denied one.
//   2. It does NOT re-run `window.dataLayer = window.dataLayer || []` and does
//      not redeclare gtag(). Both already exist by the time this executes. The
//      snippet's `|| []` is idempotent so re-running would be survivable, but
//      redeclaring the function for no reason is a footgun the next person has
//      to reason about.
//   3. next/script with strategy="afterInteractive" rather than a raw <script
//      async>. Next hoists and dedupes it, and — importantly — guarantees it
//      runs once per page rather than re-executing on every client-side route
//      change, which a hand-rolled tag in the App Router does not.
//
// PAGEVIEWS ON ROUTE CHANGES ARE FIRED EXPLICITLY, by GAPageViewTracker.tsx —
// not left to GA4's "Enhanced measurement" History API detection. That toggle
// lives in the GA4 Admin panel, is unverifiable from this codebase, and its
// absence/unreliability is the leading explanation for GA4 reporting ~770
// sessions against Vercel Analytics' 2,382 for the same window: a lot of
// client-side App Router navigations were never being recorded at all. The
// `send_page_view: false` below turns off gtag's OWN automatic initial
// page_view so GAPageViewTracker's first firing is the only one — no
// double-count with the config call.
//
// WHAT THIS WILL AND WILL NOT REPORT — read this before concluding GA is broken.
// ConsentDefaults sets analytics_storage:'denied' GLOBALLY (not region-scoped —
// see its header for why that is deliberate while the ad account is under
// review). Under Consent Mode that means GA4 receives cookieless, consent-denied
// pings: no client id, no cookies, and no ordinary user/session metrics for
// anyone who has not actively granted consent. Realtime will look nearly empty
// and that is the system working as configured, not a broken tag. To get normal
// reporting, either grant analytics_storage through the CMP, or swap
// ConsentDefaults to the region-scoped variant already written out in its
// comments (deny in the EEA/UK/CH, grant elsewhere).
//
// GOOGLE ADS (lib/google-ads.ts) PIGGYBACKS ON THIS SAME TAG rather than loading
// a second copy of gtag.js: the library is bootstrapped once with GA's id (or
// Ads' id if GA is ever off), and a paid conversion action just needs its own
// `gtag('config', ...)` call on the dataLayer that already exists. Doing it this
// way means a Google Ads conversion inherits the exact same Consent Mode v2 gate
// GA4 has above — denied by default, granted only once ConsentDefaults + the CMP
// say so — for free, instead of standing up a parallel, ungated tag.
export function GoogleAnalytics() {
  if (!GA_ENABLED && !GOOGLE_ADS_ENABLED) return null;
  const bootstrapId = GA_MEASUREMENT_ID && GA_ENABLED ? GA_MEASUREMENT_ID : GOOGLE_ADS_ID;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${bootstrapId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-config" strategy="afterInteractive">
        {`gtag('js', new Date());` +
          (GA_ENABLED ? `gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });` : "") +
          (GOOGLE_ADS_ENABLED ? `gtag('config', '${GOOGLE_ADS_ID}');` : "")}
      </Script>
    </>
  );
}
