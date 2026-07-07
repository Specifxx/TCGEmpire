"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/use-me";
import { PREMIUM_PRICE_LABEL, PREMIUM_PRICE_AMOUNT, PREMIUM_PRICE_PERIOD } from "@/lib/site";

// A site-wide Premium upsell dialog so users can subscribe / start the trial from
// wherever they hit a wall — no navigating to /premium first. Any client component
// can trigger it via usePremiumDialog().open(). Styled as a compact market-terminal
// panel (ink surfaces, gold accent, monospace figures) — deliberately not the green
// "bubble" look.
const PremiumDialogContext = createContext<{ open: () => void }>({ open: () => {} });
export function usePremiumDialog() {
  return useContext(PremiumDialogContext);
}

const FEATURES: { k: string; v: string }[] = [
  { k: "Best-Basket optimiser", v: "cheapest multi-store cart" },
  { k: "Value Finder", v: "undervalued-card screener" },
  { k: "Arbitrage finder", v: "full flips & deals list" },
  { k: "Ad-free", v: "no ads on any page" },
];

const GOLD_BTN =
  "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-ink-950 transition hover:brightness-110 disabled:opacity-50";

export function PremiumDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  return (
    <PremiumDialogContext.Provider value={{ open }}>
      {children}
      {isOpen && <PremiumDialog onClose={close} />}
    </PremiumDialogContext.Provider>
  );
}

function PremiumDialog({ onClose }: { onClose: () => void }) {
  const { user, premium, premiumCheckout, trialEligible, loaded } = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/premium/checkout", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Couldn't start checkout");
        setBusy(false);
        return;
      }
      window.location.href = d.url;
    } catch {
      setError("Network error — try again");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="RiftCompare Premium">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
        {/* Terminal-style header bar */}
        <div className="flex items-center justify-between border-b border-ink-700 bg-ink-950/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">RiftCompare</span>
            <span className="rounded border border-gold/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
              Premium
            </span>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-500 transition hover:text-white">✕</button>
        </div>

        <div className="px-5 py-5">
          <h2 className="text-lg font-extrabold text-white">Power tools for buyers &amp; flippers</h2>
          <p className="mt-1 text-sm text-slate-400">
            Unlock the pro screeners and go ad-free. The portfolio tracker and price comparison stay free.
          </p>

          <ul className="mt-4 divide-y divide-ink-800 border-y border-ink-800">
            {FEATURES.map((f) => (
              <li key={f.k} className="flex items-center gap-3 py-2.5">
                <span className="text-gold" aria-hidden>▸</span>
                <span className="text-sm font-semibold text-white">{f.k}</span>
                <span className="ml-auto text-right text-xs text-slate-500">{f.v}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5">
            {!loaded ? (
              <div className="h-11 animate-pulse rounded-lg bg-ink-800" />
            ) : premium ? (
              <div className="text-center">
                <p className="text-sm font-semibold text-gold">✓ You&apos;re Premium</p>
                <Link href="/portfolio" onClick={onClose} className="btn-ghost mt-2 text-sm">Go to your tools →</Link>
              </div>
            ) : !user ? (
              <Link href="/register?next=/premium" onClick={onClose} className={GOLD_BTN}>
                Create a free account to start →
              </Link>
            ) : !premiumCheckout ? (
              <div className="text-center">
                <p className="text-sm text-slate-300">Premium is launching very soon.</p>
                <Link href="/contact" onClick={onClose} className="btn-ghost mt-2 text-sm">Join the waitlist</Link>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-baseline justify-center gap-1">
                  <span className="num text-3xl font-extrabold text-white">{PREMIUM_PRICE_AMOUNT}</span>
                  <span className="text-sm text-slate-400">/{PREMIUM_PRICE_PERIOD}</span>
                </div>
                <button onClick={checkout} disabled={busy} className={GOLD_BTN}>
                  {busy ? "Opening checkout…" : trialEligible ? "Start 1-day free trial →" : "Upgrade to Premium →"}
                </button>
                <p className="mt-2 text-center text-[11px] leading-snug text-slate-500">
                  {trialEligible ? (
                    <>Card required. Free for 24 hours, then {PREMIUM_PRICE_LABEL ? `${PREMIUM_PRICE_LABEL} ` : "billed monthly "}— cancel anytime.</>
                  ) : (
                    <>{PREMIUM_PRICE_LABEL ? `${PREMIUM_PRICE_LABEL} · ` : ""}cancel anytime.</>
                  )}
                </p>
                {error && <p role="alert" className="mt-2 text-center text-xs text-rose-400">{error}</p>}
              </>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-slate-600">
            <Link href="/premium" onClick={onClose} className="transition hover:text-slate-400 hover:underline">
              See full details →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
