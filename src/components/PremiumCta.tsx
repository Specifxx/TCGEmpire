"use client";

import Link from "next/link";
import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { PREMIUM_COPY_VERSION, TIER_NAMES, type PremiumTierKey } from "@/lib/site";

// GREEN, NOT GOLD, AND BIG — on this page only (2026-09-10, owner brief: "it
// should just be a big green button... I'm just gonna click that shit without
// reading"). The button's WORDING moved on 2026-09-11 — see DECISIONS.md —
// from "Start your N-day free trial" to a plain "Get Plus"/"Get Premium",
// after copying the pricing-page pattern at mtgstocks.com/go-premium: name
// the tier, not the trial; disclose the trial as small print underneath
// instead of the headline claim. The colour choice below is unaffected.
//
// This is a deliberate, scoped exception to the gold-for-Premium convention,
// not drift. Gold is this site's Premium IDENTITY — the badges, the "Best
// value" ribbon, the nav link, the dialog's own buttons all keep it. But green
// (brand-500) is the site's single primary-ACTION accent, the same one every
// other "do the thing" button on the site uses, so it reads as "go" in a way
// gold never did. This component renders only on /premium, so the split is
// exactly one page deep. PremiumDialog.tsx and PremiumButton.tsx are untouched
// and still gold — see the dialog's own header on why its panel stays "not the
// green bubble look".
//
// btn-primary already carries the tap-target floor and the hover; the extra
// utilities make it full-bleed and a size up. Tailwind's utilities layer
// outranks the @layer components defaults, so these win over .btn's px/py/text.
// text-center + leading-tight because this label wraps to two lines in the
// narrower of the two pricing cards; without them the second line sits badly.
const CTA_BTN = "btn-primary w-full py-3.5 text-center text-base leading-tight";

// The Premium subscribe button. Three states: checkout live (Stripe hosted
// checkout), signed out (route through login first), or checkout not yet
// configured (honest waitlist CTA via the contact form — no fake buy button).
export function PremiumCta({
  checkoutLive,
  signedIn,
  trialEligible = false,
  trialAvailable = false,
  priceLabel = "",
  trialDays = 0,
  plan = "monthly",
  tier = "premium",
  ctaLabel,
}: {
  checkoutLive: boolean;
  signedIn: boolean;
  trialEligible?: boolean;
  // Signed-out visitors have, by definition, never started a trial — see
  // /premium's own trialAvailable for why this is a separate flag from
  // trialEligible (which needs a signed-in user to check their history).
  trialAvailable?: boolean;
  priceLabel?: string;
  trialDays?: number;
  plan?: "monthly" | "annual";
  // Which tier this card is selling — defaults to "premium" so every caller
  // predating the tier split (there was only one tier) is unchanged.
  tier?: PremiumTierKey;
  ctaLabel?: string;
}) {
  const dayPhrase = `${trialDays} day${trialDays === 1 ? "" : "s"}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subscribe() {
    setBusy(true);
    setError(null);
    // Fired BEFORE the fetch — a low-volume conversion-funnel step, so it goes
    // to both GA4 and Vercel (not added to GA4_ONLY_EVENTS), unlike the
    // high-volume impression events elsewhere in the Premium funnel.
    trackEvent("premium_checkout_started", { plan, tier, trial_eligible: trialEligible, source: "premium-page", copy: PREMIUM_COPY_VERSION });
    try {
      const res = await fetch("/api/premium/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, tier }),
      });
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
    if (trialAvailable && trialDays > 0) {
      // The button names the TIER, not the trial (2026-09-11 — see this
      // file's own header and DECISIONS.md: leading with "$0"/"start your
      // trial" tested worse than a plain price-led card). The trial is real
      // and still disclosed — the small print below still states it, the card
      // requirement, and when it converts — it just isn't the headline claim.
      return (
        <div className="w-full">
          <Link href="/login?next=/premium" className={CTA_BTN}>
            Get {TIER_NAMES[tier]}&nbsp;→
          </Link>
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            Create a free account first — free, no card needed. A card is required to start the {dayPhrase}{" "}
            free trial; it becomes {priceLabel ? `${priceLabel} ` : "the paid price "}after that unless you cancel.
          </p>
        </div>
      );
    }
    return (
      <div className="w-full">
        <p className="text-sm font-semibold text-white">Ready when you are</p>
        <Link href="/login?next=/premium" className={`${CTA_BTN} mt-3`}>Sign in first →</Link>
      </div>
    );
  }
  if (!checkoutLive) {
    return (
      <div className="w-full">
        <p className="text-sm font-semibold text-white">Launching very soon</p>
        <p className="mt-1 text-xs text-slate-400">Want early access? Say hi and you&apos;re on the list.</p>
        <Link href="/contact" className="btn-ghost mt-3 w-full text-sm">Join the waitlist →</Link>
      </div>
    );
  }
  return (
    <div className="w-full">
      <button onClick={subscribe} disabled={busy} className={CTA_BTN}>
        {busy ? "Opening checkout…" : ctaLabel ?? `Get ${TIER_NAMES[tier]} →`}
      </button>
      {trialEligible && (
        // Required disclosure for a card-gated trial (Stripe / card-network rules):
        // state the auto-charge and the cancel path up front.
        <p className="mt-2 text-[11px] leading-snug text-slate-400">
          Card required. Free for {dayPhrase}, then {priceLabel ? `${priceLabel} ` : "billed monthly "}
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
