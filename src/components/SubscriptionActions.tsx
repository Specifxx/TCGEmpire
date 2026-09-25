"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { invalidateMe } from "@/lib/use-me";
import { ManageSubscriptionButton } from "./ManageSubscriptionButton";
import {
  TIER_NAMES,
  tierAnnualAmount,
  annualSavingPct,
  type PremiumTierKey,
} from "@/lib/site";
import { planSwitchPriceLabel } from "@/lib/plan-switch-price";
import { PLUS_TARGET_ALERT_LIMIT } from "@/lib/alert-limits";

// Everything a subscriber can DO to their own plan, in one place on /premium:
// move up a tier, move down a tier, move to annual billing, or open Stripe's
// portal to change the card / cancel. Replaced UpgradeTierButton, which only
// covered the first of those.
//
// Each button states what happens to the money BEFORE it's pressed, because
// the three actions genuinely differ and "what about the rest of the period I
// already paid for" is the question each one has to answer:
//   • upgrade   → billed the prorated difference now, tools unlock now
//   • downgrade → credited for the unused part, applied to the next invoice
//   • annual    → billed the year now, credited for the rest of this month
// The wording here is the display half of the three routes' own proration
// choices; changing one without the other would make this card lie.
export function SubscriptionActions({
  tier,
  interval,
  plusLive,
  annualAvailable,
  targetAnnualAvailable = true,
  canManageBilling,
  trialing = false,
  keep = null,
  highlightKeep = false,
}: {
  tier: PremiumTierKey;
  interval: "month" | "year" | null;
  plusLive: boolean;
  annualAvailable: boolean;
  /** The OTHER tier (the one a switch moves to) has its own annual price. The
   *  switch routes keep the subscriber's interval, falling back to monthly
   *  when it doesn't — the quoted price must follow the same rule. */
  targetAnnualAvailable?: boolean;
  canManageBilling: boolean;
  /** In a free trial: the plan-change routes only handle paid subscriptions. */
  trialing?: boolean;
  /** Set when the subscription is due to END: what keeping it charges, and from when. */
  keep?: { line: string; from: string } | null;
  /** Arrived from the trial-ending email's ?keep=1 link. */
  highlightKeep?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "upgrade" | "downgrade" | "annual" | "resume">(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "upgrade" | "downgrade" | "annual" | "resume", path: string) {
    setBusy(kind);
    setError(null);
    trackEvent("subscription_change_started", { kind, from_tier: tier, source: "premium-page" });
    try {
      const res = await fetch(path, {
        method: "POST",
        // Which door the keep came through, for the trial-cancel report.
        ...(kind === "resume"
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: highlightKeep ? "email" : "card" }) }
          : {}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Couldn't change your plan — try again");
        setBusy(null);
        return;
      }
      trackEvent("subscription_change_success", { kind, from_tier: tier });
      invalidateMe(); // entitlement/tier changed — next /api/me reflects it
      router.refresh(); // re-render this server page with the new plan
    } catch {
      setError("Network error — try again");
      setBusy(null);
    }
  }

  // Plan switches are for PAID subscriptions: the three routes select an
  // active subscription, so during a free trial each button answered with a
  // 400 and "Cancel" was the only control that worked (2026-09-24). A trialist
  // changes plan in the portal-free way — keep or let the trial end — until a
  // mid-trial switch has been verified against Stripe on a test clock.
  const canUpgrade = plusLive && tier === "plus" && !trialing && !keep;
  const canDowngrade = plusLive && tier === "premium" && !trialing && !keep;
  const canGoAnnual = annualAvailable && interval === "month" && !trialing && !keep;
  const savePct = annualSavingPct(tier);

  return (
    <div className="mt-4 border-t border-ink-800 pt-3">
      <div className="flex flex-col gap-2">
        {/* KEEP (2026-09-24). A subscription set to end — most often a trial
            whose renewal was switched off in its first hour, "to be safe" —
            had no way back on in the app. One POST, from its owner, clears the
            cancellation; nothing is charged until the date shown. The plain
            "do nothing" line is deliberate: letting it end is a real choice. */}
        {keep && (
          <div
            id="keep"
            className={`rounded-lg p-2 ${highlightKeep ? "ring-2 ring-brand-500/60" : ""}`}
            data-keep-offer
          >
            <button
              onClick={() => act("resume", "/api/premium/resume")}
              disabled={busy !== null}
              className="btn-primary w-full py-2 text-xs"
            >
              {busy === "resume" ? "Keeping…" : `Keep ${TIER_NAMES[tier]} — ${keep.line} from ${keep.from}`}
            </button>
            <p className="mt-1 text-[11px] text-slate-500">
              Nothing is charged before {keep.from}. Or do nothing and it simply ends then.
            </p>
          </div>
        )}
        {canUpgrade && (
          <div>
            <button
              onClick={() => act("upgrade", "/api/premium/upgrade")}
              disabled={busy !== null}
              className="btn-primary w-full py-2 text-xs"
            >
              {busy === "upgrade" ? "Upgrading…" : `Upgrade to Premium — ${planSwitchPriceLabel("premium", interval, targetAnnualAvailable)}`}
            </button>
            <p className="mt-1 text-[11px] text-slate-500">
              Billed the difference for the rest of this period; Best Basket&apos;s store-by-store plan, Buy this list
              and Demand Finder unlock straight away.
            </p>
          </div>
        )}

        {canGoAnnual && (
          <div>
            <button
              onClick={() => act("annual", "/api/premium/switch-to-annual")}
              disabled={busy !== null}
              className={`${canUpgrade ? "btn-ghost" : "btn-primary"} w-full py-2 text-xs`}
            >
              {busy === "annual"
                ? "Switching…"
                : `Switch to annual — ${tierAnnualAmount(tier)}/yr${savePct > 0 ? ` (save ${savePct}%)` : ""}`}
            </button>
            <p className="mt-1 text-[11px] text-slate-500">
              Billed for the year now, with credit for the rest of this month.
            </p>
          </div>
        )}

        {canDowngrade && (
          <div>
            <button
              onClick={() => act("downgrade", "/api/premium/downgrade")}
              disabled={busy !== null}
              className="btn-ghost w-full py-2 text-xs"
            >
              {busy === "downgrade" ? "Switching…" : `Switch down to Plus — ${planSwitchPriceLabel("plus", interval, targetAnnualAvailable)}`}
            </button>
            <p className="mt-1 text-[11px] text-slate-500">
              Takes effect now. The unused part of this period is credited against your next invoice; Best
              Basket&apos;s store-by-store plan, Buy this list and Demand Finder lock, and target alerts go back to{" "}
              {PLUS_TARGET_ALERT_LIMIT} cards. Plus stays ad-free.
            </p>
          </div>
        )}

        {canManageBilling && (
          <div className="pt-1">
            <ManageSubscriptionButton />
            <p className="mt-1 text-[11px] text-slate-500">Change your card, see invoices, or cancel.</p>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-400">
          {error}
        </p>
      )}
      <p className="mt-2 text-[11px] text-slate-600">
        You&apos;re on {TIER_NAMES[tier]}
        {interval ? `, billed ${interval === "year" ? "yearly" : "monthly"}` : ""}.
      </p>
    </div>
  );
}
