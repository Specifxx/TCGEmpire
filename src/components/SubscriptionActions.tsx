"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { invalidateMe } from "@/lib/use-me";
import { ManageSubscriptionButton } from "./ManageSubscriptionButton";
import {
  TIER_NAMES,
  tierMonthlyAmount,
  tierAnnualAmount,
  annualSavingPct,
  PREMIUM_PRICE_PERIOD,
  type PremiumTierKey,
} from "@/lib/site";

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
  canManageBilling,
}: {
  tier: PremiumTierKey;
  interval: "month" | "year" | null;
  plusLive: boolean;
  annualAvailable: boolean;
  canManageBilling: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "upgrade" | "downgrade" | "annual">(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "upgrade" | "downgrade" | "annual", path: string) {
    setBusy(kind);
    setError(null);
    trackEvent("subscription_change_started", { kind, from_tier: tier, source: "premium-page" });
    try {
      const res = await fetch(path, { method: "POST" });
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

  const canUpgrade = plusLive && tier === "plus";
  const canDowngrade = plusLive && tier === "premium";
  const canGoAnnual = annualAvailable && interval === "month";
  const savePct = annualSavingPct(tier);

  return (
    <div className="mt-4 border-t border-ink-800 pt-3">
      <div className="flex flex-col gap-2">
        {canUpgrade && (
          <div>
            <button
              onClick={() => act("upgrade", "/api/premium/upgrade")}
              disabled={busy !== null}
              className="btn-primary w-full py-2 text-xs"
            >
              {busy === "upgrade" ? "Upgrading…" : `Upgrade to Premium — ${tierMonthlyAmount("premium")}/${PREMIUM_PRICE_PERIOD}`}
            </button>
            <p className="mt-1 text-[11px] text-slate-500">
              Billed the difference for the rest of this period; the pro tools unlock straight away.
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
              {busy === "downgrade" ? "Switching…" : `Switch down to Plus — ${tierMonthlyAmount("plus")}/${PREMIUM_PRICE_PERIOD}`}
            </button>
            <p className="mt-1 text-[11px] text-slate-500">
              Takes effect now. The unused part of this period is credited against your next invoice, and the four pro
              tools lock.
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
