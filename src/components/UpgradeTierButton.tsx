"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { invalidateMe } from "@/lib/use-me";
import { PREMIUM_PRICE_LABEL } from "@/lib/site";

// One-click "switch my Plus subscription to Premium" — same interval, billed
// the prorated difference now (see api/premium/upgrade/route.ts, the same
// shape as switch-to-annual's own one-click flow). Rendered only on /premium's
// "Your subscription" card, only for a live Plus subscriber with Premium
// actually configured — see that card's own gate.
export function UpgradeTierButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upgrade() {
    setBusy(true);
    setError(null);
    trackEvent("premium_tier_upgrade_started", { source: "premium-page" });
    try {
      const res = await fetch("/api/premium/upgrade", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Couldn't upgrade — try again");
        setBusy(false);
        return;
      }
      trackEvent("premium_tier_upgrade_success", { source: "premium-page" });
      invalidateMe(); // entitlement/tier changed — next /api/me reflects it
      router.refresh(); // re-render this server page with the new tier
    } catch {
      setError("Network error — try again");
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={upgrade} disabled={busy} className="btn-primary w-full py-2 text-xs">
        {busy ? "Upgrading…" : `Upgrade to Premium — ${PREMIUM_PRICE_LABEL} →`}
      </button>
      {error && <p role="alert" className="mt-1.5 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
