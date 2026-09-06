"use client";

import Link from "next/link";
import Image from "next/image";
import { COUNTRIES, type Country } from "@/lib/country";
import type { Deal, DealColumnKey, DealType, TopDeals } from "@/lib/top-deals";
import { formatMoney } from "@/lib/format";
import { OutboundLink } from "@/components/OutboundLink";
import { useCountry } from "@/components/CountryProvider";
import { cardImageAlt } from "@/lib/image-alt";

// ONE deals row — collapses what used to be three homepage sections (Market
// pulse's risers/fallers, Today's Top Deals' 4-column grid, and its own
// price-tier filter chips) into a single horizontally-scrolling row of up to
// six cards, per the redesign brief. Market pulse's content still exists —
// it's the /market page, linked from the footer — this row is deliberately
// NOT a like-for-like replacement of everything that used to be above the
// fold, just the single strongest "here's a deal" proof the homepage keeps.
//
// Reuses lib/top-deals.ts's EXISTING blended signal (savingsVsMarket,
// priceDrops, cheapestSealed) unchanged — this file only SELECTS from data
// already computed elsewhere, it doesn't add new pricing aggregation. Filter
// chips are gone entirely (they now belong to the deals page they filter,
// not the homepage teaser of it).
//
// "undervalued" (cards furthest below their 30-day average) is gone from
// this list because it's gone from TopDeals itself — dropped by a later,
// independent homepage-decluttering pass on direct user feedback ("too many
// numbers on the homepage... Undervalued isn't worth the space"); see
// lib/top-deals.ts's own header note. Nothing to reconcile here beyond
// following that type change through.
const KIND_LABEL: Record<DealType, string> = {
  "price-drops": "Price drop",
  "cheapest-sealed": "Cheapest sealed",
  "savings-vs-market": "eBay deal",
  // This row is unmounted (see page.tsx's own comment) and was never updated
  // when Rising Cards was added to TopDeals/TodaysTopDeals.tsx — kept here
  // only so DealType stays exhaustive and this dead file still compiles.
  "rising-cards": "Rising card",
};

// Free signals FIRST. The old per-column gating on the homepage revealed
// exactly one item from the Premium signal (savingsVsMarket) and the rest in
// full for the free ones (priceDrops, cheapestSealed) — see the retired
// TodaysTopDeals.tsx. Round-robin-ing this order preserves that same
// exposure level without re-implementing a locked-teaser UI in a six-card
// row: the first pass takes one item per signal (one free preview from the
// Premium column, same as before), and only a SECOND pass — which only ever
// reaches the free signals, since they're ordered first — pulls in the extra
// cards needed to fill out to six. Deliberately does NOT include the later-
// added "risingCards" signal — this row is unmounted dead code, not a live
// second surface to keep in sync with every TopDeals addition.
const SIGNAL_ORDER: DealColumnKey[] = ["priceDrops", "cheapestSealed", "savingsVsMarket"];
const ROW_SIZE = 6;

function pickSix(deals: TopDeals): Deal[] {
  const buckets = SIGNAL_ORDER.map((k) => deals[k]);
  const out: Deal[] = [];
  for (let i = 0; out.length < ROW_SIZE; i++) {
    const before = out.length;
    for (const b of buckets) {
      if (out.length >= ROW_SIZE) break;
      if (b[i]) out.push(b[i]);
    }
    if (out.length === before) break; // every bucket exhausted
  }
  return out;
}

function DealCard({ deal, index, currency, country }: { deal: Deal; index: number; currency: string; country: Country }) {
  const inner = (
    <>
      <div className="h-24 w-full overflow-hidden rounded bg-ink-900">
        {deal.imageUrl && (
          <Image
            src={deal.imageUrl}
            alt={cardImageAlt({ name: deal.title })}
            width={140}
            height={96}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="mt-2 min-w-0 flex-1">
        <div className="chip mb-1 inline-flex bg-ink-800 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {KIND_LABEL[deal.dealType]}
        </div>
        <div className="line-clamp-1 text-sm font-bold text-white">{deal.title}</div>
        {deal.subtitle && <div className="line-clamp-1 text-[11px] text-slate-500">{deal.subtitle}</div>}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-1">
        <span className="num text-base font-extrabold text-accent">{formatMoney(deal.priceCents, currency)}</span>
        {deal.pctLabel != null && (
          <span className="chip num shrink-0 bg-brand-500/15 text-[11px] text-brand-300">
            {deal.dealType === "savings-vs-market" ? `Save ${deal.pctLabel}%` : `−${deal.pctLabel}%`}
          </span>
        )}
      </div>
    </>
  );

  const cls = "card-surface flex h-full w-40 shrink-0 snap-start flex-col p-2.5 transition-colors hover:border-brand-500/60 hover:bg-ink-800 sm:w-44";

  if (deal.outboundUrl) {
    return (
      <OutboundLink
        href={deal.outboundUrl}
        retailer={deal.outboundRetailer ?? "sealed"}
        country={country}
        cardName={deal.title}
        price={deal.priceCents / 100}
        positionInList={index + 1}
        pageType="homepage"
        className={cls}
      >
        {inner}
      </OutboundLink>
    );
  }
  return (
    <Link href={deal.href ?? "/browse"} prefetch={false} className={cls}>
      {inner}
    </Link>
  );
}

export function DealsRow({ dealsByCountry }: { dealsByCountry: Record<Country, TopDeals> }) {
  const { country } = useCountry();
  const info = COUNTRIES[country];
  const deals = dealsByCountry[country] ?? dealsByCountry.AU;
  const row = pickSix(deals);
  if (row.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-white">Today&apos;s best deals</h2>
          <p className="mt-0.5 text-sm text-slate-400">The best live opportunities in {info.place} right now.</p>
        </div>
        <Link href="/tools/deal-finder" className="btn-ghost hidden text-sm sm:inline-flex">
          See all deals →
        </Link>
      </div>

      <div className="relative">
        <div className="scroll-px-1 -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
          {row.map((deal, i) => (
            <DealCard key={`${deal.dealType}-${i}`} deal={deal} index={i} currency={info.currency} country={country} />
          ))}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-ink-950 to-transparent sm:w-16"
        />
      </div>

      {/* tap-link-block: a plain `block` text link measured short of the 44px
          mobile tap-target floor (same class the codebase's footer/legal
          links already use for the identical problem). */}
      <Link href="/tools/deal-finder" className="tap-link-block mt-3 justify-center text-sm font-semibold text-brand-300 hover:underline sm:hidden">
        See all deals →
      </Link>
    </section>
  );
}
