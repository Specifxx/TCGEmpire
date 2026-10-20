"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { recallPremiumSurface } from "@/lib/premium-surface";
import { PREMIUM_COPY_VERSION, type PremiumTierKey } from "@/lib/site";

// Straight to Stripe without an account (2026-10-20, lib/guest-checkout.ts):
// Stripe collects the email, the webhook ties the subscription to that email's
// account, and the welcome page asks them to sign in with it afterwards.
export function GuestCheckoutButton({
  tier,
  plan,
  back,
  className,
  children,
  source = "premium-start",
}: {
  tier: PremiumTierKey;
  plan: "monthly" | "annual";
  back?: string | null;
  className: string;
  children: React.ReactNode;
  source?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    trackEvent("premium_checkout_started", { plan, tier, guest: true, source, copy: PREMIUM_COPY_VERSION });
    try {
      const res = await fetch("/api/premium/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, tier, back, surface: recallPremiumSurface() }),
      });
      const d = await res.json();
      if (!res.ok || !d.url) {
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
  return (
    <div className="w-full">
      <button type="button" onClick={go} disabled={busy} className={className}>
        {busy ? "Opening checkout…" : children}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}
