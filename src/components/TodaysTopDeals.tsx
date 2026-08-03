"use client";

import Link from "next/link";
import { COUNTRIES, type Country } from "@/lib/country";
import type { Deal, TopDeals } from "@/lib/top-deals";
import { formatMoney } from "@/lib/format";
import { OutboundLink } from "@/components/OutboundLink";
import { useCountry } from "@/components/CountryProvider";
import { cardImageAlt } from "@/lib/image-alt";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense";

// Homepage "Today's Top Deals". Up to four columns, one per signal (the grid
// itself only declares as many columns as actually have data — see GRID_COLS
// below). The two PREMIUM columns (arbitrage savings, undervalued) reveal only
// their single best deal — matching the /tools gate — then a clearly-locked
// teaser funnelling to the full Premium tool, when there's really more behind
// it. Free columns (price drops, cheapest sealed) show in full. Empty columns
// (a signal with no data in this market) are dropped entirely.
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
          <img src={deal.imageUrl} alt={cardImageAlt({ name: deal.title })} width={32} height={44} loading="lazy" decoding="async" className="h-full w-full object-cover" />
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

// A deliberate "locked" state for the rest of a Premium column's deals — NOT a
// loading skeleton (there's nothing pending; the data exists, it's just gated).
// One clear panel with a lock icon and an unlock CTA, sized to fill the same
// vertical space the blurred placeholder rows used to, so this column still
// matches its free-column neighbours' height without faking extra "rows".
function LockedTeaser({ count, href }: { count: number; href: string }) {
  return (
    <li className="flex flex-1 flex-col items-center justify-center gap-1.5 px-3 py-6 text-center">
      <span aria-hidden className="text-xl">🔒</span>
      <Link href={href} className="text-xs font-bold text-gold hover:underline">
        Unlock {count} more with Premium →
      </Link>
    </li>
  );
}

// Column-count classes are looked up (not string-built) so Tailwind's build-time
// class scan can see every literal — the grid always matches how many columns
// actually have data today instead of a fixed 4, which used to leave the right
// half of the row empty on days a signal or two had nothing to show.
const GRID_COLS: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

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

      <div className={`grid items-stretch gap-4 ${GRID_COLS[columns.length] ?? GRID_COLS[4]}`}>
        {columns.map(({ def, items }) => {
          // Premium columns normally reveal only the single best deal; the rest is
          // locked — "locked" means how many REAL deals exist behind it, not a fixed
          // filler count (a day with only 1 real deal shows no locked teaser at all,
          // since there's nothing behind it to unlock).
          //
          // WHILE ADSENSE_REVIEW_MODE IS ON, every column is shown in full and the
          // "Unlock N more with Premium" teaser is not rendered at all. A reviewer
          // landing on the homepage — the first page they see — must not find gated
          // content there; "content behind a paywall or login" is its own rejection
          // reason, and this was the only such teaser above the fold. The Premium
          // link stays as an ordinary CTA below the column; it just no longer stands
          // in place of content. Restored by setting
          // NEXT_PUBLIC_ADSENSE_REVIEW_MODE=false. See docs/adsense-remediation.md.
          const gated = def.premium && !ADSENSE_REVIEW_MODE;
          const shown = gated ? items.slice(0, 1) : items;
          const locked = gated ? Math.max(0, items.length - 1) : 0;
          return (
            <div key={def.key} className="card-surface flex h-full flex-col p-3 transition-colors duration-200 hover:border-brand-500/60 hover:bg-ink-800">
              <div className="mb-1 flex items-center justify-between gap-2 px-1">
                <span className="flex items-center gap-1.5 text-sm font-extrabold text-white">
                  {def.label}
                </span>
                {def.premium && !ADSENSE_REVIEW_MODE && <span className="chip bg-gold/20 text-gold">Premium</span>}
              </div>

              <ul className="flex flex-1 flex-col divide-y divide-ink-800">
                {shown.map((deal, i) => (
                  <DealRow key={i} deal={deal} currency={currency} country={country} />
                ))}
                {locked > 0 && <LockedTeaser count={locked} href={def.allHref} />}
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
