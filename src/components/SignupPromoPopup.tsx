"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/use-me";
import { AuthForm } from "./AuthForm";

// Shown at most ONCE ever per browser (localStorage, mirrors PriceAlertModal's
// convention) — dismissing or signing up both suppress it for good. Never shown
// signed in, never shown on the auth pages themselves, and never shown unless the
// promo API confirms real slots remain (never a stale/fabricated count).
const SEEN_KEY = "rc_signup_promo_seen";
const SHOW_DELAY_MS = 12_000; // let a new visitor look around before pitching anything
const SKIP_PATHS = ["/login", "/register", "/forgot", "/reset", "/verify"];

interface PromoStatus {
  active: boolean;
  remaining: number;
  months: number;
}

export function SignupPromoPopup({ providers }: { providers: ("google" | "discord")[] }) {
  const { user, loaded } = useMe();
  const pathname = usePathname();
  const [promo, setPromo] = useState<PromoStatus | null>(null);
  const [phase, setPhase] = useState<"hidden" | "offer" | "form">("hidden");

  // Real, day-cached slot count from the server — never guessed client-side.
  useEffect(() => {
    if (!loaded || user) return;
    fetch("/api/promo/early-adopter")
      .then((r) => r.json())
      .then((d: PromoStatus) => setPromo(d))
      .catch(() => setPromo(null));
  }, [loaded, user]);

  // Auto-show once, after a delay — only for a signed-out visitor, off the auth
  // pages, with a genuinely active promo and slots remaining.
  useEffect(() => {
    if (!loaded || user || !promo?.active) return;
    if (SKIP_PATHS.some((p) => pathname?.startsWith(p))) return;
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* private mode — worst case it can show once more next session */
    }
    if (seen) return;
    const t = setTimeout(() => setPhase("offer"), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [loaded, user, promo, pathname]);

  function dismiss() {
    setPhase("hidden");
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
  }

  if (phase === "hidden" || !promo?.active) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={dismiss} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full bg-ink-950/60 text-slate-400 hover:bg-ink-800 hover:text-slate-200"
        >
          ✕
        </button>

        {phase === "offer" && (
          <div className="p-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-gold/15 text-gold">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                <path d="M12 2l2.9 6.6L22 9.3l-5 4.9 1.2 7-6.2-3.4L5.8 21.2 7 14.2l-5-4.9 7.1-.7z" />
              </svg>
            </div>
            <span className="chip bg-brand-500/15 text-[10px] font-bold uppercase tracking-wide text-brand-300">
              {promo.remaining} of 100 early-adopter spots left
            </span>
            <h2 className="font-display mt-2 text-xl font-bold text-white">
              Get {promo.months} {promo.months === 1 ? "month" : "months"} of Premium free
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-300">
              Create a free account now and we&apos;ll comp your first {promo.months === 1 ? "month" : `${promo.months} months`} of
              Premium — no card required. Only our first 100 members get this.
            </p>
            <button onClick={() => setPhase("form")} className="btn-primary mt-4 w-full">
              Create free account →
            </button>
            <button onClick={dismiss} className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-300">
              Maybe later
            </button>
          </div>
        )}

        {phase === "form" && (
          <div className="p-6">
            <AuthForm mode="register" providers={providers} bare />
          </div>
        )}
      </div>
    </div>
  );
}
