// How this visitor FIRST arrived in this tab session: "reddit", "search",
// "email"… — a coarse bucket, never the referring URL itself.
//
// WHY (2026-09-26). The owner grows the site by posting blog and
// /radiance-preorders links on Reddit, and asked for more of those visitors to
// click through to eBay. Nothing could say whether they did: buy_click carried
// no notion of where the session came from, Vercel's custom-events panel has no
// referrer breakdown, and GA4 — which does attribute sessions — sees roughly a
// third of the sessions Vercel does (GAPageViewTracker.tsx). Stamping the entry
// bucket onto buy_click (OutboundLink) and preorder_cta_click answers "did the
// Reddit readers click eBay?" directly in both tools.
//
// FIRST TOUCH, captured once per tab (ReferralCapture, mounted in the layout).
// Next's soft navigations keep document.referrer, but any hard navigation
// inside the site (QuickView's "View full page →", a reload) replaces it with
// our own origin — reading it at click time would credit a Reddit visitor's
// eBay click to "internal". sessionStorage keeps the landing value for the tab.
//
// utm_source WINS over the referrer when it names a known bucket, because the
// Reddit and Discord apps often open links with NO referrer at all — a link
// posted as `…?utm_source=reddit` is the only way those visits are attributed.

export type EntrySource = "reddit" | "discord" | "search" | "social" | "email" | "internal" | "direct" | "other";

const KEY = "rc_entry";

// Hostname patterns, matched against the referrer's host (or, for Android's
// `android-app://com.reddit.frontpage/`, the whole string).
const BUCKETS: [EntrySource, RegExp][] = [
  ["reddit", /(^|\.)reddit\.com$|(^|\.)redd\.it$|com\.reddit/],
  ["discord", /(^|\.)discord(app)?\.(com|gg|net)$|com\.discord/],
  [
    "search",
    /(^|\.)(google|bing|duckduckgo|ecosia|yandex|baidu|startpage|qwant|naver)\.[a-z.]+$|^search\.(yahoo|brave)\.[a-z.]+$/,
  ],
  [
    "social",
    /(^|\.)(t\.co|x\.com|twitter\.com|facebook\.com|fb\.me|instagram\.com|threads\.net|bsky\.app|youtube\.com|youtu\.be|tiktok\.com|pinterest\.[a-z.]+)$/,
  ],
];

// utm_source values mapped onto the same buckets. Our own emails tag links
// utm_source=email (lib/email.ts) or utm_source=newsletter (the release-day
// and weekly mail), and the Discord bot utm_source=discord-bot — so those land
// as "email" and "discord" rather than as a referrer-less "direct".
const UTM: [EntrySource, RegExp][] = [
  ["reddit", /^reddit/],
  ["discord", /^discord/],
  ["email", /^(email|newsletter)$/],
  ["social", /^(twitter|x|facebook|instagram|threads|bluesky|youtube|tiktok)$/],
];

/** Pure: classify a landing from its referrer, the site's own host and the
 *  landing URL's query string. */
export function classifyEntry(referrer: string, host: string, search: string): EntrySource {
  const utm = (new URLSearchParams(search).get("utm_source") ?? "").trim().toLowerCase();
  if (utm) {
    for (const [bucket, re] of UTM) if (re.test(utm)) return bucket;
  }
  if (!referrer) return "direct";
  let refHost = "";
  try {
    refHost = new URL(referrer).host.toLowerCase();
  } catch {
    refHost = referrer.toLowerCase();
  }
  if (refHost === host.toLowerCase()) return "internal";
  for (const [bucket, re] of BUCKETS) if (re.test(refHost) || re.test(referrer.toLowerCase())) return bucket;
  return "other";
}

/** Client: record the landing's bucket once per tab session. Safe to call on
 *  every full page load; only the first call in a tab writes. */
export function captureEntrySource(): void {
  try {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, classifyEntry(document.referrer, window.location.host, window.location.search));
  } catch {
    // Storage blocked (private mode, sandboxed frame): attribution is a nicety.
  }
}

/** Client: the recorded bucket, capturing it first if the layout's capture has
 *  not run yet — ReferralCapture is a client-only dynamic import, so a click in
 *  the first instant after hydration can beat it. Capturing here is still first
 *  touch: on the landing page document.referrer is the external one. */
export function readEntrySource(): EntrySource | undefined {
  captureEntrySource();
  try {
    return (sessionStorage.getItem(KEY) as EntrySource | null) ?? undefined;
  } catch {
    return undefined;
  }
}
