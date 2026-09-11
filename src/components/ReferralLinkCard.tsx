"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { useMe } from "@/lib/use-me";
import { TIER_NAMES } from "@/lib/site";

// The referral program's first-ever UI. The server side has been complete for
// a while — ReferralCapture writes the ?ref= cookie on any landing, and
// applyReferral grants the referrer REFERRAL_PREMIUM_DAYS when the referred
// visitor creates an account — but nothing anywhere generated or showed a
// member their link, so the channel sat at exactly zero. This card turns every
// existing member into a free-account acquisition channel; the reward costs
// Premium time, not cash, and the *referred* user is precisely the free
// signup the growth plan is after.
//
// Server component parent (profile/page.tsx) passes the fully-built URL and
// the days figure and hides the card entirely when the program is off
// (REFERRAL_PREMIUM_DAYS=0) — this client half only handles the copy button.
export function ReferralLinkCard({ url, days }: { url: string; days: number }) {
  const [copied, setCopied] = useState(false);
  // applyReferral extends the referrer's existing plan at its own tier rather
  // than upgrading it, so this has to name the tier they're actually on — a
  // Plus member earning "days of Premium" would never get the pro tools.
  const { tier } = useMe();
  const rewardName = TIER_NAMES[tier ?? "premium"];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      trackEvent("referral_link_copied");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked — the input below is selectable by hand */
    }
  }

  return (
    <div className="card-surface mt-5 p-5">
      <h2 className="font-bold text-white">Invite a friend</h2>
      <p className="mt-1 text-sm text-slate-400">
        Share your link — you get{" "}
        <span className="font-semibold text-gold">
          {days === 1 ? "1 day" : `${days} days`} of {rewardName}
        </span>{" "}
        for every friend who creates a free account.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="input flex-1 text-xs"
          aria-label="Your referral link"
        />
        <button type="button" onClick={copy} className="btn-primary shrink-0 text-sm">
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
