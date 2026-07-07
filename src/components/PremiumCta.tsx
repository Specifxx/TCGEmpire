"use client";

import Link from "next/link";
import { useState } from "react";

// Gold (not green) — the professional "premium" accent used across the Premium UI.
const GOLD_BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-ink-950 transition hover:brightness-110";

// The Premium subscribe button. Three states: checkout live (Stripe hosted
// checkout), signed out (route through login first), or checkout not yet
// configured (honest waitlist CTA via the contact form — no fake buy button).
export function PremiumCta({
  checkoutLive,
  signedIn,
  trialEligible = false,
  priceLabel = "",
}: {
  checkoutLive: boolean;
  signedIn: boolean;
  trialEligible?: boolean;
  priceLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/premium/checkout", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Couldn't start checkout");
        return;
      }
      window.location.href = d.url;
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <div>
        <p className="text-sm font-semibold text-white">Ready when you are</p>
        <Link href="/register?next=/premium" className="btn-primary mt-3 text-sm">Create a free account first →</Link>
      </div>
    );
  }
  if (!checkoutLive) {
    return (
      <div>
        <p className="text-sm font-semibold text-white">Launching very soon</p>
        <p className="mt-1 text-xs text-slate-400">Want early access? Say hi and you&apos;re on the list.</p>
        <Link href="/contact" className="btn-ghost mt-3 text-sm">Join the waitlist →</Link>
      </div>
    );
  }
  return (
    <div>
      <button onClick={subscribe} disabled={busy} className={`${GOLD_BTN} disabled:opacity-50`}>
        {busy ? "Opening checkout…" : trialEligible ? "Start 1-day free trial →" : "Upgrade to Premium →"}
      </button>
      {trialEligible && (
        // Required disclosure for a card-gated trial (Stripe / card-network rules):
        // state the auto-charge and the cancel path up front.
        <p className="mt-2 text-[11px] leading-snug text-slate-400">
          Card required. Free for 24 hours, then {priceLabel ? `${priceLabel} ` : "billed monthly "}
          — cancel anytime before it ends and you won&apos;t be charged.
        </p>
      )}
      {error && (
        <div role="alert" className="mt-2 text-xs">
          <p className="text-rose-400">{error}</p>
          {/* Recovery path — a failed checkout must never be a dead end. */}
          <p className="mt-1 text-slate-400">
            <button onClick={subscribe} className="text-brand-400 hover:underline">Try again</button>
            {" · or "}
            <Link href="/contact" className="text-brand-400 hover:underline">join the waitlist</Link>
            {" and we'll email you when it's sorted."}
          </p>
        </div>
      )}
    </div>
  );
}
