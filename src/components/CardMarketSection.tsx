"use client";

import { useEffect, useMemo, useState } from "react";
import { useCountry } from "./CountryProvider";
import { OutboundLink } from "./OutboundLink";
import { TcgMarketPrice } from "./TcgMarketPrice";
import { TcgplayerAd } from "./TcgplayerAd";
import { EbayAd } from "./EbayAd";
import { timeAgo } from "@/lib/format";
import { computeMarket, type MarketRow } from "@/lib/market-rows";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { outboundRel } from "@/lib/affiliate";

// The market-dependent half of the card page. The page itself is ISR-cached with
// the AU baseline (no cookie reads server-side — that's what makes the route
// cacheable for Googlebot); these client components re-derive the visitor's market
// from the FULL serialized row set after hydration, so switching country never
// needs a server round-trip. SSR renders the AU default from CountryProvider, so
// crawlers see a complete, populated price table in the HTML.

// Per-market eBay fallback search, precomputed on the server (affiliate tagging is
// server-only). null = market has live eBay rows or the quota gate doesn't apply.
export type EbaySearchMap = Record<string, { url: string; label: string; nz: boolean } | null>;

// Brand-coloured buy buttons for the two marketplaces users already recognise by
// colour — a familiar brand button converts better than a generic green one. Every
// other (independent-store) row keeps the plain site accent. Reuses the shared
// `.btn` base (layout/sizing) from globals.css, just swapping the colour utilities.
// Exported so QuickView's compact price list uses the exact same treatment.
export function buyButtonClass(retailer: string): string {
  if (retailer.startsWith("ebay")) return "btn bg-[#0064d2] text-white hover:bg-[#0079e6]";
  if (retailer.startsWith("tcgplayer")) return "btn bg-[#0a3161] text-white hover:bg-[#124a8f]";
  return "btn-primary";
}
export function buyButtonLabel(retailer: string): string {
  if (retailer.startsWith("ebay")) return "Buy on eBay →";
  if (retailer.startsWith("tcgplayer")) return "Buy on TCGplayer →";
  return "View deal →";
}

function Metric({ label, value, highlight, sub }: { label: string; value: string; highlight?: boolean; sub?: string }) {
  return (
    <div className="rounded-lg bg-ink-900 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num text-lg font-bold ${highlight ? "text-accent" : "text-white"}`}>{value}</div>
      {sub && <div className="num text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

// Headline metrics under the card title: cheapest standard/foil, store count, and
// the card's play stats (shown when there's room, mirroring the original layout).
export function CardPriceMetrics({
  rows,
  energyCost,
  might,
  power,
}: {
  rows: MarketRow[];
  energyCost: number | null;
  might: number | null;
  power: number | null;
}) {
  const { country, fmt, secondaryFmt } = useCountry();
  const m = useMemo(() => computeMarket(rows, country), [rows, country]);
  // For a European shopper browsing the UK market, `fmt` above already shows the
  // EUR-converted price; `secondaryFmt` gives back the real GBP figure (the one
  // that's actually charged) as a small reference note. null for everyone else.
  const sub = (gbpCents: number | null) => (gbpCents != null ? secondaryFmt(gbpCents) ?? undefined : undefined);

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Metric
        label={m.cheapestFoil != null ? "Standard from" : "Cheapest price"}
        value={(m.cheapestStandard ?? m.lowest) != null ? fmt((m.cheapestStandard ?? m.lowest)!) : "—"}
        sub={sub(m.cheapestStandard ?? m.lowest)}
        highlight
      />
      {m.cheapestFoil != null && <Metric label="✦ Foil from" value={fmt(m.cheapestFoil)} sub={sub(m.cheapestFoil)} highlight />}
      <Metric label="In stock at" value={`${m.storeCount} ${m.storeCount === 1 ? "store" : "stores"}`} />
      {energyCost != null && <Metric label="Energy" value={String(energyCost)} />}
      {might != null && m.cheapestFoil == null && <Metric label="Might" value={String(might)} />}
      {might == null && power != null && m.cheapestFoil == null && <Metric label="Power" value={String(power)} />}
    </div>
  );
}

// The price-comparison table + out-of-stock list + eBay fallback + the two
// contextual affiliate banners — everything that varies with the visitor's market.
export function CardPriceComparison({
  rows,
  displayName,
  ebaySearch,
  ebayQuery,
}: {
  rows: MarketRow[];
  displayName: string;
  ebaySearch: EbaySearchMap;
  ebayQuery: string;
}) {
  const { country, fmt, secondaryFmt } = useCountry();
  const m = useMemo(() => computeMarket(rows, country), [rows, country]);
  const { prices, outOfStock } = m;
  const ebay = m.hasEbay ? null : ebaySearch[country] ?? null;
  // TCGplayer publishes ONE USD market price; its US row is serialized onto every
  // card page (market-neutral — no country filter server-side). Convert it to the
  // visitor's currency and surface it as a reference — but ONLY in markets where
  // TCGplayer isn't already in the buyable table (US shows the native USD row, UK the
  // GBP `tcgplayer_uk` row), so it's purely additive for AU/NZ and never duplicates an
  // existing row. It's a reference figure regardless: it never feeds `prices`/
  // `storeCount`/the cheapest metrics (those come only from computeMarket).
  const tcg = useMemo(() => {
    const shownNatively = rows.some(
      (r) => (r.retailer === "tcgplayer" || r.retailer === "tcgplayer_uk" || r.retailer === "tcgplayer_sg") && r.country === country,
    );
    if (shownNatively) return null;
    const std = rows.find((r) => r.retailer === "tcgplayer" && !r.isFoil);
    const foil = rows.find((r) => r.retailer === "tcgplayer" && r.isFoil);
    const src = std ?? foil;
    if (!src) return null;
    return { usdCents: std?.priceCents ?? null, usdCentsFoil: foil?.priceCents ?? null, href: src.buyHref };
  }, [rows, country]);
  // Wall-clock-relative text ("updated 47m ago") is frozen in the ISR-cached HTML
  // and almost never matches the string recomputed at hydration — render it
  // client-only so it can't throw a hydration mismatch on every page view.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <div className="card-surface mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-700 p-4">
          <h2 className="font-bold text-white">
            Price comparison <span className="text-slate-500">({prices.length})</span>
          </h2>
          {mounted && prices[0] && <span className="text-xs text-slate-500">updated {timeAgo(prices[0].lastSeen)}</span>}
        </div>

        {prices.length === 0 && outOfStock.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            <p className="font-semibold text-white">No prices found yet</p>
            <p className="mt-1">
              We haven&apos;t matched this card to a store listing in this market. Check back soon —
              our price feeds refresh regularly.
            </p>
          </div>
        ) : prices.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">
            <p className="font-semibold text-white">Currently sold out everywhere</p>
            <p className="mt-1">
              {outOfStock.length} {outOfStock.length === 1 ? "store has" : "stores have"} listed
              this card but it&apos;s out of stock right now. See them below.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-800">
            {prices.map((p, i) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 hover:bg-ink-900/50 sm:flex-nowrap sm:p-4"
              >
                <div className="w-5 shrink-0 text-center text-sm font-bold text-slate-500 sm:w-6">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate font-semibold text-white">{p.retailerName}</span>
                    {/* The cheapest row is the one visitors should click — a small
                        badge draws the eye there, the same way a highlighted price
                        naturally pulls clicks. */}
                    {i === 0 && prices.length > 1 && (
                      <span className="chip shrink-0 bg-brand-500/20 text-[10px] font-bold uppercase tracking-wide text-brand-300">
                        Cheapest
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    {p.isFoil && <span className="chip bg-gold/15 font-semibold text-gold">✦ Foil</span>}
                    {p.condition && <span className="chip bg-ink-800 text-slate-300">{p.condition}</span>}
                    <span className="text-brand-400">● In stock</span>
                    <span>
                      {p.ship == null ? "postage at checkout" : p.ship === 0 ? "free postage" : `+ ${fmt(p.ship)} postage`}
                    </span>
                    {p.ship == null && p.policyUrl && (
                      <a
                        href={p.policyUrl}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-200"
                      >
                        shipping policy ↗
                      </a>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`num text-lg font-bold ${i === 0 ? "text-accent" : "text-white"}`}>
                    {fmt(p.priceCents)}
                  </div>
                  {secondaryFmt(p.priceCents) && (
                    <div className="num text-[11px] text-slate-500">≈ {secondaryFmt(p.priceCents)}</div>
                  )}
                  {p.ship != null && (
                    <div className="num text-[11px] text-slate-400">≈ {fmt(p.delivered)} delivered</div>
                  )}
                </div>
                {/* Full-width below the row on phones; inline button on sm+. Brand-
                    coloured for eBay/TCGplayer — a familiar brand button converts
                    better than a generic one users don't immediately recognise. */}
                <OutboundLink
                  href={p.buyHref}
                  retailer={p.retailer}
                  country={country}
                  className={`${buyButtonClass(p.retailer)} order-last w-full basis-full justify-center sm:order-none sm:w-auto sm:basis-auto`}
                >
                  {buyButtonLabel(p.retailer)}
                </OutboundLink>
              </li>
            ))}
          </ul>
        )}

        {outOfStock.length > 0 && (
          <div className="border-t border-ink-800">
            <div className="bg-ink-900/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Out of stock ({outOfStock.length}) · last listed price
            </div>
            <ul className="divide-y divide-ink-800">
              {outOfStock.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 opacity-60 sm:flex-nowrap sm:p-4">
                  <div className="w-5 shrink-0 text-center text-slate-600 sm:w-6">—</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-300">{p.retailerName}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      {p.condition && <span className="chip bg-ink-800 text-slate-400">{p.condition}</span>}
                      <span className="text-slate-500">● Out of stock</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="num text-lg font-bold text-slate-400 line-through">{fmt(p.priceCents)}</div>
                  </div>
                  <OutboundLink
                    href={p.buyHref}
                    retailer={p.retailer}
                    country={country}
                    className="btn-ghost order-last w-full basis-full justify-center sm:order-none sm:w-auto sm:basis-auto"
                  >
                    Check →
                  </OutboundLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Disclosure sits INSIDE the comparison panel, directly under the buy
            buttons it describes — not in the page footer. Wording names both
            partners explicitly and uses slate-400 for legibility (the old
            slate-600 "may earn a commission on some links" line was both vague
            and below contrast guidance). */}
        <div className="border-t border-ink-800 p-3 text-center">
          <p className="text-[11px] text-slate-500">
            Prices are collected from public store listings and may change.
          </p>
          <AffiliateDisclosure partner="both" tight />
        </div>
      </div>

      {/* TCGplayer market price (reference, currency-converted) — rendered below the
          buyable table so it still appears on cards with no local listings. */}
      {tcg && <TcgMarketPrice usdCents={tcg.usdCents} usdCentsFoil={tcg.usdCentsFoil} href={tcg.href} />}

      {/* eBay fallback — shown whenever this market has no live eBay row for the
          card, so a thin market is never a dead end (mirrors the NZ behaviour). */}
      {ebay && (
        <div className="card-surface mt-4 flex flex-wrap items-center justify-between gap-3 border-amber-500/25 bg-amber-500/[0.04] p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              No live {ebay.label} price for this card right now
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {ebay.nz
                ? <>New Zealand has no eBay marketplace of its own, but eBay Australia ships here — search it directly to see what&apos;s on offer for {displayName}.</>
                : <>We don&apos;t have a live {ebay.label} listing for {displayName} right now — search eBay directly to see what&apos;s on offer.</>}
            </p>
          </div>
          <a href={ebay.url} target="_blank" rel={outboundRel(ebay.url)} className="btn-primary shrink-0 text-sm">
            Search {ebay.label} →
          </a>
        </div>
      )}

      {/* TCGplayer affiliate banner — pays commission on click-through
          purchases, so it gets the prime spot under the price table. */}
      <TcgplayerAd size="rect" mobile="rect" country={country} className="mt-6" />

      {/* Contextual eBay banner — searches for THIS card (new, used & graded);
          the most relevant eBay placement converts far better than a generic one. */}
      <EbayAd size="leaderboard" country={country} query={ebayQuery} className="mt-4" />
    </>
  );
}
