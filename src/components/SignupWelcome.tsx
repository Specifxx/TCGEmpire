"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { trackSignupComplete } from "@/lib/growth-events";
import { useMe } from "@/lib/use-me";
import { useWatchlist } from "@/lib/use-watchlist";
import type { Country } from "@/lib/country";
import { PENDING_WATCH_KEY } from "@/lib/signup-source-shared";
import { markSignupSession } from "@/lib/signup-session";
import { Toast } from "./ui/Toast";

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
  // Only the welcome toast carries an action ("Get set up →"); the watch
  // toasts below clear it when they take over.
  const [toastAction, setToastAction] = useState<{ href: string; label: string } | null>(null);
  // Kept around through the toast's own timeout so Toast's exit fade has
  // something to render for its last ~120ms instead of going blank.
  const lastToastRef = useRef<string | null>(null);
  if (toast) lastToastRef.current = toast;

  useEffect(() => {
    const welcome = searchParams?.get("welcome");
    if (!welcome || fired.current) return;
    fired.current = true;
    trackEvent("sign_up", { method: welcome });
    // The rest of this tab's session is the sign-up session: no Premium
    // slide-in until the next visit (lib/signup-session.ts).
    markSignupSession();
    // RETURNED TO THEIR PAGE, NOT THE DASHBOARD (2026-09-29): a new account
    // that signed up from a page goes back to it, which is right, but used to
    // get no sign that anything had changed. One quiet toast says the account
    // is ready and points at the setup checklist, without pulling them off
    // what they were doing. On /dashboard the page itself says it.
    if (pathname !== "/dashboard") {
      setToast("Your free account is ready.");
      setToastAction({ href: "/dashboard", label: "Get set up →" });
      setTimeout(() => {
        setToast((t) => (t === "Your free account is ready." ? null : t));
      }, 8000);
    }
    // ?welcome= is set by the OAuth callback for a NEW account only, so this
    // is first-login-only by construction.
    trackSignupComplete(welcome);
    // A localStorage stamp, not a server field — /api/me has no createdAt.
    // This is the only code that knows a sign-in just created an account, so
    // it's the natural place to mark it; WelcomeChecklist (P6) reads this to
    // decide whether an account is "new enough" to still show onboarding.
    try {
      localStorage.setItem("rc_welcome_at", String(Date.now()));
    } catch {
      /* private mode — the checklist just never shows for this visitor */
    }
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
    // At the free watchlist limit the card is not added, and the toast says
    // so plainly (no upsell here: the upgrade panel belongs to the heart the
    // member taps next, lib/free-limits.ts).
    const onLimit = (l: { limit: number }) => {
      setToastAction(null);
      setToast(`That card wasn't added — your watchlist is at the free limit of ${l.limit} cards.`);
      setTimeout(() => setToast(null), 6000);
    };
    void watch(pending.cardId, pending.market as Country, { onLimit }).then((ok) => {
      if (ok) {
        setToastAction(null);
        setToast("Watching that card ✓ — it's on your watchlist");
        setTimeout(() => setToast(null), 5000);
      }
    });
  }, [loaded, user, watch]);

  return (
    <Toast
      open={!!toast}
      message={lastToastRef.current}
      action={
        toastAction ? (
          <Link
            href={toastAction.href}
            onClick={() => setToast(null)}
            className="shrink-0 whitespace-nowrap text-sm font-semibold text-brand-300 underline-offset-2 hover:underline"
          >
            {toastAction.label}
          </Link>
        ) : undefined
      }
    />
  );
}

export function SignupWelcome() {
  return (
    <Suspense fallback={null}>
      <SignupWelcomeInner />
    </Suspense>
  );
}
