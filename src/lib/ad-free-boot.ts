// Ad-free from the first byte for a returning paid member (review + QA,
// 2026-09-25). No React, no DOM at module level — importable anywhere, like
// lib/theme-shared.ts, whose cookie + inline-script pattern this copies.
//
// ── The two gaps it closes ───────────────────────────────────────────────────
// 1. AUTO ADS. The AdSense loader ships to every visitor, paid members
//    included, and must never be gated (components/AdSenseLoader.tsx,
//    scripts/adsense-guard.ts). Every ad-free check in the app gates only the
//    site's OWN placements, so once Auto ads are switched on after approval,
//    Google would place ads for Plus and Premium members — while every pitch
//    promises "no ads on any page". `adsbygoogle.pauseAdRequests = 1` is
//    Google's switch for holding the loader's ad requests; the boot script
//    sets it before adsbygoogle.js can run (the loader is async, so it cannot
//    execute before this inline script is parsed).
// 2. THE FIRST PAINT. adFree resolves client-side from /api/me (the layout
//    must not read cookies() — it would end ISR site-wide), so the HTML every
//    page ships contains the house and affiliate placements, and a paid member
//    saw them until /api/me answered. The boot script also stamps
//    data-adfree on <html>, and globals.css hides every element marked
//    [data-ad-placement] under it until React takes over (each placement then
//    returns null for an ad-free viewer anyway).
//
// ── The cookie ───────────────────────────────────────────────────────────────
// A HINT, not an entitlement: PremiumProvider writes it whenever /api/me says
// adFree and clears it (and resumes ad requests) whenever /api/me says not —
// a lapsed subscription or a sign-out corrects itself on the next /api/me.
// Nothing server-side ever reads it. Only the very first page view after
// subscribing, before the cookie exists, can still show an Auto ad.
export const AD_FREE_COOKIE = "rc_adfree";
export const AD_FREE_COOKIE_MAX_AGE = 60 * 60 * 24 * 31;
export const AD_FREE_ATTR = "data-adfree";

// The arcade is ad-free for EVERY visitor, not just paid members (2026-10-02 for
// the site's own placements; 2026-10-16, owner: "get rid of all the ads on the
// games pages and Seraphine's Piano as it may ruin the experience"). The site's
// placements already render nothing there (FooterAds, AdSlot), but Auto ads came
// from the ungated loader, so on these routes ad requests are paused too: in the
// boot script for a page load, and by syncAdPause on every client navigation.
// Each prefix covers itself and everything under it, never a longer word
// ("/gamestop" is not a game).
export const AD_FREE_GAME_ROUTES = ["/games", "/riftle"] as const;

export function isAdFreeRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return AD_FREE_GAME_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

// ── Phones and tablets (2026-10-16, owner: "reduce the impact of ads on a
// mobile phone … especially on a homepage … you have to constantly be clicking
// to get rid of it and you can't really even set up a cart") ─────────────────
// Measured on the live site at 390px the same day: Auto ads put a 390px unit
// ABOVE the homepage hero (an unfilled one became a "Discover more" search
// box), three more of the same size down the page, and an ad-intent anchor bar
// ("Read Economics ✕") along the bottom edge, right over a card page's Buy bar;
// ad intents also turned words in the site's own copy ("card", "deck",
// "prices") into links that open a search-ad dialog when tapped. So, below
// the desktop rail's breakpoint (the layout a phone or tablet gets; Google's own
// overlay settings draw their desktop line at 1000px):
//   1. no ad intents anywhere: MOBILE_AD_INTENTS_SCRIPT adds Google's
//      documented `google-anno-skip` class to <body>, which keeps ad intent
//      links, anchors and chips off the page;
//   2. no Google ads at all on the two list builders, where people build a
//      cart: Best Basket and the deck builder (each with everything under it).
//      The six market homepages were on this list for a few hours; the owner
//      brought their ads back the same day ("bring back the ads on the home
//      page"), so a phone's homepage has Auto ads again, still without ad
//      intents.
// Desktop is unchanged, and so are the site's own labelled affiliate units.
export const MOBILE_AD_QUERY = "(max-width: 1023px)";
export const MOBILE_AD_FREE_ROUTES = ["/tools/best-basket", "/deck"] as const;
export const AD_INTENTS_SKIP_CLASS = "google-anno-skip";

const under = (pathname: string, r: string) => pathname === r || pathname.startsWith(`${r}/`);

export function isMobileAdFreeRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return MOBILE_AD_FREE_ROUTES.some((r) => under(pathname, r));
}

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(MOBILE_AD_QUERY).matches;
}

const esc = (r: string) => r.replace(/\//g, "\\/");
const ROUTE_PATTERN = `^(?:${AD_FREE_GAME_ROUTES.map(esc).join("|")})(?:\\/|$)`;
const MOBILE_PATTERN = `^(?:${MOBILE_AD_FREE_ROUTES.map(esc).join("|")})(?:\\/|$)`;
const HINT_PATTERN = `(?:^|;\\s*)${AD_FREE_COOKIE}=1(?:;|$)`;
const MOBILE_TEST = `!!window.matchMedia&&window.matchMedia("${MOBILE_AD_QUERY}").matches`;

// Inlined in <head> by the root layout, BEFORE <AdSenseLoader />. Pauses ad
// requests for a hinted member anywhere, for everyone in the arcade, and on a
// phone on the list builders above; only the member hint marks <html> (the
// arcade and those pages keep the site's own placements, which are not AdSense).
export const AD_FREE_BOOT_SCRIPT = `(function(){try{var h=/${HINT_PATTERN}/.test(document.cookie),l=window.location,g=!!l&&/${ROUTE_PATTERN}/.test(l.pathname),m=!!l&&/${MOBILE_PATTERN}/.test(l.pathname)&&${MOBILE_TEST};if(h||g||m){(window.adsbygoogle=window.adsbygoogle||[]).pauseAdRequests=1;}if(h){document.documentElement.setAttribute("${AD_FREE_ATTR}","1");}}catch(e){}})();`;

// Inlined as the FIRST child of <body> (the class must be on <body> to keep ad
// intent anchors away, and <body> does not exist yet when the <head> script
// runs). Still ahead of anything AdSense does: the loader needs a fresh
// cross-origin connection, and ad intents come from the second script it loads.
// Decided once per page load, like the pause; <body> carries
// suppressHydrationWarning for this one class.
//
// The observer is not belt-and-braces. When a first visit's hydration fails
// (the live #418/#423; it happens with Auto ads blocked too, so its cause is
// still open, DECISIONS.md 2026-10-16), React re-renders the root and resets
// <body>'s attributes to its props, which dropped the class in the
// measurement. The observer puts it back on that <body>, or on a new one.
export const MOBILE_AD_INTENTS_SCRIPT = `(function(){try{if(${MOBILE_TEST}){var c="${AD_INTENTS_SKIP_CLASS}",d=document,k=function(){var b=d.body;if(b&&!b.classList.contains(c))b.classList.add(c)};k();var O=window.MutationObserver;if(O){var o=new O(k);o.observe(d.documentElement,{childList:true});o.observe(d.body,{attributes:true,attributeFilter:["class"]})}}}catch(e){}})();`;

type AdsWindow = { adsbygoogle?: unknown[] & { pauseAdRequests?: number } };

function hinted(): boolean {
  return new RegExp(HINT_PATTERN).test(document.cookie);
}

/**
 * Hold ad requests on an arcade route, on a phone's ad-free pages, or for an
 * ad-free member; release them otherwise. `adFree` defaults to the hint cookie.
 * Browser only.
 */
export function syncAdPause(pathname: string | null | undefined, adFree?: boolean): void {
  try {
    const w = window as unknown as AdsWindow;
    const ads = (w.adsbygoogle = w.adsbygoogle ?? []) as NonNullable<AdsWindow["adsbygoogle"]>;
    const mobile = isMobileAdFreeRoute(pathname) && isMobileViewport();
    ads.pauseAdRequests = isAdFreeRoute(pathname) || mobile || (adFree ?? hinted()) ? 1 : 0;
  } catch {
    /* no window or cookies blocked: the boot script's choice stands */
  }
}

// Called by PremiumProvider once /api/me has answered. Browser only.
export function syncAdFree(adFree: boolean): void {
  try {
    document.cookie = adFree
      ? `${AD_FREE_COOKIE}=1; Path=/; Max-Age=${AD_FREE_COOKIE_MAX_AGE}; SameSite=Lax`
      : `${AD_FREE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    if (adFree) document.documentElement.setAttribute(AD_FREE_ATTR, "1");
    else document.documentElement.removeAttribute(AD_FREE_ATTR);
  } catch {
    /* cookies blocked — the placements still hide once React knows */
  }
  // A visitor who is not ad-free still gets no ads in the arcade.
  syncAdPause(typeof window === "undefined" ? null : window.location.pathname, adFree);
}
