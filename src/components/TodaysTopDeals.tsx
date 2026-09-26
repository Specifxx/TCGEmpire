"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { COUNTRIES, type Country } from "@/lib/country";
import type { CheapestEbayDeal, Deal, DealColumnKey, TopDeals } from "@/lib/top-deals";
import { formatMoney } from "@/lib/format";
import { isPaidLink } from "@/lib/affiliate";
import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure, PaidLinkTag } from "@/components/AffiliateDisclosure";
import { useCountry } from "@/components/CountryProvider";
import { NavIcon } from "@/components/NavIcon";
import { useQuickView } from "@/components/QuickView";
import { useMe } from "@/lib/use-me";
import { cardImageAlt } from "@/lib/image-alt";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense";
import { PremiumButton } from "@/components/PremiumButton";

// Homepage "Today's Top Deals". Up to four columns, one per signal (the grid
// itself only declares as many columns as actually have data — see GRID_COLS
// below). Each gated column (Biggest savings, Rising cards — full lists on the
// Plus tier) reveals only its single best pick, then a clearly-locked teaser
// whose button opens the Plus offer, when there's really more
// behind it, ONLY for a visitor who isn't already a paying member (see
// useMe() below — this used to gate on `def.premium` alone, which locked the
// column for every visitor including paying subscribers, since nothing here
// ever read their actual entitlement). The free columns (price drops, cheapest
// sealed) show in full. Empty columns (a signal with no data in this market)
// are dropped entirely.
//
// "undervalued" used to sit here as a fourth column — removed per an earlier
// homepage-declutter pass (not just hidden: lib/top-deals.ts no longer
// fetches it for this feed at all) on the reasoning that four competing
// signals read as "study this table," not "here's a deal." Rising Cards is
// today's actual fourth column, added back deliberately — see lib/top-deals.ts's
// header comment for why that call was reversed for this specific signal.
//
// "Cheapest on eBay" (2026-09-26) is NOT a fifth column: it is its own
// full-width block under the grid (CheapestOnEbay below), so the column
// layout above is untouched.
type ColumnDef = {
  key: DealColumnKey;
  label: string;
  premium: boolean;
  allHref: string;
  allLabel: string;
  // For a PREMIUM column, the sibling TopDeals field holding the REAL count
  // behind the gate — never derived from items.length, which is capped at
  // perType (4) for this feed regardless of how many deals actually exist.
  // Undefined for free columns (nothing gates them).
  totalKey?: "savingsVsMarketTotal" | "risingCardsTotal";
  // Attribution for the unlock button (lib/premium-surface.ts), gated columns only.
  surface?: string;
  // One-line explainer under the heading, for the two columns whose name alone
  // does not say what is being compared or ranked (2026-09-23, owner request).
  // "Rising" is phrased as a ranking by our signals, never a promise — the tool
  // itself is labelled "a research signal, not advice".
  sub?: string;
};

const COLUMNS: ColumnDef[] = [
  { key: "savingsVsMarket", label: "Biggest savings", sub: "Cards selling below the TCGplayer market price", premium: true, allHref: "/tools/deal-finder", allLabel: "All deals", totalKey: "savingsVsMarketTotal", surface: "gate:home-deals" },
  { key: "priceDrops", label: "Price drops", premium: false, allHref: "/movers", allLabel: "All movers" },
  { key: "cheapestSealed", label: "Cheapest sealed", premium: false, allHref: "/sealed", allLabel: "All sealed" },
  { key: "risingCards", label: "Rising cards", sub: "Cards ranked by demand and price-timing signals", premium: true, allHref: "/tools/rising", allLabel: "All rising cards", totalKey: "risingCardsTotal", surface: "gate:home-rising" },
];

// Budget tiers — "rounded to natural values per market" (not FX-converted at
// render time; these are UI filter buckets, like an e-commerce price facet, not
// a data claim). US$5 / US$25 are the anchor; other markets get a hand-rounded
// equivalent scaled to that currency's rough purchasing power.
type Tier = "all" | "small" | "mid" | "big";
const TIER_THRESHOLDS: Record<Country, { small: number; mid: number }> = {
  AU: { small: 800, mid: 4000 },
  US: { small: 500, mid: 2500 },
  UK: { small: 400, mid: 2000 },
  SG: { small: 700, mid: 3500 },
  CA: { small: 700, mid: 3500 },
  // US$5/US$25 at ~0.92 EUR/USD is €4.60/€23 — rounded to the same natural
  // filter buckets a European store's own price facet would use.
  EU: { small: 500, mid: 2500 },
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
  // rising-cards' pctLabel is a 0-100 screener SCORE, not a price change — the
  // only one of the four deal types where that distinction matters here.
  const text =
    deal.dealType === "savings-vs-market"
      ? `Save ${deal.pctLabel}%`
      : deal.dealType === "rising-cards"
      ? `Score ${deal.pctLabel}`
      : `−${deal.pctLabel}%`;
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

  const cls = "flex items-center gap-2.5 px-3 py-2.5 transition-colors duration-fast hover:bg-ink-900/50";
  if (deal.outboundUrl) {
    // pageType (2026-09-26): this link can be an eBay or TCGplayer listing, and
    // its buy_click used to arrive with no page at all.
    return (
      <li>
        <OutboundLink href={deal.outboundUrl} retailer={deal.outboundRetailer ?? "sealed"} country={country} kind="sealed" pageType="homepage" className={cls}>
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

// A deliberate "locked" state for the rest of a gated column's deals — NOT a
// loading skeleton (there's nothing pending; the data exists, it's just gated).
// One clear panel with a lock icon and an unlock CTA, sized to fill the same
// vertical space the blurred placeholder rows used to, so this column still
// matches its free-column neighbours' height without faking extra "rows".
//
// The CTA is the Plus-level gate (2026-09-25): both gated columns are full
// lists on the cheaper tier, so it opens the dialog on Plus (tier="plus") and
// names the tier the column's own chip names — it used to say "with Premium"
// under a "Plus" chip, and link to the tool page rather than the offer.
function LockedTeaser({ count, surface, tierName }: { count: number; surface: string; tierName: string }) {
  return (
    <li className="flex flex-1 flex-col items-center justify-center gap-1.5 px-3 py-6 text-center">
      <NavIcon name="lock" className="h-5 w-5 text-gold" />
      <PremiumButton surface={surface} tier="plus" className="text-xs font-bold text-gold hover:underline">
        Unlock {count} more with {tierName} →
      </PremiumButton>
    </li>
  );
}

// "Cheapest on eBay" (2026-09-26, "Pushing eBay clicks" in DECISIONS.md) — the
// owner's original deal feature, back as a full-width block UNDER the columns
// (a fifth column would squeeze a grid GRID_COLS already had to stretch).
// FREE and ungated: each row is one eBay affiliate link to the cheapest tracked
// copy of that card in the visitor's market, so it is a buy path, not an ad —
// no "Ad" label, no ad-free gate, shown to paid tiers too. Honest by rule: the
// price reads "delivered" only when the seller stated postage; the gap is
// measured against the cheapest store we track (lib/arbitrage.ts
// rankCheapestOnEbay); no savings total, no percentage badge, no urgency, and
// no link to the locked Deal Finder. eBay blue, never gold (gold marks Premium).
// The disclosure sits directly under the rows for every visitor.
function CheapestOnEbay({ rows, currency, country }: { rows: CheapestEbayDeal[]; currency: string; country: Country }) {
  if (rows.length === 0) return null;
  return (
    <section aria-label="Cheapest on eBay" className="mt-4 rounded-xl border border-[#0064d2]/40 bg-[#0064d2]/[0.06] p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2 px-1">
        <h3 className="text-sm font-extrabold text-white">Cheapest on eBay</h3>
        <PaidLinkTag />
      </div>
      <p className="mb-1 px-1 text-[11px] leading-snug text-slate-500">
        Cards where an eBay listing costs less than any store we track today
      </p>
      <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        {rows.map((d, i) => (
          <li key={d.cardId} className="min-w-0">
            <OutboundLink
              href={d.outboundUrl}
              retailer={d.outboundRetailer}
              country={country}
              kind="single"
              pageType="homepage"
              surface="cheapest_ebay"
              cardId={d.cardId}
              cardName={d.title}
              price={d.priceCents / 100}
              positionInList={i + 1}
              inStock
              className="flex min-h-11 items-center gap-2.5 rounded-md px-2 py-2.5 transition-colors duration-fast hover:bg-[#0064d2]/10"
            >
              <div className="h-11 w-8 shrink-0 overflow-hidden rounded bg-ink-900">
                {d.imageUrl && (
                  // Plain <img> for the same reasons as DealRow's thumbnail.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.imageUrl}
                    alt={cardImageAlt({ name: d.title })}
                    width={32}
                    height={44}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{d.title}</div>{" "}
                <div className="truncate text-[11px] text-slate-500">
                  <span className="num font-semibold text-up">{formatMoney(d.gapCents, currency)}</span> below the cheapest
                  store
                </div>
              </div>{" "}
              <div className="flex shrink-0 flex-col items-end">
                <span className="num text-sm font-bold text-accent">{formatMoney(d.priceCents, currency)}</span>{" "}
                <span className="text-[10px] text-slate-500">{d.postageKnown ? "delivered" : "+ postage"}</span>
              </div>
            </OutboundLink>
          </li>
        ))}
      </ul>
      <AffiliateDisclosure partner="ebay" tight className="px-1" />
    </section>
  );
}

// Column-count classes are looked up (not string-built) so Tailwind's build-time
// class scan can see every literal — the grid always matches how many columns
// actually have data today instead of a fixed count, which used to leave the
// right half of the row empty on days a signal or two had nothing to show.
//
// `1: ""` and every other entry start at sm:, because the grid element itself
// carries the phone layout (`grid-cols-1`, a shrinkable minmax(0,1fr) track).
// Without it the implicit auto track grew to ~356px and laid `/` out 372px
// wide on 320–360px phones. See tests/grid-base-columns.test.ts.
//
// 3 and 4 panels wait for xl (2026-09-23): from lg (1024) the 17rem desktop
// rail leaves main only ~704px wide, and four 164px panels there truncated
// every card name to 0–8px — a thumbnail and one letter per row. The 3-panel
// case (the "Under …"/"Big ticket" tabs, or any day a signal is empty) had the
// same defect from 640: names 0–31px at 640, 40–74 at 768, 35–68 at 1024. From
// sm to xl it is 2 columns with the LAST panel spanning the row, so no half-row
// is left empty — the reason this lookup exists. The `[&>*:last-child]`
// variant relies on the deal panels being the grid's direct children.
const GRID_COLS: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 xl:grid-cols-3 sm:[&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-1",
  4: "sm:grid-cols-2 xl:grid-cols-4",
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
  // Real entitlement, resolved client-side post-hydration — same reason
  // PriceWatchButton/CountryProvider do — so this section (part of the ISR-
  // cached homepage HTML, shared across every visitor) can still show a
  // Premium subscriber their own unlocked columns without busting that cache
  // per-user. `premium` defaults false until loaded, so a genuine subscriber
  // can see a brief locked flash before it resolves — the safe direction to
  // default in, since the alternative is a free visitor briefly seeing
  // unlocked Premium content.
  const { premium, premiumPlus } = useMe();
  const deals = dealsByCountry[country] ?? dealsByCountry.AU;
  const thresholds = TIER_THRESHOLDS[country] ?? TIER_THRESHOLDS.AU;
  const [tier, setTier] = useState<Tier>("all");

  // Tier-independent: is there ANYTHING to show today, in any tier? If not, the
  // section hides entirely (unchanged behaviour) rather than showing a shell
  // with tabs over nothing. The Cheapest on eBay block counts too (2026-09-26):
  // on a day it is the only thing with rows, it shows without the tier pills.
  const allColumns = COLUMNS.map((c) => ({ def: c, items: deals[c.key] })).filter((c) => c.items.length > 0);
  const ebayRows = deals.cheapestOnEbay;
  if (allColumns.length === 0 && ebayRows.length === 0) return null;

  // "All" mixes cheap-first (see mixByTier) so a Premium column's single
  // unlocked item is more often approachable; an explicit tier just filters,
  // keeping each signal's own order (biggest saving / drop first).
  const columns = allColumns
    .map(({ def, items }) => ({
      def,
      items: tier === "all" ? mixByTier(items, thresholds.mid) : items.filter((d) => inTier(d.priceCents, tier, thresholds)),
    }))
    .filter((c) => c.items.length > 0);
  // The grid's only outbound links are the Cheapest sealed rows, which can be
  // an eBay or TCGplayer listing (2026-09-26: they carried no disclosure). The
  // disclosure renders whenever one of the rows on screen is a paid link, and
  // not otherwise — a plain store link earns nothing, and saying it does would
  // be the inaccuracy PaidLinkTag's own rule guards against.
  const gridHasPaidLink = columns.some(({ items }) => items.some((d) => isPaidLink(d.outboundUrl)));

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
        <Link href="/tools/deal-finder" className="btn-ghost hidden text-sm sm:inline-flex">
          Browse all deals →
        </Link>
      </div>

      {/* Tier pills are 48px tall on TOUCH only (2026-09-23): they measured
          39/115/123/79 × 24px at 390, far under a thumb. Coarse-pointer-only,
          not `min-h-11` everywhere, so mouse desktops keep the 24px pill
          density; `inline-flex items-center` keeps the label centred when the
          pill grows. Not rendered when only the Cheapest on eBay block has
          rows: there would be no columns for them to filter. */}
      {allColumns.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter deals by price">
          {TIERS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tier === t.key}
              onClick={() => changeTier(t.key)}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition-colors [@media(pointer:coarse)]:min-h-12 ${
                tier === t.key ? "bg-brand-500 text-ink-950" : "bg-ink-900 text-slate-400 hover:bg-ink-800 hover:text-slate-200"
              }`}
            >
              {t.label(thresholds, fmtT)}
            </button>
          ))}
        </div>
      )}

      {allColumns.length === 0 ? null : columns.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-slate-400">
          No {TIERS.find((t) => t.key === tier)?.label(thresholds, fmtT).toLowerCase()} deals in {place} right now — try another filter.
        </div>
      ) : (
      <div className={`grid grid-cols-1 items-stretch gap-4 ${GRID_COLS[columns.length] ?? GRID_COLS[3]}`}>
        {columns.map(({ def, items }) => {
          // Premium columns normally reveal only the single best deal; the rest is
          // locked — "locked" means how many REAL deals exist behind it (totalKey,
          // NOT items.length — items is capped at perType=4 for this feed
          // regardless of how many real deals/picks exist, so a fixed filler count
          // would silently understate almost every day). A day with only 1 real
          // deal shows no locked teaser at all, since there's nothing behind it to
          // unlock — and `premium` (see useMe() above) means an actual subscriber
          // never sees a lock on their own column at all.
          //
          // WHILE ADSENSE_REVIEW_MODE IS ON, every column is shown in full and the
          // "Unlock N more with Premium" teaser is not rendered at all. A reviewer
          // landing on the homepage — the first page they see — must not find gated
          // content there; "content behind a paywall or login" is its own rejection
          // reason, and this was the only such teaser above the fold. The Premium
          // link stays as an ordinary CTA below the column; it just no longer stands
          // in place of content. Restored by setting
          // NEXT_PUBLIC_ADSENSE_REVIEW_MODE=false. See docs/adsense-remediation.md.
          const gated = def.premium && !premium && !ADSENSE_REVIEW_MODE;
          const shown = gated ? items.slice(0, 1) : items;
          const total = def.totalKey ? deals[def.totalKey] : items.length;
          const locked = gated ? Math.max(0, total - shown.length) : 0;
          return (
            <div key={def.key} className="card-surface flex h-full min-w-0 flex-col p-3 transition-colors duration-base hover:border-brand-500/60 hover:bg-ink-800">
              <div className="mb-1 flex items-center justify-between gap-2 px-1">
                <span className="flex items-center gap-1.5 text-sm font-extrabold text-white">
                  {def.label}
                </span>
                {/* Both gated columns (Deal Finder, Rising Cards) are FULL-LIST
                    tools on the cheaper Plus tier, so the badge names the lowest
                    tier that actually unlocks them — same rule as the tools
                    index. Badging them "Premium" would both over-quote the price
                    and tell an existing Plus member their own unlocked column
                    belongs to a tier they're not on. */}
                {def.premium && !ADSENSE_REVIEW_MODE && (
                  <span className="chip bg-gold/20 text-gold">{premiumPlus ? "Plus" : "Premium"}</span>
                )}
              </div>
              {def.sub && <p className="mb-1 px-1 text-[11px] leading-snug text-slate-500">{def.sub}</p>}

              <ul className="flex flex-1 flex-col divide-y divide-ink-800">
                {shown.map((deal, i) => (
                  <DealRow key={i} deal={deal} currency={currency} country={country} />
                ))}
                {locked > 0 && <LockedTeaser count={locked} surface={def.surface ?? "gate:home"} tierName={premiumPlus ? "Plus" : "Premium"} />}
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
      {/* Outside the grid, not a panel inside it: GRID_COLS' last-child span
          rule counts the grid's direct children. */}
      {gridHasPaidLink && <AffiliateDisclosure partner="both" tight />}

      <CheapestOnEbay rows={ebayRows} currency={currency} country={country} />
    </section>
  );
}
