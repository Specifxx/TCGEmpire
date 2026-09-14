"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { PREMIUM_COPY_VERSION, TIER_NAMES, type PremiumTierKey } from "@/lib/site";
import type { StartSrc } from "@/lib/premium-start";

// The last step of /premium/start for a SIGNED-IN visitor: open Stripe.
//
// WHY A CLIENT COMPONENT AND NOT A SERVER-SIDE redirect(): creating the Stripe
// session in the page's server render would be a SECOND checkout implementation
// living next to api/premium/checkout — which also writes the
// PremiumClick{source:"checkout"} interest row, applies the one-trial-per-
// account gate and stamps the metadata the webhook maps back to a user. One
// implementation, called from here. Two further things only work in the browser:
// premium_checkout_started (the funnel step between "clicked Premium" and
// "subscribed") fires here BEFORE the fetch, and SignupWelcome — mounted in the
// root layout — gets its chance to fire sign_up off ?welcome= for an account
// created seconds ago on the way in.
export function CheckoutLauncher({
  tier,
  plan,
  back,
  src,
  trialEligible,
}: {
  tier: PremiumTierKey;
  plan: "monthly" | "annual";
  back: string | null;
  src: StartSrc;
  trialEligible: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  // ONE checkout session per mount. SignupWelcome strips ?welcome= with
  // router.replace the moment a brand-new account lands here, which re-renders
  // this page with identical props — without the guard that second render would
  // open a second Stripe session and write a second PremiumClick row.
  const launched = useRef(false);

  const launch = useCallback(async () => {
    setBusy(true);
    setError(null);
    // Fired BEFORE the fetch, same order as PremiumCta/PremiumDialog (and pinned
    // there). `source` stays the surface the visitor actually came from so the
    // existing GA4 series keeps its meaning; `via` separates this new path.
    trackEvent("premium_checkout_started", {
      plan,
      tier,
      trial_eligible: trialEligible,
      source: src,
      via: "start",
      copy: PREMIUM_COPY_VERSION,
    });
    try {
      const res = await fetch("/api/premium/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, plan, back }),
      });
      const d = await res.json().catch(() => ({}));
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
  }, [tier, plan, back, src, trialEligible]);

  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    void launch();
  }, [launch]);

  return (
    <div className="mx-auto w-full max-w-sm py-10 text-center">
      <p className="text-sm font-semibold text-white">
        {busy ? "Opening secure checkout…" : `Continue to ${TIER_NAMES[tier]} checkout`}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        You&apos;ll finish on Stripe&apos;s secure payment page. We never see your card details.
      </p>

      {/* Always rendered, never only-on-error: an auto-redirect that a popup
          blocker, a slow network or a back-button return has swallowed leaves
          an otherwise blank screen with nothing to press. */}
      <button onClick={() => void launch()} disabled={busy} className="btn-primary mt-4 w-full py-3 text-center text-base">
        {busy ? "Opening checkout…" : "Continue to checkout →"}
      </button>

      {error && (
        <div role="alert" className="mt-3 text-xs">
          <p className="text-rose-400">{error}</p>
          {/* A failed checkout must never be a dead end — same recovery pair as
              PremiumCta's own error state. */}
          <p className="mt-1 text-slate-400">
            <button onClick={() => void launch()} className="text-brand-400 hover:underline">Try again</button>
            {" · or "}
            <Link href="/contact" className="text-brand-400 hover:underline">join the waitlist</Link>
            {" and we'll email you when it's sorted."}
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        <Link href={back ?? "/premium"} className="hover:text-white hover:underline">← Back</Link>
      </p>
    </div>
  );
}
