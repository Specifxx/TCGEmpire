"use client";

import { useEffect, useMemo, useState } from "react";
import { useCountry } from "./CountryProvider";
import { OutboundLink } from "./OutboundLink";
import { TcgMarketPrice } from "./TcgMarketPrice";
import { CardmarketPrice } from "./CardmarketPrice";
import { TcgplayerAd } from "./TcgplayerAd";
import { EbayAd } from "./EbayAd";
import { formatMoney, timeAgo } from "@/lib/format";
import { computeMarket, stockElsewhere, type ComputedRow, type MarketRow } from "@/lib/market-rows";
import { AffiliateDisclosure, PaidLinkTag } from "./AffiliateDisclosure";
import { ReportPriceButton } from "./ReportPriceButton";
import { COUNTRIES, COUNTRY_LIST, DEFAULT_COUNTRY } from "@/lib/country";
import { normaliseCondition, CONDITIONS, cardmarketRetailerFor } from "@/lib/constants";
import { tcgReferenceRows } from "@/lib/tcg-reference";
import { isPaidLink } from "@/lib/affiliate";
import { playedDiscounts, playedDiscountText } from "@/lib/played-discount";

// The market-dependent half of the card page. The page itself is ISR-cached with
// the AU baseline (no cookie reads server-side — that's what makes the route
// cacheable for Googlebot); these client components re-derive the visitor's market
// from the FULL serialized row set after hydration, so switching country never
// needs a server round-trip. SSR renders the AU default from CountryProvider, so
// crawlers see a complete, populated price table in the HTML.

// Per-market eBay fallback search, precomputed on the server (affiliate tagging is
// server-only). null = market has live eBay rows or the quota gate doesn't apply.
export type EbaySearchMap = Record<string, { url: string; label: string } | null>;

// ONE green for every retailer CTA, except eBay's (2026-09-26, "Pushing eBay
// clicks" in DECISIONS.md). The UX audit that set one colour found that eBay
// blue / TCGplayer navy / brand green by store read as three different kinds of
// button, and a single primary colour is what makes the #1 row's CTA read as
// the thing to click. The owner then asked for eBay's clicks to be pushed: eBay
// is the site's main affiliate partner and most of its revenue, including on
// cards where a store is cheaper. So an eBay row's button now wears eBay blue
// (`.btn-ebay`) — a familiar marketplace colour the eye picks out in the list.
// What changes is the COLOUR only: the row's POSITION never does. The table
// stays sorted by item price, the cheapest row keeps its "Cheapest" chip and
// accent price, and a dearer eBay row sits exactly where its price puts it.
// Reuses the shared `.btn` base (layout/sizing) from globals.css. Exported so
// QuickView's compact price list uses the exact same treatment.
export function buyButtonClass(retailer: string): string {
  return retailer.startsWith("ebay") ? "btn-ebay" : "btn-primary";
}
export function buyButtonLabel(retailer: string): string {
  if (retailer.startsWith("ebay")) return "Buy on eBay →";
  if (retailer.startsWith("tcgplayer")) return "Buy on TCGplayer →";
  return "View deal →";
}

function Metric({
  label,
  value,
  highlight,
  sub,
  className,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-lg bg-ink-900 p-2 sm:p-3 ${className ?? ""}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      {/* text-base until 2xl (was text-lg, 2026-09-23): 18px JetBrains Mono is
          ~10.8px a character, so "US$3,297.87" (≈116px) cannot fit the ~110px
          content box of a 4-up tile at 1280–~1310. 16px fits at every width,
          and from 1536 the tiles have at least 175px of content. */}
      <div className={`num text-base font-bold 2xl:text-lg ${highlight ? "text-accent" : "text-white"}`}>{value}</div>
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
// the parent (country switch, `mounted` flip, anything).
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
  // DISTINCT retailers, not row count — rows are unique per
  // [retailer, condition, isFoil], so one store listing both an NM and a foil
  // copy contributes two rows and would otherwise be announced as "2
  // out-of-stock stores". Same rule (and same reason) as computeMarket's own
  // storeCount for the in-stock side; these two counts sit a few hundred
  // pixels apart on the page and must be counted the same way.
  const storeCount = new Set(oosList.map((p) => p.retailer)).size;
  return (
    <details className="group border-t border-ink-800" onToggle={(e) => setOpen(e.currentTarget.open)}>
      {/* 48px on a coarse pointer only (2026-09-23; it measured 32px on a
          phone). Not a plain min-h-11: the touch floor in globals.css is
          touch-only by design ("a mouse sees no change at all"), so the mouse
          summary stays 32px. */}
      <summary className="flex cursor-pointer list-none items-center justify-between bg-ink-900/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 marker:content-none hover:text-slate-300 [@media(pointer:coarse)]:min-h-12">
        <span>
          {storeCount} out-of-stock {storeCount === 1 ? "store" : "stores"}
        </span>
        {/* group-open:, not open: — Tailwind's `open:` variant compiles to
            `&[open]`, which only ever matches the element carrying the
            attribute. [open] lands on the <details>, never on this <span>, so
            `open:rotate-90` here silently never fired and the chevron sat
            still whether the list was open or shut. Every other disclosure on
            the site already does it the working way (group on the <details>,
            group-open: on the marker). */}
        <span aria-hidden className="text-slate-600 transition-transform group-open:rotate-90">▸</span>
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
  // PINNED TO DEFAULT_COUNTRY — never useCountry()'s live, visitor-following
  // country. This is the headline stat block directly under the H1: the one
  // figure a crawler, an AI answer engine, or a visitor skimming the top of
  // the page treats as "the price of this card." The page's <title>, meta
  // description and Product JSON-LD (see card/[id]/page.tsx's `baseline`) are
  // ALL computed server-side from this same DEFAULT_COUNTRY baseline — this
  // block used to instead read useCountry() and silently relabel itself
  // "Cheapest price · Australia" in A$ for any visitor with a stored non-US
  // preference, so a cookie-less crawl and a live AU session disagreed about
  // the one number both were supposed to answer identically, with nothing on
  // the URL, title or canonical to explain why.
  //
  // Per-market pricing still belongs on this page — it's the whole point of
  // the site — it just belongs in a CLEARLY LABELED comparison instead of
  // silently overwriting the headline: CardMarketsTable's "price by market"
  // table names every row's own market explicitly, and the price-comparison
  // list right below this block does too (see its own "· place" heading) —
  // both are genuinely comparative displays, not a single claim of record.
  // This tile is the claim of record, so it stays fixed to what the record says.
  const place = COUNTRIES[DEFAULT_COUNTRY].place;
  const fmt = (cents: number) => formatMoney(cents, COUNTRIES[DEFAULT_COUNTRY].currency);
  const m = useMemo(() => computeMarket(rows, DEFAULT_COUNTRY), [rows]);

  // Stocked somewhere else but not here: the single most useful thing to say to
  // a visitor staring at "0 stores", and computable for free — `rows` already
  // carries every market's listings.
  const elsewhere = useMemo(
    () => (m.storeCount > 0 ? null : stockElsewhere(rows, DEFAULT_COUNTRY, COUNTRY_LIST)),
    [rows, m.storeCount],
  );

  // The column count follows the card page's DETAILS column, not the viewport
  // (2026-09-23; was grid-cols-3 → sm:grid-cols-4, which clipped the price by
  // 53px at 320 and 69px at 1024). The price gets its own full row where that
  // column is narrow: phones, 640–767px, and 1024–1279px, where the 17rem rail
  // plus the 160px art column leave the details column about 520px, so the
  // strip is ≈478px. It sits in a single 4-up row at md (the single-column
  // page, strip ≈678px) and from xl (details column ≥616px). The value is 16px
  // until 2xl — see Metric.
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
      {/* ONE cheapest-price figure, pinned to DEFAULT_COUNTRY (see the note
          above `place`) — this used to split into "Standard from" + a
          separate "✦ Foil from" tile whenever the card had any foil listing,
          which became an outright contradiction once the table below stopped
          splitting by finish: on a card whose cheapest copy IS the foil, the
          header read "Standard from US$12.00" directly above a table whose #1
          row was badged "Cheapest" at US$5.00. The foil premium is still
          spelled out — in the generated About prose, which has room to
          explain it, and on each foil row's own ✦ chip.
          No `sub` reference conversion here (unlike the price table's own
          rows): that only ever applies to a live UK-market-shown-as-EUR
          session, and this tile never shows a market other than the fixed
          US baseline. */}
      {/* A SOLD-OUT CARD SHOWS ITS LAST PRICE, not an em dash. The listing is
          still there and still priced; filtering out-of-stock rows out of the
          summary and rendering nothing threw away the only figure the page had.
          It matters more now that card pages are always indexable (see
          lib/card-price-state.ts) — a blank is what a crawler arrives to.
          Labelled "last seen" because it is not a price anyone can pay today and
          must never be mistaken for one.

          NO timeAgo() IN THIS TILE. The component has no `mounted` guard — the
          one further down belongs to CardPriceComparison — and the page is ISR
          with revalidate=86400, so a relative time baked into HTML up to a day
          old and recomputed at hydration is a mismatch waiting to happen. The
          exact date is already on the out-of-stock row lower down, which IS
          guarded. */}
      <Metric
        label={m.lowest == null && m.lastSeen ? `Last seen · ${place}` : `Cheapest price · ${place}`}
        value={m.lowest != null ? fmt(m.lowest) : m.lastSeen ? fmt(m.lastSeen.priceCents) : "—"}
        sub={m.lowest == null && m.lastSeen ? "out of stock" : undefined}
        highlight
        className="col-span-3 md:col-span-1 lg:col-span-3 xl:col-span-1"
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
  cardId,
  displayName,
  ebaySearch,
  ebayQuery,
  preRelease = false,
}: {
  rows: MarketRow[];
  cardId: string;
  displayName: string;
  ebaySearch: EbaySearchMap;
  ebayQuery: string;
  /** The card's set has not released (isPreorderSetCode): the eBay fallback
   *  says nothing ships before release instead of implying copies are out
   *  there now. Computed by the ISR page, which re-renders daily. */
  preRelease?: boolean;
}) {
  const { country, fmt, secondaryFmt } = useCountry();
  const m = useMemo(() => computeMarket(rows, country), [rows, country]);
  const { prices, outOfStock } = m;
  // One entry per STORE, from this market's rows — in-stock and out-of-stock
  // alike. Deduped because a store can appear on several rows (condition and
  // foil are part of RetailerPrice's key), and the report picker asks "which
  // store", not "which row": a visitor can see a wrong price, not a row id.
  const reportable = useMemo(() => {
    const byRetailer = new Map<string, { listingId: string; retailer: string; retailerName: string }>();
    for (const r of [...prices, ...outOfStock]) {
      if (!byRetailer.has(r.retailer)) {
        byRetailer.set(r.retailer, { listingId: r.id, retailer: r.retailer, retailerName: r.retailerName });
      }
    }
    return [...byRetailer.values()];
  }, [prices, outOfStock]);
  const ebay = m.hasEbay ? null : ebaySearch[country] ?? null;
  // "LP · 22% under the cheapest NM here" on each played in-stock row that has
  // an NM copy of the same finish in this market (lib/played-discount.ts). What
  // was worth keeping from the retired Condition Impact Calculator, from this
  // card's own listings: the rows already in `prices`, so no new query.
  const played = useMemo(() => playedDiscounts(prices), [prices]);
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
  // GBP `tcgplayer_uk` row), so it's purely additive for AU and never duplicates an
  // existing row. It's a reference figure regardless: it never feeds `prices`/
  // `storeCount`/the cheapest metrics (those come only from computeMarket).
  const tcg = useMemo(() => {
    // The suppression rule and the row choice now live in lib/tcg-reference.ts,
    // because the QuickView popup needs the identical decision and a second copy
    // of this predicate is how it broke the first time: it was a hand-listed
    // "tcgplayer | tcgplayer_uk | tcgplayer_sg", which hid the block from UK and
    // SG visitors even though their converted row is never rendered. Read that
    // file's header before changing the behaviour here.
    const ref = tcgReferenceRows(rows, country);
    if (!ref) return null;
    const src = ref.std ?? ref.foil;
    if (!src) return null;
    return {
      usdCents: ref.std?.priceCents ?? null,
      usdCentsFoil: ref.foil?.priceCents ?? null,
      // MarketRow arrives with its outbound link already affiliate-wrapped;
      // the QuickView wraps a raw url itself. That difference is why the shared
      // helper returns rows rather than a finished block.
      href: src.buyHref,
    };
  }, [rows, country]);
  // Cardmarket reference price — same shape as the TCGplayer block above, but
  // UK/EU only, and no currency conversion (the UK row is already GBP-converted
  // and the EU row is already native EUR at write time — see lib/cardmarket.ts).
  // Cardmarket is ALWAYS a fallback retailer (never natively shown in the table
  // above), unlike TCGplayer, so there's no "already shown natively" suppression
  // to check here.
  const cardmarket = useMemo(() => {
    const retailer = cardmarketRetailerFor(country);
    if (!retailer) return null;
    const row = rows.find((r) => r.retailer === retailer && r.country === country);
    if (!row) return null;
    return { priceCents: row.priceCents, href: row.buyHref, isEu: country === "EU" };
  }, [rows, country]);
  // Wall-clock-relative text ("updated 47m ago") is frozen in the ISR-cached HTML
  // and almost never matches the string recomputed at hydration — render it
  // client-only so it can't throw a hydration mismatch on every page view.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <div className="card-surface mt-4 overflow-hidden sm:mt-6">
        {/* flex-wrap + a nowrap stamp (2026-09-23): the stamp used to squeeze
            beside the H2 as three lines 76px wide at 320 and forced the H2
            onto two lines at 390. Now the stamp drops to its own single line
            when both don't fit. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-ink-700 p-3 sm:p-4">
          {/* Named by market, unlike before: this list follows the VISITOR's
              own market (useCountry()) rather than the page's fixed baseline
              — deliberately, since showing a shopper their own real, buyable
              local stores is the entire point of the table (see the file
              header). That is a different thing from CardPriceMetrics'
              headline tile above, which is pinned to one fixed market because
              it stands in for the page's own metadata claim — but naming
              this list's market too means the two can never read as silently
              contradicting each other just because neither says which
              market it's showing. */}
          <h2 className="font-bold text-white">
            Price comparison <span className="text-slate-500">({prices.length})</span>{" "}
            <span className="text-sm font-normal text-slate-500">· {COUNTRIES[country].place}</span>
          </h2>
          {/* Oldest row in the table, not the cheapest row's timestamp — a single
              "updated Xh ago" over the whole panel used the freshest row's stamp to
              describe every row, including ones seen far longer ago. Each row now
              also carries its own timestamp below (see the per-row meta line), so
              this header line is the panel's worst case, not its best. */}
          {mounted && prices.length > 0 && (
            <span className="whitespace-nowrap text-xs text-slate-500">
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
            {/* Distinct retailers, matching the disclosure's own count (see the
                note in OutOfStockDisclosure). And "expand … below" rather than
                the old "see them below": the list underneath is a
                closed-by-default disclosure, so there is nothing to see until
                the reader opens it — the copy has to name the action. */}
            <p className="mt-1">
              {(() => {
                const n = new Set(outOfStock.map((p) => p.retailer)).size;
                return `${n} ${n === 1 ? "store has" : "stores have"}`;
              })()}{" "}
              listed this card but it&apos;s out of stock right now — expand the list below to see
              their last known prices.
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
                    {(() => {
                      const d = played.get(p.id);
                      return d ? (
                        <span
                          className={d.pctUnder > 0 ? "text-slate-300" : "text-gold"}
                          title={`Compared with the cheapest in-stock Near Mint${p.isFoil ? " foil" : ""} copy in this list (${fmt(d.cheapestNmCents)}).`}
                        >
                          {playedDiscountText(d)}
                        </span>
                      ) : null;
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
                {/* Full-width below the row on phones; inline button on sm+.
                    xl:min-w-[11.25rem] (2026-09-23): the buttons were as wide as
                    their labels, so the row prices ended at x=1252/1269/1210 at
                    1440 — a 59px ragged edge where a column should be. 180px
                    clears the widest label ("Buy on TCGplayer →", 177px). A
                    min-width, not a fixed width, so a wider fallback font grows
                    the button instead of wrapping its label. */}
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
                  className={`${buyButtonClass(p.retailer)} order-last w-full basis-full justify-center sm:order-none sm:w-auto sm:basis-auto xl:min-w-[11.25rem]`}
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
            listings/graded panel further down the page keeps its own — it's a
            genuinely distinct affiliate surface, not adjacent to this one.) */}
        <div className="border-t border-ink-800 p-3 text-center">
          <p className="text-[11px] text-slate-500">
            Prices are collected from public store listings and may change.
          </p>
          {/* Directly under the sentence that admits these prices are scraped and
              can be wrong — which is the moment a visitor looking at a number
              that doesn't match the shop wants somewhere to say so. Out-of-stock
              rows are reportable too: "you list it as available and it isn't" is
              one of the issue types, and those rows are exactly where it
              happens.
              tap-link, not inline-block (2026-09-23): the button measured
              190x16. tap-link gives it the 24px WCAG 2.2 minimum on every
              pointer and 48px on a coarse one; the dotted underline survives
              inline-flex. */}
          <ReportPriceButton
            className="mt-1 tap-link"
            subject={{ kind: "card", cardId, name: displayName }}
            listings={reportable}
          />
          <AffiliateDisclosure partner="both" tight />
        </div>
      </div>

      {/* eBay fallback — shown whenever this market has no live eBay row for the
          card, so a thin market is never a dead end.

          DIRECTLY UNDER THE COMPARISON (2026-09-26, "Pushing eBay clicks" in
          DECISIONS.md), above the Cardmarket/TCGplayer reference blocks: it
          sat below both, the last block before the banners, although for a
          card with no eBay row it is the nearest way onto eBay from the table.
          It stays OUTSIDE the ranked panel above — a search, never a row, so
          it cannot outrank a store — and says what it is: a search, with no
          price or stock claimed. eBay blue rather than the old amber tint, to
          match the eBay buttons in the table, and its own disclosure. */}
      {ebay && (
        <div className="mt-4">
          <div className="card-surface flex flex-wrap items-center justify-between gap-3 border-[#0064d2]/40 bg-[#0064d2]/[0.06] p-4">
            <div className="min-w-0 flex-1 basis-56">
              <div className="text-sm font-semibold text-white">
                Search {ebay.label} for {displayName}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {preRelease
                  ? "This set hasn't released yet — eBay sellers set their own dispatch dates, so check each listing."
                  : `We have no ${ebay.label} price on file for this card right now — eBay sellers may still list it.`}
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
              cardId={cardId}
              cardName={displayName}
              pageType="card_detail"
              surface="ebay_fallback"
              className="btn-ebay shrink-0 text-sm"
            >
              Search {ebay.label} →
            </OutboundLink>
          </div>
          <AffiliateDisclosure partner="ebay" tight />
        </div>
      )}

      {/* Cardmarket reference price (UK/EU only) — see the `cardmarket` memo above.
          Not an affiliate link, so no AffiliateDisclosure prop to suppress here.

          FIRST of the two reference blocks, ABOVE TCGplayer, and only in the two
          markets it renders in at all. From a user, 2026-09-19: "I'd use the app
          to check faster on CardMarket prices, so I would like to have it not as
          a last option, but between the first ones." They are right about the
          ordering, and the reason is market-specific rather than a preference —
          European singles trade on Cardmarket, which is why the EU has eleven
          tracked shop websites for a whole continent (see the Cardmarket block
          in lib/price-import.ts). To a UK or EU visitor, a USD market price run
          through an FX rate is the less relevant of the two, so it should not be
          the one they reach first.

          What does NOT change is that this is a reference, below the buyable
          comparison, never a row in it — Cardmarket's figure is a marketplace
          LOW across every seller of the print, not one verified listing. That is
          THE RULE in lib/constants.ts, and it outranks ordering. */}
      {cardmarket && (
        <CardmarketPrice
          priceCents={cardmarket.priceCents}
          currency={COUNTRIES[country].currency}
          href={cardmarket.href}
          isEu={cardmarket.isEu}
        />
      )}

      {/* TCGplayer market price (reference, currency-converted) — rendered below the
          buyable table so it still appears on cards with no local listings.
          disclosure=false: covered by the canonical disclosure above. */}
      {tcg && <TcgMarketPrice usdCents={tcg.usdCents} usdCentsFoil={tcg.usdCentsFoil} href={tcg.href} disclosure={false} />}

      {/* Contextual eBay banner — searches for THIS card (new, used & graded).
          FIRST of the two banners (2026-09-26, "Pushing eBay clicks" in
          DECISIONS.md): eBay is the main affiliate partner, so its banner
          takes the prime spot under the price table that TCGplayer's held.
          Still an ad — "Ad" label, hidden for ad-free members — exactly as
          before; only the order changed.
          disclosure=false: covered by the canonical disclosure above. */}
      <EbayAd size="leaderboard" country={country} query={ebayQuery} className="mt-6" disclosure={false} pageType="card_detail" />

      {/* TCGplayer affiliate banner — pays commission on click-through
          purchases; second since 2026-09-26 (see the eBay banner above).
          disclosure=false: covered by the canonical disclosure above. */}
      <TcgplayerAd size="rect" mobile="rect" country={country} className="mt-4" disclosure={false} />
    </>
  );
}
