"use client";

import { useState } from "react";
import { CardSearch, type SearchCard } from "./CardSearch";
import { CONDITIONS, CONDITION_KEYS, CONDITION_MULTIPLIER } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { cardDisplayName } from "@/lib/card-name";
import { cardImageAlt } from "@/lib/image-alt";
import type { Country } from "@/lib/country";

// Estimates the value swap between two conditions of the same card, using the
// same CONDITION_MULTIPLIER table the portfolio already values holdings with
// (see getPortfolio in lib/premium.ts) — this is that exact math, just run
// forward from a hypothetical rather than backward from a recorded holding, so
// no new data model or backend is needed: CardSearch's own live price is the
// only input.
const lowestFor = (c: SearchCard, country: Country): number | null =>
  country === "US" ? c.lowestPriceCentsUs ?? null
  : country === "UK" ? c.lowestPriceCentsUk ?? null
  : country === "SG" ? c.lowestPriceCentsSg ?? null
  : country === "CA" ? c.lowestPriceCentsCa ?? null
  : country === "EU" ? c.lowestPriceCentsEu ?? null
  : c.lowestPriceCents;

export function ConditionCalculator({ country, currency }: { country: Country; currency: string }) {
  const [card, setCard] = useState<SearchCard | null>(null);
  const [from, setFrom] = useState("NM");
  const [to, setTo] = useState("LP");

  const base = card ? lowestFor(card, country) : null;
  const fromCents = base != null ? Math.round(base * (CONDITION_MULTIPLIER[from] ?? 1)) : null;
  const toCents = base != null ? Math.round(base * (CONDITION_MULTIPLIER[to] ?? 1)) : null;
  const deltaCents = fromCents != null && toCents != null ? toCents - fromCents : null;
  const deltaPct = fromCents != null && toCents != null && fromCents > 0 ? Math.round(((toCents - fromCents) / fromCents) * 1000) / 10 : null;

  return (
    <div className="card-surface p-5">
      <h2 className="mb-3 font-bold text-white">Condition Impact Calculator</h2>
      {!card ? (
        <CardSearch onPick={setCard} placeholder="Search a card to compare conditions…" />
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {card.imageThumbUrl ? <img src={card.imageThumbUrl} alt={cardImageAlt(card)} width={40} height={56} className="h-14 w-10 rounded object-cover" /> : <div className="h-14 w-10 rounded bg-ink-800" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{cardDisplayName(card.name, card)}</div>
            <div className="text-xs text-slate-500">
              {card.setCode} {card.collectorNumber}
              {base != null && <> · current lowest <span className="text-accent">{formatMoney(base, currency)}</span></>}
            </div>
          </div>
          <button type="button" onClick={() => setCard(null)} className="text-xs text-slate-500 hover:text-rose-300">change</button>
        </div>
      )}

      {card && base == null && (
        <p className="mt-3 text-sm text-slate-500">No live price for this card in your market yet — try another printing.</p>
      )}

      {card && base != null && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-400">From condition</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)} className="input">
                {CONDITION_KEYS.map((k) => <option key={k} value={k}>{CONDITIONS[k]!.full} ({k})</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-400">To condition</span>
              <select value={to} onChange={(e) => setTo(e.target.value)} className="input">
                {CONDITION_KEYS.map((k) => <option key={k} value={k}>{CONDITIONS[k]!.full} ({k})</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 p-4">
            <span className="text-lg font-bold text-white">{formatMoney(fromCents!, currency)}</span>
            <span className="text-slate-500">→</span>
            <span className="text-lg font-bold text-white">{formatMoney(toCents!, currency)}</span>
            {deltaCents != null && deltaPct != null && (
              <span
                className={`ml-auto text-sm font-bold ${deltaCents === 0 ? "text-slate-400" : deltaCents > 0 ? "text-brand-400" : "text-rose-400"}`}
              >
                {deltaCents > 0 ? "+" : ""}{formatMoney(deltaCents, currency)} ({deltaPct > 0 ? "+" : ""}{deltaPct}%)
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Estimated from the standard condition multipliers (NM 100% · LP 85% · MP 70% · HP 55% · DMG 40%) applied to
            the card&apos;s current lowest live price — a reference estimate, not a guaranteed resale value. Individual
            listings vary.
          </p>
        </>
      )}
    </div>
  );
}
