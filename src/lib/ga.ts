// Google Analytics 4 measurement id.
//
// Env-overridable with the account's real id as the fallback, matching how
// TCGPLAYER_IMPACT_LINK and ADSENSE_CLIENT_ID are handled: `||`, not `??`, so an
// empty-string env var falls back to the working value rather than silently
// disabling measurement. Set NEXT_PUBLIC_GA_ID to "" ... it will NOT disable the
// tag — use NEXT_PUBLIC_GA_ID="off" for that (see GA_ENABLED below), because a
// blank env var is far more often a misconfiguration than an intent to turn
// analytics off.
export const GA_MEASUREMENT_ID = (process.env.NEXT_PUBLIC_GA_ID || "G-B5BB9ZRWM3").trim();

// An explicit kill switch that a blank/missing variable can't trip by accident.
export const GA_ENABLED = GA_MEASUREMENT_ID.toLowerCase() !== "off" && /^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID);

// Origins gtag.js talks to. Mirrored into next.config.js's Report-Only CSP —
// next.config.js cannot import a TS module at config-load time, so that copy is
// a duplicated literal exactly like the ADS_* / EZOIC_* arrays beside it.
export const GA_SCRIPT_ORIGINS = ["https://www.googletagmanager.com"] as const;
export const GA_CONNECT_ORIGINS = [
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com",
  // Regional collection endpoints (region1.google-analytics.com etc.) and the
  // newer analytics.google.com collector.
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
] as const;
