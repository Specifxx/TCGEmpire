"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

// Fires the sign_up analytics event for a BRAND-NEW account.
//
// WHY THIS EXISTS: the OAuth callback is the only code that knows whether a
// sign-in created an account (isNew) — but it's a server route, and analytics
// fire in the browser. The callback bridges the gap by appending
// ?welcome=<provider> to its redirect for new accounts only; this component,
// mounted once in the root layout, converts that param into a single
// trackEvent("sign_up", { method }) and then strips the param from the URL
// with router.replace — so a refresh, share, or bookmark of the landing page
// can never re-fire it. Returning sign-ins carry no param and fire nothing.
//
// ISR-safe: reads searchParams purely client-side, renders nothing, and query
// params never enter cached server HTML — so mounting it globally cannot leak
// per-user state into any shared page. Self-wrapped in <Suspense> (same
// pattern as GAPageViewTracker) because useSearchParams requires a boundary
// in the app router — callers just mount <SignupWelcome />.
function SignupWelcomeInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    const welcome = searchParams?.get("welcome");
    if (!welcome || fired.current) return;
    fired.current = true;
    trackEvent("sign_up", { method: welcome });
    // Rebuild the URL without the welcome param (keep anything else intact).
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("welcome");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname ?? "/", { scroll: false });
  }, [searchParams, pathname, router]);

  return null;
}

export function SignupWelcome() {
  return (
    <Suspense fallback={null}>
      <SignupWelcomeInner />
    </Suspense>
  );
}
