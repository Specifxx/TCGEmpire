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

const ROUTE_PATTERN = `^(?:${AD_FREE_GAME_ROUTES.map((r) => r.replace(/\//g, "\\/")).join("|")})(?:\\/|$)`;
const HINT_PATTERN = `(?:^|;\\s*)${AD_FREE_COOKIE}=1(?:;|$)`;

// Inlined in <head> by the root layout, BEFORE <AdSenseLoader />. Pauses ad
// requests for a hinted member anywhere and for everyone in the arcade; only the
// member hint marks <html> (the arcade has no site placements to hide).
export const AD_FREE_BOOT_SCRIPT = `(function(){try{var h=/${HINT_PATTERN}/.test(document.cookie),l=window.location,g=!!l&&/${ROUTE_PATTERN}/.test(l.pathname);if(h||g){(window.adsbygoogle=window.adsbygoogle||[]).pauseAdRequests=1;}if(h){document.documentElement.setAttribute("${AD_FREE_ATTR}","1");}}catch(e){}})();`;

type AdsWindow = { adsbygoogle?: unknown[] & { pauseAdRequests?: number } };

function hinted(): boolean {
  return new RegExp(HINT_PATTERN).test(document.cookie);
}

/**
 * Hold ad requests on an arcade route or for an ad-free member; release them
 * otherwise. `adFree` defaults to the hint cookie. Browser only.
 */
export function syncAdPause(pathname: string | null | undefined, adFree?: boolean): void {
  try {
    const w = window as unknown as AdsWindow;
    const ads = (w.adsbygoogle = w.adsbygoogle ?? []) as NonNullable<AdsWindow["adsbygoogle"]>;
    ads.pauseAdRequests = isAdFreeRoute(pathname) || (adFree ?? hinted()) ? 1 : 0;
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
