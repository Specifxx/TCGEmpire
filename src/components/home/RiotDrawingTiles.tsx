"use client";

import Link from "next/link";
import type { Country } from "@/lib/country";
import type { SealedGroup } from "@/lib/sealed-import";
import { COUNTRIES } from "@/lib/country";
import { useCountry } from "@/components/CountryProvider";
import { SealedTile } from "@/components/SealedTile";

// The client half of RiotDrawingsRow: picks the visitor's market and draws each
// of Riot's drawing products as the ordinary sealed tile (quick view on click),
// with the server-computed facts under it. A market without the group (it
// always has one, see RiotDrawingsRow) falls back to the US group in USD, as
// the sealed shelf and /sealed do.
export interface DrawingTile {
  groupKey: string;
  name: string;
  tagline: string;
  priceUsd: number;
  chip: { text: string; tone: "open" | "upcoming" | "closed" };
  line: string;
  blogHref: string;
  riotUrl: string;
}

const TONE: Record<DrawingTile["chip"]["tone"], string> = {
  open: "bg-emerald-500/15 text-emerald-300",
  upcoming: "bg-amber-500/15 text-amber-300",
  closed: "bg-ink-800 text-slate-300",
};

export function RiotDrawingTiles({ tiles, groupsByCountry }: { tiles: DrawingTile[]; groupsByCountry: Record<Country, SealedGroup[]> }) {
  const { country } = useCountry();
  const pick = (key: string): { group: SealedGroup; currency: string } | null => {
    const own = groupsByCountry[country]?.find((g) => g.groupKey === key);
    if (own) return { group: own, currency: COUNTRIES[country].currency };
    const us = groupsByCountry.US?.find((g) => g.groupKey === key);
    return us ? { group: us, currency: COUNTRIES.US.currency } : null;
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {tiles.map((t) => {
        const hit = pick(t.groupKey);
        return (
          <div key={t.groupKey} className="flex flex-col gap-3 sm:flex-row">
            <div className="w-full shrink-0 sm:w-56">
              {hit ? (
                <SealedTile group={hit.group} currency={hit.currency} />
              ) : (
                <Link href={t.blogHref} className="card-surface block p-4 text-sm font-semibold text-white hover:underline">
                  {t.name}
                </Link>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`chip font-semibold ${TONE[t.chip.tone]}`}>{t.chip.text}</span>
                <span className="chip bg-ink-800 text-slate-300">US${t.priceUsd} + shipping at Riot</span>
              </div>
              <p className="text-sm text-slate-300">{t.tagline}</p>
              <p className="text-xs text-slate-400">{t.line}</p>
              <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm font-semibold">
                <Link href={t.blogHref} className="text-brand-400 hover:underline">
                  What&apos;s in the box →
                </Link>
                <a href={t.riotUrl} rel="noopener nofollow" target="_blank" className="text-brand-400 hover:underline">
                  How to enter at Riot ↗
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
