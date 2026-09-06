"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Fires GA4's page_view manually on every App Router client-side navigation.
//
// WHY THIS EXISTS: GA4's "Enhanced measurement" can auto-detect SPA navigations
// via the History API, but that is an Admin-panel toggle this codebase cannot
// verify or control, and it is exactly what GoogleAnalytics.tsx used to rely on
// (see its git history) while GA4 reported ~770 sessions against Vercel
// Analytics' 2,382 for the same window — a gap consistent with History-API
// detection missing a large share of client-side route changes. Firing
// page_view explicitly, the way Google's own Next.js App Router guidance
// recommends, does not depend on that toggle.
//
// GoogleAnalytics.tsx's `gtag('config', ..., { send_page_view: false })` turns
// off the automatic initial page_view so this component's first effect run
// (on mount, pathname/searchParams already set) is the ONLY page_view for that
// load — never a double-count with the automatic one.
//
// PRESERVING REFERRER: gtag.js only captures document.referrer for the very
// first hit of a page load; it has no notion of "the previous SPA route" on
// its own. Passing page_referrer ourselves on every subsequent navigation is
// what lets GA4 attribute an in-app click (e.g. blog post -> /browse) to the
// actual previous page instead of stamping every SPA navigation as the same
// referrer as the original hit, or as "(not set)". The very first firing
// intentionally omits page_referrer, so gtag.js falls back to document.referrer
// (the real external referrer — google/bing/duckduckgo/etc.) precisely once,
// which is what session-level channel attribution keys off.
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.gtag) return;
    // Admin pages are internal tooling, not audience traffic — never log them to
    // analytics (they'd otherwise inflate page_view counts and leak internal
    // paths into GA reports). Covers /admin and every /admin/* sub-route.
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return;
    const query = searchParams.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    const location = `${window.location.origin}${path}`;

    window.gtag("event", "page_view", {
      page_location: location,
      page_path: path,
      page_title: document.title,
      ...(prevUrl.current ? { page_referrer: prevUrl.current } : {}),
    });
    prevUrl.current = location;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return null;
}

// useSearchParams() requires a Suspense boundary — wrapped here so every call
// site (just layout.tsx) can mount this without knowing that detail.
export function GAPageViewTracker() {
  return (
    <Suspense fallback={null}>
      <PageViewTracker />
    </Suspense>
  );
}
