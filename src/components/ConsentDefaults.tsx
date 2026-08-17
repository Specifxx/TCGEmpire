// ─────────────────────────────────────────────────────────────────────────────
// Google Consent Mode v2 — default state, set before any ad/measurement tag runs
// ─────────────────────────────────────────────────────────────────────────────
// All four v2 signals start DENIED. Google's Privacy & Messaging (Funding
// Choices) message — delivered by the AdSense loader, and a Google-certified CMP
// — flips them to granted when an EEA/UK/CH visitor consents.
//
// `wait_for_update: 3000` tells Google's tags to hold measurement for up to 3s
// while the CMP resolves, instead of firing immediately against the denied
// default and losing the signal. That window is what makes the difference
// between a consent message that "shows" and one that actually records.
//
// MUST STAY >= CMP_GRACE_MS (lib/use-consent.ts, currently 2500ms) — that's how
// long useConsent() waits before concluding no CMP is present and granting
// analytics outside the CMP's scope (basically all of RiftCompare's real
// traffic — Singapore/US/AU/CA, none of it EEA/UK/CH). wait_for_update used to
// be 500ms: since 500 << 2500, gtag('config', ...) fired the first
// page_view/session_start of nearly every session against the still-"denied"
// default, ~2s before the real grant landed — a cookieless hit GA4 can't attach
// a channel, landing page, or new-user flag to. Hardcoded rather than imported
// from use-consent.ts because that module is "use client" and this script is a
// plain template string rendered before any client bundle runs; the numeric
// relationship is instead pinned by tests/consent-timing.test.ts.
//
// This must be an INLINE, synchronous script in <head>, evaluated before
// adsbygoogle.js executes. It is rendered as the first child of <head> in the
// root layout; the loader below it is `async`, so it cannot execute until at
// least one network round-trip has elapsed — long after the parser has run this.
//
// GLOBAL DENIAL IS DELIBERATE. Google's own guidance allows region-scoped
// defaults (deny in the EEA, grant elsewhere), which earns materially more
// revenue because non-EEA traffic still gets personalised ads. We start with the
// blanket deny because it is the conservative reading while the account is under
// review: nothing personalised is stored for anyone until they say yes. The
// region-scoped variant is written out below, ready to swap in after approval.
//
//   gtag('consent', 'default', {
//     ad_storage: 'denied', ad_user_data: 'denied',
//     ad_personalization: 'denied', analytics_storage: 'denied',
//     region: ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU',
//              'IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES',
//              'SE','IS','LI','NO','GB','CH'],
//     wait_for_update: 3000,
//   });
//   gtag('consent', 'default', {
//     ad_storage: 'granted', ad_user_data: 'granted',
//     ad_personalization: 'granted', analytics_storage: 'granted',
//   });
//
const CONSENT_DEFAULTS = `
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{
  ad_storage:'denied',
  ad_user_data:'denied',
  ad_personalization:'denied',
  analytics_storage:'denied',
  wait_for_update:3000
});
gtag('set','ads_data_redaction',true);
window.__rcConsent={analytics:false};
`.trim();

export function ConsentDefaults() {
  return <script dangerouslySetInnerHTML={{ __html: CONSENT_DEFAULTS }} />;
}
