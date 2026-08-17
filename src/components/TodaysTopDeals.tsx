"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { COUNTRIES, type Country } from "@/lib/country";
import type { Deal, TopDeals } from "@/lib/top-deals";
import { formatMoney } from "@/lib/format";
import { OutboundLink } from "@/components/OutboundLink";
import { useCountry } from "@/components/CountryProvider";
import { useQuickView } from "@/components/QuickView";
import { cardImageAlt } from "@/lib/image-alt";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense";

// Homepage "Today's Top Deals". Up to three columns, one per signal (the grid
// itself only declares as many columns as actually have data — see GRID_COLS
// below). The PREMIUM column (arbitrage savings) reveals only its single best
// deal — matching the /tools gate — then a clearly-locked teaser funnelling to
// the full Premium tool, when there's really more behind it. The free columns
// (price drops, cheapest sealed) show in full. Empty columns (a signal with no
// data in this market) are dropped entirely.
//
// A fourth column, "undervalued", used to sit here — removed per a homepage-
// declutter pass (not just hidden: lib/top-deals.ts no longer fetches it for
// this feed at all). Four competing signals read as "study this table," not
// "here's a deal," and the Value Finder tool (/tools/value-finder) already
// serves that exact signal on its own dedicated page with room to explain it.
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
];

// Budget tiers — "rounded to natural values per market" (not FX-converted at
// render time; these are UI filter buckets, like an e-commerce price facet, not
// a data claim). US$5 / US$25 are the anchor; other markets get a hand-rounded
// equivalent scaled to that currency's rough purchasing power.
type Tier = "all" | "small" | "mid" | "big";
const TIER_THRESHOLDS: Record<Country, { small: number; mid: number }> = {
  AU: { small: 800, mid: 4000 },
  NZ: { small: 800, mid: 4000 },
  US: { small: 500, mid: 2500 },
  UK: { small: 400, mid: 2000 },
  SG: { small: 700, mid: 3500 },
  CA: { small: 700, mid: 3500 },
};
const TIERS: { key: Tier; label: (t: { small: number; mid: number }, fmt: (c: number) => string) => string }[] = [
  { key: "all", label: () => "All" },
  { key: "small", label: (t, fmt) => `Under ${fmt(t.small)}` },
  { key: "mid", label: (t, fmt) => `Under ${fmt(t.mid)}` },
  { key: "big", label: () => "Big ticket" },
];

function inTier(cents: number, tier: Tier, t: { small: number; mid: number }): boolean {
  if (tier === "all") return true;
  if (tier === "small") return cents <= t.small;
  if (tier === "mid") return cents <= t.mid;
  return cents > t.mid;
}

// Default ("All") ordering: pull items at/under the $25-equivalent tier toward
// the front, interleaved with pricier ones, so the single item a non-Premium
// visitor sees for a gated column is more often an approachable price — real
// items, real order within each bucket, just presented cheap-first when a cheap
// one exists. Only used for the default view; an explicit tier pick shows that
// tier's items in their original (signal) order.
function mixByTier(items: Deal[], midThreshold: number): Deal[] {
  const cheap = items.filter((d) => d.priceCents <= midThreshold);
  const pricey = items.filter((d) => d.priceCents > midThreshold);
  const out: Deal[] = [];
  for (let i = 0; i < cheap.length || i < pricey.length; i++) {
    if (i < cheap.length) out.push(cheap[i]);
    if (i < pricey.length) out.push(pricey[i]);
  }
  return out;
}

// A single, plain "-Y%" badge — no reference price alongside it. This used to
// also read "was US$1,167.94 · Save 14%", showing the exact price being
// compared against so the two numbers on a row couldn't be misread as a
// before→after PRICE pair (see git history for the bug that fixed). That
// caveat is real, but on a homepage the fix traded one kind of confusion for
// another: a row of small print squeezed between the title and the headline
// price, on a page meant to be readable at a glance. The percentage alone is
// the number a visitor scanning this section actually wants ("how big a
// deal is this"); the exact reference price is one click away on the card's
// own page or its QuickView popup, which both still show it in full.
function PctBadge({ deal }: { deal: Deal }) {
  if (deal.pctLabel == null) return null;
  const text = deal.dealType === "savings-vs-market" ? `Save ${deal.pctLabel}%` : `−${deal.pctLabel}%`;
  return <span className="chip num shrink-0 bg-brand-500/15 text-brand-300">{text}</span>;
}

function DealRow({ deal, currency, country }: { deal: Deal; currency: string; country: Country }) {
  const { open } = useQuickView();
  // Same instant-preview pattern as CardTile/MarketPulse: a plain left-click on
  // a card deal (savings-vs-market, price-drops) opens the QuickView popup
  // instead of navigating away, so scanning today's deals doesn't cost a full
  // page load per row. Sealed deals have no QuickView equivalent and already
  // go straight to an outbound buy link below — that branch is untouched.
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
  function onClick(e: React.MouseEvent) {
    track("top_deal_click", { deal: deal.dealType, title: deal.title });
    if (!deal.card) return; // no QuickView data — fall through to a normal navigation
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const down = downRef.current;
    if (down && (Math.abs(e.clientX - down.x) > 8 || Math.abs(e.clientY - down.y) > 8 || Date.now() - down.t > 600)) return;
    e.preventDefault();
    open(deal.card);
  }

  const inner = (
    <>
      <div className="h-11 w-8 shrink-0 overflow-hidden rounded bg-ink-900">
        {deal.imageUrl && (
          // Plain <img>, not next/image: deal images come from three different
          // sources (RiftScribe, Riot's own CDN, TCGplayer sealed photos) plus
          // occasional re-hosted/legacy hosts next/image has no allow-list entry
          // for — any of those, passed to next/image, silently fails to render
          // instead of falling back to a plain image request. A fixed 32x44 tile
          // doesn't need next/image's resizing to begin with (same reasoning as
          // MarketPulse.tsx's and PriceWatch.tsx's tiles), so there is nothing
          // to trade away by using a plain tag here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={deal.imageUrl}
            alt={cardImageAlt({ name: deal.title })}
            width={32}
            height={44}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
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
      <Link href={deal.href ?? "#"} prefetch={false} onPointerDown={onPointerDown} onClick={onClick} className={cls}>
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
// actually have data today instead of a fixed count, which used to leave the
// right half of the row empty on days a signal or two had nothing to show.
const GRID_COLS: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
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
  const thresholds = TIER_THRESHOLDS[country] ?? TIER_THRESHOLDS.AU;
  const [tier, setTier] = useState<Tier>("all");

  // Tier-independent: is there ANYTHING to show today, in any tier? If not, the
  // section hides entirely (unchanged behaviour) rather than showing a shell
  // with tabs over nothing.
  const allColumns = COLUMNS.map((c) => ({ def: c, items: deals[c.key] })).filter((c) => c.items.length > 0);
  if (allColumns.length === 0) return null;

  // "All" mixes cheap-first (see mixByTier) so a Premium column's single
  // unlocked item is more often approachable; an explicit tier just filters,
  // keeping each signal's own order (biggest saving / drop first).
  const columns = allColumns
    .map(({ def, items }) => ({
      def,
      items: tier === "all" ? mixByTier(items, thresholds.mid) : items.filter((d) => inTier(d.priceCents, tier, thresholds)),
    }))
    .filter((c) => c.items.length > 0);

  function fmtT(cents: number) {
    return formatMoney(cents, currency);
  }
  function changeTier(t: Tier) {
    setTier(t);
    track("deals_tab_change", { tab: t });
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-white">Today&apos;s Top Deals</h2>
          <p className="mt-0.5 text-sm text-slate-400">The best live opportunities in {place} right now — refreshed daily.</p>
        </div>
        <Link href="/tools/deal-finder" className="btn-ghost hidden text-sm sm:inline-flex">Browse all deals →</Link>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter deals by price">
        {TIERS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tier === t.key}
            onClick={() => changeTier(t.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              tier === t.key ? "bg-brand-500 text-ink-950" : "bg-ink-900 text-slate-400 hover:bg-ink-800 hover:text-slate-200"
            }`}
          >
            {t.label(thresholds, fmtT)}
          </button>
        ))}
      </div>

      {columns.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-slate-400">
          No {TIERS.find((t) => t.key === tier)?.label(thresholds, fmtT).toLowerCase()} deals in {place} right now — try another filter.
        </div>
      ) : (
      <div className={`grid items-stretch gap-4 ${GRID_COLS[columns.length] ?? GRID_COLS[3]}`}>
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
      )}
    </section>
  );
}
