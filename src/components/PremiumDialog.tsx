"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/use-me";
import { AnnualPriceBlock } from "./AnnualPriceBlock";
import { PREMIUM_PRICE_LABEL, PREMIUM_PRICE_AMOUNT, PREMIUM_PRICE_PERIOD, PREMIUM_ANNUAL_AMOUNT, annualSavingPct } from "@/lib/site";
import { MARKETPLACE_FEE_BPS, MARKETPLACE_PREMIUM_FEE_BPS } from "@/lib/marketplace-policy";

// A site-wide Premium upsell dialog so users can subscribe / start the trial from
// wherever they hit a wall — no navigating to /premium first. Any client component
// can trigger it via usePremiumDialog().open(). Styled as a compact market-terminal
// panel (ink surfaces, gold accent, monospace figures) — deliberately not the green
// "bubble" look.
const PremiumDialogContext = createContext<{ open: () => void }>({ open: () => {} });
export function usePremiumDialog() {
  return useContext(PremiumDialogContext);
}

// Premium-ONLY perks. Best Basket used to be listed here; it moved to the free
// account tier (see lib/premium.ts), so pitching it as a reason to pay would be
// selling something the reader already has.
const FEATURES: { k: string; v: string }[] = [
  { k: "Marketplace seller fee", v: `${MARKETPLACE_PREMIUM_FEE_BPS / 100}% instead of ${MARKETPLACE_FEE_BPS / 100}%` },
  { k: "Value Finder", v: "undervalued-card screener" },
  { k: "Rising Cards", v: "demand + price-timing screener" },
  { k: "Arbitrage finder", v: "full flips & deals list" },
  { k: "Ad-free", v: "no ads on any page" },
];

const GOLD_BTN =
  "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-ink-950 transition hover:brightness-110 disabled:opacity-50";

export function PremiumDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => {
    setIsOpen(true);
    // Fire-and-forget premium-interest beacon (who clicked Premium). keepalive so it
    // still sends if the click navigates away; failures are ignored.
    try {
      fetch("/api/premium/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "dialog" }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* never let the beacon break opening the dialog */
    }
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  return (
    <PremiumDialogContext.Provider value={{ open }}>
      {children}
      {isOpen && <PremiumDialog onClose={close} />}
    </PremiumDialogContext.Provider>
  );
}

function PremiumDialog({ onClose }: { onClose: () => void }) {
  const { user, premium, premiumCheckout, trialEligible, trialDays, premiumAnnual, loaded } = useMe();
  const dayPhrase = `${trialDays} day${trialDays === 1 ? "" : "s"}`;
  const savePct = annualSavingPct();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Default to the best-value plan when annual is offered; force monthly otherwise.
  const [plan, setPlan] = useState<"monthly" | "annual">("annual");
  const activePlan = premiumAnnual ? plan : "monthly";

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

  async function checkout(selected: "monthly" | "annual") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/premium/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selected }),
      });
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
                <Link href="/tools" onClick={onClose} className="btn-ghost mt-2 text-sm">Go to your tools →</Link>
              </div>
            ) : !user ? (
              <Link href="/login?next=/premium" onClick={onClose} className={GOLD_BTN}>
                Create a free account to start →
              </Link>
            ) : !premiumCheckout ? (
              <div className="text-center">
                <p className="text-sm text-slate-300">Premium is launching very soon.</p>
                <Link href="/contact" onClick={onClose} className="btn-ghost mt-2 text-sm">Join the waitlist</Link>
              </div>
            ) : (
              <>
                {/* Plan toggle (only when annual is configured) */}
                {premiumAnnual && (
                  <div className="mb-3 flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-950/50 p-1">
                    <button
                      onClick={() => setPlan("monthly")}
                      aria-pressed={activePlan === "monthly"}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${activePlan === "monthly" ? "bg-ink-800 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setPlan("annual")}
                      aria-pressed={activePlan === "annual"}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${activePlan === "annual" ? "bg-ink-800 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                      Annual{savePct > 0 && <span className="ml-1 text-[10px] font-extrabold text-brand-300">−{savePct}%</span>}
                    </button>
                  </div>
                )}

                {/* Price for the selected plan */}
                {activePlan === "annual" ? (
                  <div className="mb-3">
                    <AnnualPriceBlock size="sm" />
                  </div>
                ) : (
                  <div className="mb-3 flex items-baseline justify-center gap-1">
                    <span className="num text-3xl font-extrabold text-white">{PREMIUM_PRICE_AMOUNT}</span>
                    <span className="text-sm text-slate-400">/{PREMIUM_PRICE_PERIOD}</span>
                  </div>
                )}

                <button onClick={() => checkout(activePlan)} disabled={busy} className={GOLD_BTN}>
                  {busy
                    ? "Opening checkout…"
                    : trialEligible
                    ? `Start ${trialDays}-day free trial →`
                    : activePlan === "annual"
                    ? `Get annual — ${PREMIUM_ANNUAL_AMOUNT}/yr →`
                    : "Upgrade to Premium →"}
                </button>
                <p className="mt-2 text-center text-[11px] leading-snug text-slate-500">
                  {(() => {
                    const priceAfter = activePlan === "annual" ? `${PREMIUM_ANNUAL_AMOUNT}/yr` : PREMIUM_PRICE_LABEL || "billed monthly";
                    return trialEligible ? (
                      <>Card required. Free for {dayPhrase}, then {priceAfter} — cancel anytime.</>
                    ) : (
                      <>{priceAfter} · cancel anytime.</>
                    );
                  })()}
                </p>
                {error && <p role="alert" className="mt-2 text-center text-xs text-rose-400">{error}</p>}
              </>
            )}
          </div>

          {!premium && (
            <p className="mt-3 text-center text-[11px] font-medium text-gold/80">
              Subscribe now and lock in this price for good — it never rises while you stay subscribed.
            </p>
          )}
          <p className="mt-3 text-center text-xs text-slate-600">
            <Link href="/premium" onClick={onClose} className="transition hover:text-slate-400 hover:underline">
              See all plans &amp; details →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
