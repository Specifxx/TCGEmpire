// Signup-source attribution — the SHARED, import-anywhere half.
//
// No "use client" directive on purpose: the OAuth callback (a route handler)
// validates the cookie's value with parseSignupSource(), and a server module
// cannot import from a client-marked file. The client half (markSignupSource,
// which needs document.cookie and the analytics dispatcher) lives in
// signup-source.ts and imports these constants, so both sides agree on the
// cookie name and the allowed values without duplicating either.
//
// The whitelist mirrors api/premium/click's SOURCES pattern: attribution is
// only ever one of these known strings, so a tampered cookie can't inject
// arbitrary text into the User table or the admin breakdown.
export const SIGNUP_SOURCE_COOKIE = "rc_signup_src";

export const SIGNUP_SOURCES = new Set([
  "navbar",
  "popup",
  "alert_modal",
  "alert_success",
  "card_cta",
  "home",
  "alerts_page",
  "login",
  "email",
  // RETIRED — no surface sets this any more. The search-limit gate that did was
  // removed (see api/search/route.ts). Kept in the whitelist deliberately: real
  // accounts created during the day it shipped carry "gate" in User.signupSource,
  // and a cookie set just before the deploy must still parse rather than fall
  // back to null and silently mis-attribute a signup.
  "gate",
  "referral",
  "other",
]);

/** The cookie's value if it's a known source, else null (never a raw string). */
export function parseSignupSource(value: string | null | undefined): string | null {
  return value && SIGNUP_SOURCES.has(value) ? value : null;
}

// localStorage key for a watch that was mid-flight when a signed-out visitor
// chose the account path in PriceAlertModal. Defined here (not in the modal)
// because SignupWelcome — statically imported by the root layout — also reads
// it, and importing the modal for one constant would drag the whole
// dynamically-imported (ssr:false) modal into the layout's eager bundle.
export const PENDING_WATCH_KEY = "rc_pending_watch";
