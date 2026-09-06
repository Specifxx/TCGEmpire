// ─────────────────────────────────────────────────────────────────────────────
// Google AdSense — SINGLE SOURCE OF TRUTH
// ─────────────────────────────────────────────────────────────────────────────
// Every AdSense-derived value on the site is computed from ONE env var,
// NEXT_PUBLIC_ADSENSE_CLIENT_ID:
//
//   • the <meta name="google-adsense-account"> ownership tag (layout.tsx)
//   • the pagead2 loader <script> src (components/AdSenseLoader.tsx)
//   • every <ins class="adsbygoogle" data-ad-client=…> unit (components/AdSlot.tsx)
//   • the /ads.txt seller line (app/ads.txt/route.ts)
//
// The publisher id is PUBLIC by design — it ships in the page HTML — but it must
// never be written as a literal anywhere except the env files, because a stale
// copy is exactly how this site ended up serving a publisher id belonging to no
// account under review, hardcoded in the root layout, through two consecutive
// rejections. See docs/adsense-remediation.md for the incident and the id.
// scripts/adsense-guard.ts fails the build if such a literal reappears in src/.
//
// NOTE ON NEXT_PUBLIC_: the value is inlined at build time by Next, so it is
// readable from server components, route handlers AND client components — which
// is required, since the ad units are client-rendered but ads.txt is a server
// route and both must agree byte-for-byte.

/** AdSense client ids are always "ca-pub-" + exactly 16 digits. */
export const ADSENSE_CLIENT_ID_PATTERN = /^ca-pub-\d{16}$/;

// Read the raw value. Written as a static member expression so Next's build-time
// inliner can substitute it (a computed lookup like process.env[key] is NOT
// inlined and would be undefined in the browser bundle).
const RAW_CLIENT_ID = (process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? "").trim();

// Are we in a production build? `next build`/`next start` set NODE_ENV=production;
// `next dev` sets "development"; a bare `tsx script.ts` run sets neither.
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const MISCONFIGURED = `
╔══════════════════════════════════════════════════════════════════════════════╗
║  ADSENSE MISCONFIGURED — build halted                                        ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  NEXT_PUBLIC_ADSENSE_CLIENT_ID is unset or malformed.                        ║
║                                                                              ║
║  Received: ${(RAW_CLIENT_ID || "(empty)").padEnd(64)}  ║
║  Expected: ca-pub- followed by exactly 16 digits                             ║
║                                                                              ║
║  Fix: set NEXT_PUBLIC_ADSENSE_CLIENT_ID in the Vercel project's environment  ║
║  variables (Production + Preview), or in .env.production locally.            ║
║  The correct value for riftcompare.com is in .env.example.                   ║
║                                                                              ║
║  This assertion is deliberate: shipping the site with a missing or wrong     ║
║  publisher id silently voids the AdSense review, which is far more expensive ║
║  than a failed build. Vercel keeps the previous deployment live when a build ║
║  fails, so nothing goes down.                                                ║
╚══════════════════════════════════════════════════════════════════════════════╝`;

// STARTUP ASSERTION. Throwing at module-evaluation time means an invalid id can
// never reach production: the `next build` that would have shipped it fails
// instead. In dev we warn rather than throw so a fresh clone with no .env still
// boots (the loader simply doesn't render — see ADSENSE_CONFIGURED below).
if (!ADSENSE_CLIENT_ID_PATTERN.test(RAW_CLIENT_ID)) {
  if (IS_PRODUCTION) throw new Error(MISCONFIGURED);
  // eslint-disable-next-line no-console
  console.warn(
    "[adsense] NEXT_PUBLIC_ADSENSE_CLIENT_ID is unset or malformed — AdSense tags " +
      "will not render in this dev session. Copy the value from .env.example into .env.",
  );
}

/** True when a well-formed publisher id is configured. */
export const ADSENSE_CONFIGURED = ADSENSE_CLIENT_ID_PATTERN.test(RAW_CLIENT_ID);

/** The verified client id — used for data-ad-client and the loader's ?client=. */
export const ADSENSE_CLIENT_ID = RAW_CLIENT_ID;

/**
 * The ads.txt seller id ("pub-…"). Derived by stripping the "ca-" prefix, so
 * /ads.txt can never drift from the loader script.
 */
export const ADSENSE_PUB_ID = ADSENSE_CLIENT_ID.replace(/^ca-/, "");

/** The exact loader URL Google's AdSense console hands out. */
export const ADSENSE_LOADER_SRC =
  `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;

// ─────────────────────────────────────────────────────────────────────────────
// Review mode
// ─────────────────────────────────────────────────────────────────────────────
// While the site is under AdSense review, this flag can neutralise surfaces
// that reviewers penalise: the homepage Premium teaser shows its real content
// instead of a locked count, blurred Premium previews render unblurred, and the
// AI-generated price commentary module is hidden. See docs/adsense-remediation.md
// § Phase 9.
//
// DEFAULT FLIPPED TO CLOSED on 2026-08-20 (was default-open): riftcompare.com's
// third AdSense review is still pending, but the paywall bypass this flag causes
// — /tools/deal-finder, /tools/rising, /tools/value-finder and /portfolio fully
// open to every signed-in user, Premium or not — was found live in production
// and is a real revenue bug, not a cosmetic one. Explicit business call: the
// paywall now takes priority over AdSense approval odds. Set
// NEXT_PUBLIC_ADSENSE_REVIEW_MODE=true (and ADSENSE_REVIEW_MODE=true to match,
// see below) ONLY if review mode needs to go back on for a future submission —
// and remember Vercel's dashboard value, if any is still set from the earlier
// default-open era, overrides this code default either way.
//
// THIS FLAG NEVER GATES THE LOADER SCRIPT OR THE OWNERSHIP META TAG. Those two
// must render on every page unconditionally; review mode only controls page
// CONTENT and whether ad UNITS are allowed to fill.
//
// Two names are read: NEXT_PUBLIC_ADSENSE_REVIEW_MODE is the one to set, because
// it is the only one visible inside client components. ADSENSE_REVIEW_MODE is
// accepted as a server-side alias for the exact name specified in the
// remediation brief. Set BOTH to the same value if you set the non-public one,
// or a client component would disagree with the server and hydration would warn.
const REVIEW_RAW = (
  process.env.NEXT_PUBLIC_ADSENSE_REVIEW_MODE ??
  process.env.ADSENSE_REVIEW_MODE ??
  "false"
)
  .trim()
  .toLowerCase();

/** Default FALSE (paywall enforced) — opting into review mode is explicit ("true"/"1"/"on"). */
export const ADSENSE_REVIEW_MODE = ["true", "1", "on", "yes"].includes(REVIEW_RAW);

// ─────────────────────────────────────────────────────────────────────────────
// Ad strategy — Auto ads XOR manual units, never both
// ─────────────────────────────────────────────────────────────────────────────
// Auto ads let Google place units itself; manual units are the <ins> blocks this
// codebase renders. Running BOTH stacks Google's placements on top of ours and
// produces the ad density that trips the "Ad density / Better Ads Standards"
// half of the Publisher Policies. They are therefore mutually exclusive by
// construction: AD_UNITS_ENABLED is only ever true in "manual".
//
//   AD_STRATEGY="auto"    (default) — enable Auto ads in the AdSense console;
//                                     this codebase renders NO <ins> units.
//   AD_STRATEGY="manual"            — turn Auto ads OFF in the AdSense console;
//                                     this codebase places the units itself.
const STRATEGY_RAW = (
  process.env.NEXT_PUBLIC_AD_STRATEGY ??
  process.env.AD_STRATEGY ??
  "auto"
)
  .trim()
  .toLowerCase();

export type AdStrategy = "auto" | "manual";
export const AD_STRATEGY: AdStrategy = STRATEGY_RAW === "manual" ? "manual" : "auto";

/**
 * Whether this codebase may render its own <ins class="adsbygoogle"> units.
 *
 * FALSE while under review (no ad units until approved — an unfilled unit shows
 * a blank reserved box to a reviewer), FALSE under the "auto" strategy (Google
 * places its own), and FALSE without a configured client id.
 */
export const AD_UNITS_ENABLED =
  ADSENSE_CONFIGURED && !ADSENSE_REVIEW_MODE && AD_STRATEGY === "manual";

// ─────────────────────────────────────────────────────────────────────────────
// Ad-serving domains — the allow-list every CSP/connectivity check must include
// ─────────────────────────────────────────────────────────────────────────────
// Blocking ANY of these breaks either ad delivery or the GDPR consent message,
// and a consent message that can't load is why the published EEA message has
// recorded 0 impressions. Consumed by next.config.js's CSP.
export const ADSENSE_SCRIPT_ORIGINS = [
  "https://pagead2.googlesyndication.com",
  "https://partner.googleadservices.com",
  "https://tpc.googlesyndication.com",
  "https://googleads.g.doubleclick.net",
  "https://fundingchoicesmessages.google.com",
  "https://www.googletagservices.com",
  "https://adservice.google.com",
];

export const ADSENSE_FRAME_ORIGINS = [
  "https://googleads.g.doubleclick.net",
  "https://tpc.googlesyndication.com",
  "https://www.google.com",
  "https://fundingchoicesmessages.google.com",
];

export const ADSENSE_CONNECT_ORIGINS = [
  "https://pagead2.googlesyndication.com",
  "https://googleads.g.doubleclick.net",
  "https://tpc.googlesyndication.com",
  "https://ep1.adtrafficquality.google",
  "https://ep2.adtrafficquality.google",
  "https://fundingchoicesmessages.google.com",
  "https://csi.gstatic.com",
];
