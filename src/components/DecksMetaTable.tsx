"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TierBadge } from "./TierBadge";
import { formatMoney } from "@/lib/format";
import { cardImageAlt } from "@/lib/image-alt";
import { domainInfo } from "@/lib/constants";

// The riftDecks-style metagame board for /decks: every tracked deck as one
// sortable, filterable row. The full table is in the server-rendered HTML (a
// "use client" component still SSRs its initial state), so crawlers and
// no-JS readers get the complete board in its default tier → metashare order;
// sorting and filtering are pure client-side enhancement over the same rows.
//
// DATA HONESTY: every figure here is passed in from the server, already
// filtered through deckCostVerdict (an unpublishable build cost arrives as
// null and renders as "—", never as $0.00) — this component does presentation
// and ordering only, it computes no statistics of its own.

export interface DeckTableRow {
  slug: string;
  name: string;
  /** Legend with any " - Starter" suffix stripped. */
  legend: string;
  tier: string;
  archetype: string;
  domains: string[];
  metaSharePct: number | null;
  winRatePct: number | null;
  top8s: number | null;
  /** Publishable build cost in the served market, else null. */
  totalCents: number | null;
  pricedCards: number;
  priceableCards: number;
  avgEnergy: number | null;
  /** Main-deck energy curve, cost 1 → 6+; empty when too few costs are known. */
  curve: number[];
  imageThumbUrl: string | null;
}

type SortKey = "meta" | "wr" | "top8s" | "cost" | "energy" | "tier" | "name";

const SORTS: { key: SortKey; label: string; title: string }[] = [
  { key: "tier", label: "Tier", title: "Sort by tier" },
  { key: "meta", label: "Meta %", title: "Sort by metashare" },
  { key: "wr", label: "Win %", title: "Sort by win rate" },
  { key: "top8s", label: "Top 8s", title: "Sort by top-8 finishes" },
  { key: "energy", label: "Avg. cost", title: "Sort by average energy cost" },
  { key: "cost", label: "Build", title: "Sort by build cost" },
];

// Default direction per key: stats read best-first, price reads cheapest-first.
const DEFAULT_DESC: Record<SortKey, boolean> = {
  meta: true,
  wr: true,
  top8s: true,
  cost: false,
  energy: false,
  tier: false,
  name: false,
};

// Header sort buttons: 44px touch floor on phones, compact from `sm` up — the
// PriceChart range-button pattern.
const SORT_BTN = "inline-flex min-h-11 min-w-11 items-center hover:text-slate-300 sm:min-h-0 sm:min-w-0";

function tierRank(t: string): number {
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : 99;
}

/** Stable comparator; nulls always sort last regardless of direction. */
function compareBy(key: SortKey, desc: boolean) {
  const val = (r: DeckTableRow): number | string | null => {
    switch (key) {
      case "meta": return r.metaSharePct;
      case "wr": return r.winRatePct;
      case "top8s": return r.top8s;
      case "cost": return r.totalCents;
      case "energy": return r.avgEnergy;
      case "tier": return tierRank(r.tier);
      case "name": return r.name.toLowerCase();
    }
  };
  return (a: DeckTableRow, b: DeckTableRow): number => {
    const av = val(a);
    const bv = val(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    if (cmp !== 0) return desc ? -cmp : cmp;
    // Ties fall back to the board's canonical order: tier, then metashare.
    return tierRank(a.tier) - tierRank(b.tier) || (b.metaSharePct ?? 0) - (a.metaSharePct ?? 0);
  };
}

function CurveCells({ curve }: { curve: number[] }) {
  const max = Math.max(...curve, 1);
  const labels = curve.map((_, i) => (i === curve.length - 1 ? `${i + 1}+` : String(i + 1)));
  return (
    <svg
      viewBox={`0 0 ${curve.length * 9 - 3} 22`}
      className="h-[22px]"
      style={{ width: `${curve.length * 9 - 3}px` }}
      aria-label={`Energy curve: ${curve.map((c, i) => `${c} at cost ${labels[i]}`).join(", ")}`}
      role="img"
    >
      {curve.map((c, i) => {
        const h = Math.max(1.5, (c / max) * 20);
        return (
          <rect
            key={i}
            x={i * 9}
            y={22 - h}
            width={6}
            height={h}
            rx={1}
            className={c > 0 ? "fill-brand-400/70" : "fill-ink-700"}
          >
            <title>{`${c} card${c === 1 ? "" : "s"} at cost ${labels[i]}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function DecksMetaTable({ rows, currency }: { rows: DeckTableRow[]; currency: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("tier");
  const [desc, setDesc] = useState(false);
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);

  const tiers = useMemo(() => [...new Set(rows.map((r) => r.tier))].sort(), [rows]);
  const domains = useMemo(() => [...new Set(rows.flatMap((r) => r.domains))].sort(), [rows]);
  const maxShare = useMemo(() => Math.max(...rows.map((r) => r.metaSharePct ?? 0), 1), [rows]);

  const visible = useMemo(() => {
    return rows
      .filter((r) => (tierFilter ? r.tier === tierFilter : true))
      .filter((r) => (domainFilter ? r.domains.includes(domainFilter) : true))
      .sort(compareBy(sortKey, desc));
  }, [rows, sortKey, desc, tierFilter, domainFilter]);

  function onSort(key: SortKey) {
    if (key === sortKey) setDesc((d) => !d);
    else {
      setSortKey(key);
      setDesc(DEFAULT_DESC[key]);
    }
  }

  const arrow = (key: SortKey) => (sortKey === key ? (desc ? " ↓" : " ↑") : "");

  // min-h-11 sm:min-h-0: the site-wide 44px touch floor on phones, compact on
  // desktop — same pattern as PriceChart's range buttons.
  const chip = (active: boolean) =>
    `chip min-h-11 border px-2.5 py-1 text-xs transition-colors sm:min-h-0 ${
      active ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-ink-700 text-slate-400 hover:border-ink-600"
    }`;

  return (
    <div>
      {/* Filters — client-side narrowing over the same server-rendered rows. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Tier</span>
          <button type="button" className={chip(tierFilter === null)} onClick={() => setTierFilter(null)}>
            All
          </button>
          {tiers.map((t) => (
            <button
              key={t}
              type="button"
              className={chip(tierFilter === t)}
              onClick={() => setTierFilter(tierFilter === t ? null : t)}
            >
              Tier {t}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Domain</span>
          <button type="button" className={chip(domainFilter === null)} onClick={() => setDomainFilter(null)}>
            All
          </button>
          {domains.map((d) => (
            <button
              key={d}
              type="button"
              className={chip(domainFilter === d)}
              onClick={() => setDomainFilter(domainFilter === d ? null : d)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="card-surface overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2.5 font-semibold">#</th>
              <th className="px-3 py-2.5 font-semibold">
                <button type="button" onClick={() => onSort("name")} className={SORT_BTN} title="Sort by name">
                  Deck{arrow("name")}
                </button>
              </th>
              {SORTS.map((s) => (
                <th
                  key={s.key}
                  className={`px-3 py-2.5 font-semibold ${s.key === "energy" ? "hidden lg:table-cell" : ""}`}
                  aria-sort={sortKey === s.key ? (desc ? "descending" : "ascending") : "none"}
                >
                  <button type="button" onClick={() => onSort(s.key)} className={SORT_BTN} title={s.title}>
                    {s.label}
                    {arrow(s.key)}
                  </button>
                </th>
              ))}
              <th className="hidden px-3 py-2.5 font-semibold xl:table-cell">Curve</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {visible.map((r, i) => (
              <tr key={r.slug} className="transition-colors hover:bg-ink-850/60">
                <td className="num px-3 py-2.5 text-slate-500">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <Link href={`/decks/${r.slug}`} className="group flex items-center gap-2.5">
                    {r.imageThumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.imageThumbUrl}
                        alt={cardImageAlt({ name: r.legend })}
                        width={36}
                        height={48}
                        loading="lazy"
                        className="h-12 w-9 shrink-0 rounded object-cover object-top ring-1 ring-ink-700"
                      />
                    ) : (
                      <div className="h-12 w-9 shrink-0 rounded bg-ink-800" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-white group-hover:text-brand-300">{r.name}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                        {/* Compact dot-per-domain — the full DomainBadge chip
                            overwhelms an 11px table subtext row. */}
                        {r.domains.map((d) => (
                          <span
                            key={d}
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: domainInfo(d).color }}
                            title={`${d} domain`}
                          />
                        ))}
                        <span className="truncate">{r.archetype}</span>
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <TierBadge tier={r.tier} />
                </td>
                <td className="px-3 py-2.5">
                  {r.metaSharePct != null ? (
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-800">
                        <span
                          className="block h-full rounded-full bg-brand-500/80"
                          style={{ width: `${Math.max(4, (r.metaSharePct / maxShare) * 100)}%` }}
                        />
                      </span>
                      <span className="num text-slate-300">{r.metaSharePct}%</span>
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {r.winRatePct != null ? (
                    <span className={`num font-semibold ${r.winRatePct >= 50 ? "text-brand-400" : "text-slate-400"}`}>
                      {r.winRatePct}%
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="num px-3 py-2.5 text-slate-300">{r.top8s ?? <span className="text-slate-600">—</span>}</td>
                <td className="num hidden px-3 py-2.5 text-slate-300 lg:table-cell">
                  {r.avgEnergy != null ? r.avgEnergy.toFixed(1) : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  {r.totalCents != null ? (
                    <span className="num font-bold text-accent">{formatMoney(r.totalCents, currency)}</span>
                  ) : (
                    <span className="text-xs text-slate-500" title="Too few of this list's cards have a live price right now">
                      not enough listings
                    </span>
                  )}
                  <span className="num block text-[10px] text-slate-600">
                    {r.pricedCards}/{r.priceableCards} priced
                  </span>
                </td>
                <td className="hidden px-3 py-2.5 xl:table-cell">
                  {r.curve.length > 0 ? <CurveCells curve={r.curve} /> : <span className="text-slate-600">—</span>}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-500">
                  No tracked deck matches that filter — clear it to see the whole field.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
