"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getWishlist } from "@/lib/wishlist-client";
import { useCountry } from "./CountryProvider";

// Where we remember the visitor's email so a second wishlist heart doesn't
// re-prompt — it silently extends their existing watch instead.
const EMAIL_KEY = "rc_alert_email";

// Fired by WishlistButton when a card is ADDED to the wishlist. detail.cardId is
// the card just added (used only for nicer copy; we subscribe the whole wishlist).
export interface PriceAlertPromptDetail {
  cardId: string;
}

type Phase = "form" | "success" | "error";

// A global, single-instance modal that turns "added to wishlist" into an opt-in
// for price-drop emails. Mounted once in the root layout (inside CountryProvider).
export function PriceAlertModal() {
  const { country } = useCountry();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [watching, setWatching] = useState(0);
  // Lightweight toast for the silent (already-subscribed) path.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Subscribe the visitor's whole wishlist for the active market.
  const subscribe = useCallback(
    async (addr: string): Promise<{ ok: boolean; watching?: number }> => {
      const cardIds = getWishlist();
      if (cardIds.length === 0) return { ok: false };
      try {
        const res = await fetch("/api/alerts/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: addr, cardIds, market: country }),
        });
        if (!res.ok) return { ok: false };
        const data = await res.json();
        return { ok: true, watching: data.watching };
      } catch {
        return { ok: false };
      }
    },
    [country]
  );

  // React to wishlist additions.
  useEffect(() => {
    const handler = () => {
      const saved = typeof localStorage !== "undefined" ? localStorage.getItem(EMAIL_KEY) : null;
      if (saved) {
        // Returning subscriber — extend their watch quietly, no modal.
        void subscribe(saved).then((r) => {
          if (r.ok) flashToast("Added to your price-drop alerts ✓");
        });
        return;
      }
      // First time — ask for an email.
      setPhase("form");
      setEmail("");
      setOpen(true);
    };
    window.addEventListener("price-alert-prompt", handler as EventListener);
    return () => window.removeEventListener("price-alert-prompt", handler as EventListener);
  }, [subscribe, flashToast]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setSubmitting(true);
    const r = await subscribe(addr);
    setSubmitting(false);
    if (r.ok) {
      try {
        localStorage.setItem(EMAIL_KEY, addr.toLowerCase());
      } catch {
        /* private mode — fine, we just re-prompt next time */
      }
      setWatching(r.watching ?? getWishlist().length);
      setPhase("success");
    } else {
      setPhase("error");
    }
  }

  return (
    <>
      {/* Toast (silent path) */}
      {toast && (
        <div className="fixed inset-x-0 bottom-4 z-[80] flex justify-center px-4">
          <div className="rounded-xl border border-brand-500/40 bg-ink-900/95 px-4 py-2.5 text-sm font-medium text-slate-100 shadow-2xl">
            {toast}
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-ink-800 hover:text-slate-200"
            >
              ✕
            </button>

            {phase === "form" && (
              <form onSubmit={onSubmit} className="p-6">
                <div className="mb-1 flex items-center gap-2 text-gold">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <path d="M12 21s-7.5-4.6-10-9.2C.4 8.4 2 5 5.2 5c1.9 0 3.2 1 3.8 2.2C9.6 6 11 5 12.8 5 16 5 17.6 8.4 16 11.8 13.5 16.4 12 21 12 21z" />
                  </svg>
                  <span className="text-xs font-semibold uppercase tracking-wide">Added to wishlist</span>
                </div>
                <h2 className="font-display text-xl font-bold text-white">Get price-drop emails</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  We&apos;ll watch your wishlist and email you the moment any card gets cheaper. No account
                  needed — just an email. Unsubscribe anytime.
                </p>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input mt-4"
                />
                <button type="submit" disabled={submitting} className="btn-primary mt-3 w-full">
                  {submitting ? "Subscribing…" : "Notify me of price drops"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-300"
                >
                  No thanks
                </button>
              </form>
            )}

            {phase === "success" && (
              <div className="p-6 text-center">
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-500/15 text-brand-400">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="font-display text-xl font-bold text-white">You&apos;re all set</h2>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-300">
                  We&apos;re watching {watching === 1 ? "1 card" : `${watching} cards`} on your wishlist. We&apos;ll
                  email you whenever a price drops. Check your inbox for a confirmation.
                </p>
                <button onClick={() => setOpen(false)} className="btn-primary mt-4 w-full">
                  Done
                </button>
              </div>
            )}

            {phase === "error" && (
              <div className="p-6 text-center">
                <h2 className="font-display text-xl font-bold text-white">Something went wrong</h2>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-300">
                  We couldn&apos;t set up your alerts just now. Please try again in a moment.
                </p>
                <button onClick={() => setPhase("form")} className="btn-primary mt-4 w-full">
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
