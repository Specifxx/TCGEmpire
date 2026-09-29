"use client";

import Link from "next/link";
import { useState } from "react";
import { useMe } from "@/lib/use-me";
import { useCountry } from "./CountryProvider";
import { PremiumButton } from "./PremiumButton";
import { DECK_WATCH_LIMIT } from "@/lib/alert-limits";
import { friendlyTargetCents } from "@/lib/deck-watch-pure";
import { currencyOf, type Country } from "@/lib/country";
import { trackEvent } from "@/lib/analytics";

// "WATCH THIS LIST" (2026-09-29, Premium): saves the list the member just
// priced, with a delivered-price target, so the paid alert run re-prices it
// after every import and emails when it is met (lib/deck-watch.ts). Rendered
// under Best Basket's plan (with today's total, so the default target is that
// total rounded down to a friendly figure) and on /deck (no total yet: the
// target starts empty and "email me on a real drop" is the default).
//
// Anyone below Premium sees the same PremiumButton every gate uses, on the
// surface gate:deck-watch, with one honest line — not a popup of its own.
export function DeckWatchForm({
  listText,
  defaultName,
  totalCents,
  region,
  trackedOnly,
  className = "",
}: {
  listText: string;
  defaultName: string;
  totalCents?: number | null;
  region?: string | null;
  trackedOnly?: boolean;
  className?: string;
}) {
  const { user, loaded, premium, tier } = useMe();
  const { country, fmt } = useCountry();
  const [name, setName] = useState(defaultName.slice(0, 80));
  const [target, setTarget] = useState<string>(() => (totalCents != null ? (friendlyTargetCents(totalCents) / 100).toFixed(2) : ""));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ id: string; targetCents: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!loaded) return null;
  const isPremium = !!user && premium && tier === "premium";
  const currency = currencyOf(country as Country);

  if (!isPremium) {
    return (
      <div className={`card-surface p-4 ${className}`} data-deck-watch-gate>
        <p className="text-sm font-semibold text-white">Watch this deck&apos;s price</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Premium re-prices a saved list after every price update — cards and postage, across every store — and emails you when the
          delivered total reaches your price or drops for real. Up to {DECK_WATCH_LIMIT} lists.
        </p>
        <div className="mt-2">
          <PremiumButton surface="gate:deck-watch" />
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className={`card-surface p-4 ${className}`} data-deck-watch-saved>
        <p className="text-sm font-semibold text-white">Watching {name || "this list"}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          {saved.targetCents != null
            ? `We email you when the delivered total is ${fmt(saved.targetCents)} or less, checked after every price update.`
            : "We email you when the delivered total drops at least 5% (and a whole unit) below the last figure we saw, checked after every price update."}{" "}
          <Link href="/watching#decks" className="text-brand-400 hover:underline">
            Manage it on your watchlist →
          </Link>
        </p>
      </div>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    let targetCents: number | null = null;
    if (target.trim()) {
      const n = Number(target.replace(/[^\d.]/g, ""));
      if (!Number.isFinite(n) || n <= 0) {
        setError("Enter a price, or leave it empty to be emailed on a real drop.");
        setBusy(false);
        return;
      }
      targetCents = Math.round(n * 100);
    }
    try {
      const res = await fetch("/api/watches/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, listText, targetCents, region: region ?? null, trackedOnly: !!trackedOnly }),
      });
      const d = (await res.json().catch(() => null)) as { watch?: { id: string; targetCents: number | null }; error?: string } | null;
      if (!res.ok || !d?.watch) {
        setError(d?.error ?? "Couldn't save that — try again.");
        return;
      }
      setSaved({ id: d.watch.id, targetCents: d.watch.targetCents });
      trackEvent("deck_watch_add", { target: targetCents ?? 0, market: country });
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className={`card-surface p-4 ${className}`} data-deck-watch-form>
      <p className="text-sm font-semibold text-white">Watch this list — email me when the delivered total drops below…</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        We re-price the whole list after every price update — every card plus each store&apos;s measured postage — and email you when
        it is at or under your price. Leave the price empty to hear about any real drop instead.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="input w-48" required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Delivered total under ({currency})
          <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="any real drop" className="input w-36" />
        </label>
        <button type="submit" disabled={busy} className="btn-primary text-sm">
          {busy ? "Saving…" : "Watch this list"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-400">
          {error}
        </p>
      )}
    </form>
  );
}
