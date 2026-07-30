"use client";

import Link from "next/link";
import { COUNTRIES, type Country } from "@/lib/country";
import type { Deal, TopDeals } from "@/lib/top-deals";
import { formatMoney } from "@/lib/format";
import { OutboundLink } from "@/components/OutboundLink";
import { useCountry } from "@/components/CountryProvider";

// Homepage "Today's Top Deals". Four columns, one per signal. The two PREMIUM
// columns (arbitrage savings, undervalued) reveal only their single best deal —
// matching the /tools gate — then show blurred placeholder rows and a funnel to the
// full Premium tool. Free columns (price drops, cheapest sealed) show in full. Empty
// columns (a signal with no data in this market) are dropped entirely.
type ColumnDef = {
  key: keyof Omit<TopDeals, "hasAny">;
  label: string;
  premium: boolean;
  allHref: string;
  allLabel: string;
};

const COLUMNS: ColumnDef[] = [
  { key: "savingsVsMarket", label: "Biggest savings", premium: true, allHref: "/tools/deal-finder", allLabel: "All opportunities" },
  { key: "priceDrops", label: "Price drops", premium: false, allHref: "/movers", allLabel: "All movers" },
  { key: "cheapestSealed", label: "Cheapest sealed", premium: false, allHref: "/sealed", allLabel: "All sealed" },
  { key: "undervalued", label: "Undervalued", premium: true, allHref: "/tools/value-finder", allLabel: "Value Finder" },
];

function PctBadge({ deal }: { deal: Deal }) {
  if (deal.pctLabel == null) return null;
  const text =
    deal.dealType === "savings-vs-market" ? `Save ${deal.pctLabel}%` : `−${deal.pctLabel}%`;
  return <span className="chip num shrink-0 bg-brand-500/15 text-brand-300">{text}</span>;
}

function DealRow({ deal, currency, country }: { deal: Deal; currency: string; country: Country }) {
  const inner = (
    <>
      <div className="h-11 w-8 shrink-0 overflow-hidden rounded bg-ink-900">
        {deal.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={deal.imageUrl} alt="" aria-hidden="true" width={32} height={44} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{deal.title}</div>
        <div className="truncate text-[11px] text-slate-500">
          {deal.subtitle}
          {deal.note ? <span className="text-slate-600"> · {deal.note}</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="num text-sm font-bold text-accent">{formatMoney(deal.priceCents, currency)}</span>
        <PctBadge deal={deal} />
      </div>
    </>
  );

  const cls = "flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-ink-900/50";
  if (deal.outboundUrl) {
    return (
      <li>
        <OutboundLink href={deal.outboundUrl} retailer={deal.outboundRetailer ?? "sealed"} country={country} kind="sealed" className={cls}>
          {inner}
        </OutboundLink>
      </li>
    );
  }
  return (
    <li>
      <Link href={deal.href ?? "#"} className={cls}>
        {inner}
      </Link>
    </li>
  );
}

// Decorative, data-free blurred rows that hint at the locked Premium deals without
// shipping any real values to non-subscribers.
function SkeletonRow() {
  return (
    <li className="flex items-center gap-2.5 px-3 py-2.5 opacity-50 blur-[2px]" aria-hidden>
      <div className="h-11 w-8 shrink-0 rounded bg-ink-800" />
      <div className="flex-1 space-y-1.5">
        <div className="h-2.5 w-3/4 rounded bg-ink-800" />
        <div className="h-2 w-1/2 rounded bg-ink-800" />
      </div>
      <div className="h-3 w-9 shrink-0 rounded bg-ink-800" />
    </li>
  );
}

// Reactive to the country switcher: the page serializes all four markets' deals and
// this picks the visitor's market client-side (currency, prices and the "in {place}"
// label all follow). Prevents the section from showing the baked DEFAULT_COUNTRY
// currency (e.g. US$ to an AU visitor) — the card tiles already localise this way.
export function TodaysTopDeals({ dealsByCountry }: { dealsByCountry: Record<Country, TopDeals> }) {
  const { country } = useCountry();
  const info = COUNTRIES[country];
  const currency = info.currency;
  const place = info.place;
  const deals = dealsByCountry[country] ?? dealsByCountry.AU;

  const columns = COLUMNS.map((c) => ({ def: c, items: deals[c.key] })).filter((c) => c.items.length > 0);
  if (columns.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-white">Today&apos;s Top Deals</h2>
          <p className="mt-0.5 text-sm text-slate-400">The best live opportunities in {place} right now — refreshed daily.</p>
        </div>
        <Link href="/tools/deal-finder" className="btn-ghost hidden text-sm sm:inline-flex">Browse all deals →</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {columns.map(({ def, items }) => {
          // Premium columns reveal only the single best deal; the rest is locked —
          // but only show as many "locked" rows as there are ACTUAL hidden deals.
          // This used to force a minimum of 2 skeleton rows even when there was
          // only 1 real deal today (nothing hidden behind them at all), which both
          // misrepresented how much data exists and threw off the column's height
          // next to its neighbours.
          const shown = def.premium ? items.slice(0, 1) : items;
          const skeletons = def.premium ? Math.min(3, Math.max(0, items.length - 1)) : 0;
          return (
            <div key={def.key} className="card-surface flex flex-col p-3 transition-colors duration-200 hover:border-brand-500/60 hover:bg-ink-800">
              <div className="mb-1 flex items-center justify-between gap-2 px-1">
                <span className="flex items-center gap-1.5 text-sm font-extrabold text-white">
                  {def.label}
                </span>
                {def.premium && <span className="chip bg-gold/20 text-gold">Premium</span>}
              </div>

              <ul className="flex-1 divide-y divide-ink-800">
                {shown.map((deal, i) => (
                  <DealRow key={i} deal={deal} currency={currency} country={country} />
                ))}
                {Array.from({ length: skeletons }).map((_, i) => (
                  <SkeletonRow key={`s${i}`} />
                ))}
              </ul>

              <Link
                href={def.allHref}
                className="mt-1.5 flex items-center justify-center gap-1 rounded-md border border-ink-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-brand-500 hover:text-white"
              >
                {def.allLabel} →
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
