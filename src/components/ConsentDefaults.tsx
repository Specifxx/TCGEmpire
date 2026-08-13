// ─────────────────────────────────────────────────────────────────────────────
// Google Consent Mode v2 — default state, set before any ad/measurement tag runs
// ─────────────────────────────────────────────────────────────────────────────
// All four v2 signals start DENIED. Google's Privacy & Messaging (Funding
// Choices) message — delivered by the AdSense loader, and a Google-certified CMP
// — flips them to granted when an EEA/UK/CH visitor consents.
//
// `wait_for_update: 500` tells Google's tags to hold measurement for up to 500ms
// while the CMP resolves, instead of firing immediately against the denied
// default and losing the signal. That window is what makes the difference
// between a consent message that "shows" and one that actually records.
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
//     wait_for_update: 500,
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
  wait_for_update:500
});
gtag('set','ads_data_redaction',true);
window.__rcConsent={analytics:false};
`.trim();

export function ConsentDefaults() {
  return <script dangerouslySetInnerHTML={{ __html: CONSENT_DEFAULTS }} />;
}
