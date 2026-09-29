"use client";

import Link from "next/link";
import { useState } from "react";
import { useSealedWatches } from "@/lib/use-sealed-watches";
import { formatMoney } from "@/lib/format";
import { currencyOf, type Country } from "@/lib/country";
import { TargetInput } from "./DeckWatchList";
import { SEALED_WATCH_LIMIT_PLUS } from "@/lib/alert-limits";

// The "Sealed" section of /watching (Plus and Premium, 2026-09-29): every
// sealed product the paid run checks (lib/sealed-watch.ts) with its target,
// snooze and stop. `names` come from the page's own getSealedGroups read for
// the viewer's market (a key with no name is a product no longer tracked
// here, or one watched in another market).
export interface SealedWatchName {
  name: string;
  lowestPriceCents: number | null;
  msrpCents: number | null;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function SealedWatchList({ names, limit }: { names: Record<string, SealedWatchName>; limit: number | null }) {
  const { rows, update, unwatch } = useSealedWatches();
  const [error, setError] = useState<string | null>(null);
  if (!rows) return <p className="text-sm text-slate-500">Loading…</p>;
  if (rows.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-slate-400">
        No sealed products yet. Tap the heart on any product on{" "}
        <Link href="/sealed" className="text-brand-400 hover:underline">
          /sealed
        </Link>{" "}
        (or in its quick view) and we email you when it is back in stock after selling out everywhere, when a store has it at RRP,
        at your target, or on a real drop — checked after every price update.
        {limit != null ? ` Plus watches up to ${SEALED_WATCH_LIMIT_PLUS}; Premium has no limit.` : ""}
      </p>
    );
  }
  return (
    <div>
      {error && (
        <p role="alert" className="mb-2 text-xs text-rose-400">
          {error}
        </p>
      )}
      <ul className="divide-y divide-ink-800">
        {rows.map((r) => {
          const cur = currencyOf(r.market as Country);
          const m = (c: number) => formatMoney(c, cur);
          const info = names[r.groupKey];
          const snoozed = r.snoozedUntil && new Date(r.snoozedUntil).getTime() > Date.now();
          return (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{info?.name ?? r.groupKey.split("|").filter(Boolean).join(" ")}</span>
                  <span className="chip bg-ink-800 text-[10px] text-slate-400">{r.market}</span>
                  {snoozed && <span className="chip bg-amber-500/15 text-[10px] text-amber-300">Snoozed until {day(r.snoozedUntil!)}</span>}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {info
                    ? info.lowestPriceCents != null
                      ? `Cheapest in stock now: ${m(info.lowestPriceCents)}${info.msrpCents != null ? ` · RRP ${m(info.msrpCents)}` : ""}`
                      : "Not in stock at any store we track right now."
                    : "Not on this market's sealed page right now — we keep checking."}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-slate-400">
                  Target ({cur})
                  <TargetInput
                    cents={r.targetCents}
                    onSave={async (c) => {
                      const out = await update(r.id, { targetCents: c });
                      setError(out.ok ? null : ((out.body?.error as string | undefined) ?? "Couldn't save that."));
                    }}
                  />
                </label>
                <button type="button" onClick={() => void update(r.id, { snoozeDays: snoozed ? 0 : 30 })} className="btn-ghost text-xs">
                  {snoozed ? "Unsnooze" : "Snooze 30 days"}
                </button>
                <button type="button" onClick={() => void unwatch(r.id)} className="text-xs text-slate-500 hover:text-rose-300">
                  Stop
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">
        {rows.length} {rows.length === 1 ? "product" : "products"}
        {limit != null ? ` of ${limit}` : ""}. A target emails you at or under that price; without one, restocks, RRP and real drops still do.
      </p>
    </div>
  );
}
