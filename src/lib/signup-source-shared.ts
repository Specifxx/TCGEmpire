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
  // The Premium funnel's own two surfaces (2026-09-13). Before these existed,
  // /premium's signed-out CTA linked straight to /login and its signups recorded
  // as "login" — indistinguishable from someone who typed /login themselves, so
  // the highest-intent signups on the site were the least attributable.
  "premium_cta", // the /premium pricing-card button
  "premium_dialog", // the tool blur-wall upsell dialog
  // "Create a free account" on Deal Finder / Rising Cards' signed-out preview,
  // which promises the top three (2026-09-23). Separate from "gate", which is
  // retired, so the two can never be read as one series.
  "tool_preview",
  // 2026-09-24 growth pass: the header's "Sign up free", the card page's
  // one-click price-drop alert, and the two article-template CTAs.
  "header",
  "card_alert",
  "article_intro",
  "article_end",
  // 2026-09-25: the /login links that carried no source at all, so their
  // sign-ups recorded as "login". Each rides the link as ?src=, which AuthForm
  // stashes on landing (tests/login-links-attributed.test.ts keeps it so).
  "games", // the games hub and each game's save-your-score prompt
  "tool_gate", // "Sign in free" on the gated tools (Value Finder, Demand, …)
  "watchlist_drawer",
  "quickview", // QuickView's "Sign in to track your collection"
  "shared_collection", // a shared binder's "Start your collection"
  "feedback",
  // The same one-click alert, compact, inside QuickView (2026-09-25), where a
  // CardTile tap lands. Its own value so it can be weighed against QuickView's
  // buy_click rather than blended into card_alert.
  "quickview_alert",
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
