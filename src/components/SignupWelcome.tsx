"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { useMe } from "@/lib/use-me";
import { useWatchlist } from "@/lib/use-watchlist";
import type { Country } from "@/lib/country";
import { PENDING_WATCH_KEY } from "@/lib/signup-source-shared";

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
  const { user, loaded } = useMe();
  const { watch } = useWatchlist();
  const claimed = useRef(false);
  const [toast, setToast] = useState<string | null>(null);

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

  // Complete a watch that was mid-flight when the visitor chose the account
  // path in PriceAlertModal — the stash survives the OAuth round trip in
  // localStorage. Runs for NEW and RETURNING sign-ins alike (a returning
  // member who clicked the account option had the same pending watch), which
  // is why it keys off the signed-in state, not the welcome param.
  useEffect(() => {
    if (!loaded || !user || claimed.current) return;
    let pending: { cardId?: string; market?: string } | null = null;
    try {
      const raw = localStorage.getItem(PENDING_WATCH_KEY);
      if (raw) pending = JSON.parse(raw);
      localStorage.removeItem(PENDING_WATCH_KEY);
    } catch {
      /* private mode / corrupt stash — nothing to complete */
    }
    if (!pending?.cardId || !pending.market) return;
    claimed.current = true;
    void watch(pending.cardId, pending.market as Country).then((ok) => {
      if (ok) {
        setToast("Watching that card ✓ — it's on your watchlist");
        setTimeout(() => setToast(null), 5000);
      }
    });
  }, [loaded, user, watch]);

  if (!toast) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-[80] flex justify-center px-4">
      <div className="rounded-xl border border-brand-500/40 bg-ink-900/95 px-4 py-2.5 text-sm font-medium text-slate-100 shadow-2xl">
        {toast}
      </div>
    </div>
  );
}

export function SignupWelcome() {
  return (
    <Suspense fallback={null}>
      <SignupWelcomeInner />
    </Suspense>
  );
}
