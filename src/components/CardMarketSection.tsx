"use client";

import { useEffect, useMemo, useState } from "react";
import { useCountry } from "./CountryProvider";
import { OutboundLink } from "./OutboundLink";
import { TcgMarketPrice } from "./TcgMarketPrice";
import { TcgplayerAd } from "./TcgplayerAd";
import { EbayAd } from "./EbayAd";
import { timeAgo } from "@/lib/format";
import { computeMarket, stockElsewhere, type ComputedRow, type MarketRow } from "@/lib/market-rows";
import { AffiliateDisclosure, PaidLinkTag } from "./AffiliateDisclosure";
import { COUNTRIES, COUNTRY_LIST } from "@/lib/country";
import { isFallbackRetailer, normaliseCondition, CONDITIONS } from "@/lib/constants";
import { isPaidLink } from "@/lib/affiliate";

// The market-dependent half of the card page. The page itself is ISR-cached with
// the AU baseline (no cookie reads server-side — that's what makes the route
// cacheable for Googlebot); these client components re-derive the visitor's market
// from the FULL serialized row set after hydration, so switching country never
// needs a server round-trip. SSR renders the AU default from CountryProvider, so
// crawlers see a complete, populated price table in the HTML.

// Per-market eBay fallback search, precomputed on the server (affiliate tagging is
// server-only). null = market has live eBay rows or the quota gate doesn't apply.
export type EbaySearchMap = Record<string, { url: string; label: string; nz: boolean } | null>;

// ONE visual language for every retailer CTA (UX audit finding: mixing eBay
// blue / TCGplayer navy / brand green by store read as three different kinds
// of button doing three different things, when they're all the exact same
// action — "buy this listing"). Brand-coloured buttons used to reason that a
// familiar marketplace colour converts better than a generic one; the
// counter-finding is that a single, consistent, unmissable primary colour is
// what actually makes the #1 row's CTA read as THE thing to click, on every
// row, every retailer, every page. Reuses the shared `.btn` base (layout/
// sizing) from globals.css. Exported so QuickView's compact price list uses
// the exact same treatment.
export function buyButtonClass(_retailer: string): string {
  return "btn-primary";
}
export function buyButtonLabel(retailer: string): string {
  if (retailer.startsWith("ebay")) return "Buy on eBay →";
  if (retailer.startsWith("tcgplayer")) return "Buy on TCGplayer →";
  return "View deal →";
}

function Metric({ label, value, highlight, sub }: { label: string; value: string; highlight?: boolean; sub?: string }) {
  return (
    <div className="rounded-lg bg-ink-900 p-2 sm:p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num text-lg font-bold ${highlight ? "text-accent" : "text-white"}`}>{value}</div>
      {sub && <div className="num text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

// Out-of-stock stores, closed by default behind a native <details> disclosure.
// A store's last-listed price (the "$19 ghost anchor under a $20 live price")
// trained visitors to wait for a price that isn't actually available — so the
// list, and every price/name in it, is not rendered into the DOM at all until
// a visitor opens it (not just visually hidden: `open &&` below unmounts the
// content, it isn't CSS display:none over text that's still there to read).
// A real <details>/<summary> rather than a styled button+state pair: native
// keyboard toggling and an `open` attribute for free, no ARIA to hand-roll.
//
// Module-scope, not declared inside CardPriceComparison's render body: a
// component defined inline in a parent's render gets a new identity every
// render, forcing React to unmount/remount it — which would silently reset
// this disclosure's own `open` state back to closed on every re-render of
// the parent (country switch, `mounted` flip, anything). The eBay panel's
// countdown-driven auctions view hit the identical bug from the identity
// side rather than the state side — same root cause, opposite symptom.
function OutOfStockDisclosure({
  oosList,
  country,
  displayName,
  fmt,
  mounted,
}: {
  oosList: ComputedRow[];
  country: string;
  displayName: string;
  fmt: (cents: number) => string;
  mounted: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (oosList.length === 0) return null;
  return (
    <details className="border-t border-ink-800" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center justify-between bg-ink-900/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 marker:content-none hover:text-slate-300">
        <span>
          {oosList.length} out-of-stock {oosList.length === 1 ? "store" : "stores"}
        </span>
        <span aria-hidden className="text-slate-600 transition-transform open:rotate-90">▸</span>
      </summary>
      {open && (
        <ul className="divide-y divide-ink-800">
          {oosList.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 opacity-60 sm:flex-nowrap sm:p-4">
              <div className="w-5 shrink-0 text-center text-slate-600 sm:w-6">—</div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-slate-300">{p.retailerName}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  {(() => {
                    const grade = normaliseCondition(p.condition);
                    return grade ? (
                      <span className="chip bg-ink-800 text-slate-400" title={`Store listed as "${p.condition}"`}>
                        {CONDITIONS[grade].label}
                      </span>
                    ) : (
                      p.condition && <span className="chip bg-ink-800 text-slate-400">{p.condition}</span>
                    );
                  })()}
                  <span className="text-slate-500">● Out of stock</span>
                  {mounted && <span>last seen {timeAgo(p.lastSeen)}</span>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="num text-lg font-bold text-slate-400 line-through">{fmt(p.priceCents)}</div>
              </div>
              {/* Plain text link, not a button — an out-of-stock row isn't a
                  primary CTA (see the WS1 CTA-hierarchy note above); this is
                  the site's only non-btn OutboundLink usage, deliberately. */}
              <OutboundLink
                href={p.buyHref}
                retailer={p.retailer}
                country={country}
                cardName={displayName}
                price={p.priceCents / 100}
                pageType="card_detail"
                inStock={false}
                variant={p.isFoil ? "foil" : "nonfoil"}
                condition={p.condition}
                surface="out_of_stock"
                className="order-last w-full basis-full text-center text-xs font-semibold text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-200 sm:order-none sm:w-auto sm:basis-auto"
              >
                Check →
              </OutboundLink>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

// Headline metrics under the card title: cheapest price, store count, and the
// card's play stats. One cheapest figure, not a standard/foil pair — see the
// note on the first Metric below.
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

  // WHICH MARKET THESE NUMBERS ARE FOR. Without saying so, this block read
  // "CHEAPEST PRICE —" / "IN STOCK AT 0 stores" for an AU visitor while the
  // generated About paragraph directly below said "one tracked store in the
  // United States has it, at US$91.06" — two true statements about two
  // different markets, presented as if they contradicted each other.
  //
  // The page is ISR-cached once for every market, so the prose CANNOT follow
  // the visitor's selection (see the note on `baseline` in card/[id]/page.tsx);
  // the prose therefore names its market, and so does this. Both are now
  // explicit rather than one of them being implicitly local.
  const place = COUNTRIES[country].place;

  // Stocked somewhere else but not here: the single most useful thing to say to
  // a visitor staring at "0 stores", and computable for free — `rows` already
  // carries every market's listings.
  const elsewhere = useMemo(
    () => (m.storeCount > 0 ? null : stockElsewhere(rows, country, COUNTRY_LIST)),
    [rows, country, m.storeCount],
  );

  return (
    <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:grid-cols-4 sm:gap-3">
      {/* ONE cheapest-price figure — the same `m.lowest` the price table's #1
          row shows, so the two can never disagree. This used to split into
          "Standard from" + a separate "✦ Foil from" tile whenever the card had
          any foil listing, which became an outright contradiction once the
          table below stopped splitting by finish: on a card whose cheapest
          copy IS the foil, the header read "Standard from US$12.00" directly
          above a table whose #1 row was badged "Cheapest" at US$5.00. Same
          rule as the price-history chart's "Now" (see PriceChart's
          nowOverrideCents): every headline price on this page comes from the
          one computeMarket() call. The foil premium is still spelled out —
          in the generated About prose, which has room to explain it, and on
          each foil row's own ✦ chip. */}
      <Metric
        label={`Cheapest price · ${place}`}
        value={m.lowest != null ? fmt(m.lowest) : "—"}
        sub={sub(m.lowest)}
        highlight
      />
      <Metric
        label={`In stock at · ${place}`}
        value={`${m.storeCount} ${m.storeCount === 1 ? "store" : "stores"}`}
        sub={
          elsewhere
            ? `${elsewhere.stores} ${elsewhere.stores === 1 ? "store" : "stores"} in ${elsewhere.markets === 1 ? elsewhere.first : "other markets"}`
            : undefined
        }
      />
      {/* No longer gated on "does this card have a foil" — that condition only
          existed to free up a grid slot for the removed ✦ Foil tile, which
          meant a card's own Might/Power silently vanished from the strip the
          day a store listed a foil of it. */}
      {energyCost != null && <Metric label="Energy" value={String(energyCost)} />}
      {might != null && <Metric label="Might" value={String(might)} />}
      {might == null && power != null && <Metric label="Power" value={String(power)} />}
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
  // ONE combined, price-ranked list — foil and non-foil listings are NOT split
  // into separate views. A [Standard][Foil][Graded] toggle briefly lived here
  // on a like-for-like-comparison argument; it was removed because the cost
  // outweighed it on every card. This table's job is "here is the cheapest
  // way to get this card, ranked" — splitting it hid the genuinely cheapest
  // listing behind a tab on any card with mixed printings, made two stores'
  // prices impossible to compare side by side, and imposed tab chrome on
  // every card page to serve a distinction the per-row "✦ Foil" chip
  // already makes inline, without hiding anything. Graded (slabbed) copies
  // stay where they've always been: the separate eBay panel below, which is
  // the right home for a listing type no tracked store carries.
  // TCGplayer publishes ONE USD market price; its US row is serialized onto every
  // card page (market-neutral — no country filter server-side). Convert it to the
  // visitor's currency and surface it as a reference — but ONLY in markets where
  // TCGplayer isn't already in the buyable table (US shows the native USD row, UK the
  // GBP `tcgplayer_uk` row), so it's purely additive for AU/NZ and never duplicates an
  // existing row. It's a reference figure regardless: it never feeds `prices`/
  // `storeCount`/the cheapest metrics (those come only from computeMarket).
  const tcg = useMemo(() => {
    // Suppress this block only where TCGplayer is ALREADY a buyable row in the
    // table above — in practice the US alone, since every converted variant is a
    // fallback retailer and computeMarket strips those from the comparison
    // entirely (see ALL_FALLBACK_RETAILERS).
    //
    // The test used to be a hand-listed "tcgplayer | tcgplayer_uk | tcgplayer_sg",
    // which hid the block from UK/SG visitors even though their converted row is
    // never rendered — so those markets saw no TCGplayer figure at all. Matching
    // every tcgplayer* retailer instead would have extended that to AU and CA.
    // Asking the real question — "is it in the table?" — fixes all four.
    const shownNatively = rows.some(
      (r) => r.retailer.startsWith("tcgplayer") && r.country === country && !isFallbackRetailer(r.retailer),
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
      <div className="card-surface mt-4 overflow-hidden sm:mt-6">
        <div className="flex items-center justify-between border-b border-ink-700 p-3 sm:p-4">
          <h2 className="font-bold text-white">
            Price comparison <span className="text-slate-500">({prices.length})</span>
          </h2>
          {/* Oldest row in the table, not the cheapest row's timestamp — a single
              "updated Xh ago" over the whole panel used the freshest row's stamp to
              describe every row, including ones seen far longer ago. Each row now
              also carries its own timestamp below (see the per-row meta line), so
              this header line is the panel's worst case, not its best. */}
          {mounted && prices.length > 0 && (
            <span className="text-xs text-slate-500">
              oldest listing {timeAgo(prices.reduce((old, p) => (p.lastSeen < old ? p.lastSeen : old), prices[0].lastSeen))}
            </span>
          )}
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
                    {/* Foil is a per-row BADGE, never a filter: a foil listing
                        ranks in this one combined list on its price like any
                        other, and says what it is right here. */}
                    {p.isFoil && <span className="chip bg-gold/15 font-semibold text-gold">✦ Foil</span>}
                    {/* Native grade (the store's own wording — a Shopify variant
                        title, TCGplayer's blanket "NM", eBay's raw-card scale) PLUS
                        our normalised grade, side by side, rather than showing only
                        one. Four marketplaces use four incompatible scales with no
                        official cross-marketplace mapping, so silently picking one
                        interpretation and calling it "the condition" compares
                        apples to oranges; showing both lets a buyer see exactly
                        what was translated from what (mapping published at
                        /methodology). */}
                    {(() => {
                      const grade = normaliseCondition(p.condition);
                      return grade ? (
                        <span className="chip bg-ink-800 text-slate-300" title={`Store listed as "${p.condition}"`}>
                          {CONDITIONS[grade].label}
                        </span>
                      ) : (
                        p.condition && <span className="chip bg-ink-800 text-slate-300">{p.condition}</span>
                      );
                    })()}
                    <span className="text-brand-400">● In stock</span>
                    <span>
                      {p.ship == null ? "postage at checkout" : p.ship === 0 ? "free postage" : `+ ${fmt(p.ship)} postage`}
                    </span>
                    {p.ship == null && p.policyUrl && (
                      <a
                        href={p.policyUrl}
                        target="_blank"
                        rel="sponsored nofollow noopener noreferrer"
                        className="text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-200"
                      >
                        shipping policy ↗
                      </a>
                    )}
                    {/* Per-row freshness — was only shown once for the whole panel
                        (see the header note above), using the CHEAPEST row's
                        timestamp for every row regardless of how stale that
                        specific listing actually was. */}
                    {mounted && <span>updated {timeAgo(p.lastSeen)}</span>}
                    {isPaidLink(p.buyHref) && <PaidLinkTag />}
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
                {/* Full-width below the row on phones; inline button on sm+. */}
                <OutboundLink
                  href={p.buyHref}
                  retailer={p.retailer}
                  country={country}
                  cardName={displayName}
                  price={p.priceCents / 100}
                  positionInList={i + 1}
                  pageType="card_detail"
                  inStock
                  variant={p.isFoil ? "foil" : "nonfoil"}
                  condition={p.condition}
                  surface="table"
                  className={`${buyButtonClass(p.retailer)} order-last w-full basis-full justify-center sm:order-none sm:w-auto sm:basis-auto`}
                >
                  {buyButtonLabel(p.retailer)}
                </OutboundLink>
              </li>
            ))}
          </ul>
        )}

        {/* Renders nothing when there are no out-of-stock rows, so it's safe to
            place once here rather than inside each branch above. */}
        <OutOfStockDisclosure oosList={outOfStock} country={country} displayName={displayName} fmt={fmt} mounted={mounted} />

        {/* Disclosure sits INSIDE the comparison panel, directly under the buy
            buttons it describes — not in the page footer. Wording names both
            partners explicitly and uses slate-400 for legibility (the old
            slate-600 "may earn a commission on some links" line was both vague
            and below contrast guidance).
            This is the ONE canonical disclosure for the whole price-comparison
            + TCGplayer-reference + ad-banner cluster below — TcgMarketPrice,
            TcgplayerAd and EbayAd all render in immediate succession after
            this and each carries its own disclosure prop, so they're told to
            stay quiet here rather than stacking 3-4 copies of the same
            "may earn a commission" line in one screenful. (The separate eBay
            listings/graded/auctions panel further down the page keeps its own
            — it's a genuinely distinct affiliate surface, not adjacent to
            this one.) */}
        <div className="border-t border-ink-800 p-3 text-center">
          <p className="text-[11px] text-slate-500">
            Prices are collected from public store listings and may change.
          </p>
          <AffiliateDisclosure partner="both" tight />
        </div>
      </div>

      {/* TCGplayer market price (reference, currency-converted) — rendered below the
          buyable table so it still appears on cards with no local listings.
          disclosure=false: covered by the canonical disclosure above. */}
      {tcg && <TcgMarketPrice usdCents={tcg.usdCents} usdCentsFoil={tcg.usdCentsFoil} href={tcg.href} disclosure={false} />}

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
          {/* Tracked, not a bare anchor. This panel used to be a plain <a>, so
              its clicks reached neither the database nor Vercel Analytics — and
              it is now the ONLY eBay path for every Common/Uncommon base print,
              since those no longer get an eBay listing search at all (see
              eBayWorthSearching). Whether that trade was right is exactly what
              this link's click rate answers, so it has to be measurable. */}
          <OutboundLink
            href={ebay.url}
            retailer="ebay_no_listing"
            country={country}
            cardName={displayName}
            pageType="card_detail"
            surface="table"
            className="btn-primary shrink-0 text-sm"
          >
            Search {ebay.label} →
          </OutboundLink>
        </div>
      )}

      {/* TCGplayer affiliate banner — pays commission on click-through
          purchases, so it gets the prime spot under the price table.
          disclosure=false: covered by the canonical disclosure above. */}
      <TcgplayerAd size="rect" mobile="rect" country={country} className="mt-6" disclosure={false} />

      {/* Contextual eBay banner — searches for THIS card (new, used & graded);
          the most relevant eBay placement converts far better than a generic one.
          disclosure=false: covered by the canonical disclosure above. */}
      <EbayAd size="leaderboard" country={country} query={ebayQuery} className="mt-4" disclosure={false} />
    </>
  );
}
