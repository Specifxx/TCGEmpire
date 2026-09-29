"use client";

import { useState } from "react";
import { useMe } from "@/lib/use-me";
import { useSealedWatches } from "@/lib/use-sealed-watches";
import { useCountryMaybe } from "./CountryProvider";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { PremiumButton } from "./PremiumButton";
import { SEALED_CHECK_CADENCE, SEALED_RRP_ONLY, SEALED_WATCH_LIMIT_PLUS } from "@/lib/alert-limits";

// "Watch this sealed product" (2026-09-29): a toggle for a Plus/Premium
// member — an email when it is back in stock after selling out everywhere,
// when a store has it at RRP, at the member's target, or on a material drop
// (lib/sealed-watch.ts). For everyone else the same spot sells Plus through
// the site-wide PremiumButton (surface gate:sealed-watch), with one honest
// line; never a popup of its own. `compact` is the /sealed tile's icon.
export function SealedWatchButton({
  groupKey,
  name,
  compact = false,
  className = "",
  market,
}: {
  groupKey: string;
  name: string;
  compact?: boolean;
  className?: string;
  /** The market the watch is for; defaults to the CountryProvider's, when there is one. */
  market?: string;
}) {
  const { user, loaded, premium } = useMe();
  const ctx = useCountryMaybe(); // always called: hooks must not be conditional
  const country = market ?? ctx?.country ?? DEFAULT_COUNTRY;
  const { rowFor, watch, unwatch, loaded: watchesLoaded } = useSealedWatches();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!loaded) return null;
  const row = rowFor(country, groupKey);
  const watching = !!row;

  if (!user || !premium) {
    if (compact) {
      return (
        <PremiumButton tier="plus" surface="gate:sealed-watch" className={`tap-icon rounded-full bg-ink-950/80 text-slate-300 hover:text-white ${className}`}>
          <span aria-hidden="true">♡</span>
          <span className="sr-only">Watch this product with Plus</span>
        </PremiumButton>
      );
    }
    return (
      <div className={className}>
        <p className="text-xs text-slate-400">Plus emails you when this is back in stock, at RRP, or at your price, checked {SEALED_CHECK_CADENCE}. At-RRP alerts: {SEALED_RRP_ONLY}.</p>
        <div className="mt-1.5">
          <PremiumButton tier="plus" surface="gate:sealed-watch" />
        </div>
      </div>
    );
  }

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || !watchesLoaded) return;
    setBusy(true);
    setNote(null);
    try {
      if (row) await unwatch(row.id);
      else {
        const out = await watch(groupKey);
        if (!out.ok) {
          setNote(
            out.status === 409
              ? `Plus watches up to ${SEALED_WATCH_LIMIT_PLUS} sealed products. Stop one on your watchlist, or move to Premium for unlimited.`
              : (out.body?.error as string | undefined) ?? "Couldn't save that — try again.",
          );
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={watching}
        aria-label={watching ? `Stop watching ${name}` : `Watch ${name}: email me on a restock, at RRP, or at my price`}
        title={watching ? "Watching — tap to stop" : "Watch: email me when it's back in stock, at RRP, or at my price"}
        className={`tap-icon rounded-full bg-ink-950/80 ${watching ? "text-brand-400" : "text-slate-300 hover:text-white"} ${className}`}
      >
        <span aria-hidden="true">{watching ? "♥" : "♡"}</span>
      </button>
    );
  }
  return (
    <div className={className}>
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={watching} className={watching ? "btn-ghost text-xs" : "btn-primary text-xs"}>
        {watching ? "♥ Watching — stop" : "♡ Watch this product"}
      </button>
      <p className="mt-1 text-[11px] text-slate-500">
        {watching
          ? `We email you when it's back in stock after selling out everywhere, at RRP, at your target, or on a real drop. Checked ${SEALED_CHECK_CADENCE}; a Discord stock bot may be faster. At-RRP alerts: ${SEALED_RRP_ONLY}. Set a target on your watchlist.`
          : `Email me when it's back in stock, at RRP, or at my price. Checked ${SEALED_CHECK_CADENCE}; a Discord stock bot may be faster. At-RRP alerts: ${SEALED_RRP_ONLY}.`}
      </p>
      {note && (
        <p role="alert" className="mt-1 text-xs text-amber-300">
          {note}
        </p>
      )}
    </div>
  );
}
