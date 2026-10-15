import { affiliateUrl, ebayLabel, ebaySealedQuery, ebaySearchUrl, isPaidLink } from "@/lib/affiliate";
import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure, PaidLinkTag } from "@/components/AffiliateDisclosure";
import { formatMoney } from "@/lib/format";
import type { SealedGroup } from "@/lib/sealed-import";
import type { Country } from "@/lib/country";
import { CheckedAgo } from "@/components/CheckedAgo";
import { SealedWatchButton } from "@/components/SealedWatchButton";
import {
  headlineOffer,
  offerStock,
  offerStockLabel,
  openStoreCount,
  rankOffers,
  type OfferStock,
  type SealedOffer,
} from "@/lib/sealed-offers";

// Extracted from /radiance-preorders — the per-product, per-store price card
// list, cheapest listing highlighted. Now shared with the Radiance hub
// (/sets/radiance) so a real cross-store table can render there too, rather
// than a second hand-rolled copy of this markup drifting from the original.
//
// Every price here is a PRE-ORDER: nothing has shipped, so the caller is
// expected to have sourced `groups` from getPreorderGroups() (never
// getSealedGroups(), which mixes in in-stock inventory), and the disclosure
// paragraph below says so explicitly.

// STOCK STATE (2026-09-24; DECISIONS.md "Sold-out pre-orders ranked as the
// cheapest"). Every offer carries a badge — "Pre-order open", "Sold out" or
// "Unknown" (a row the importer has not re-read inside STORE_ROWS_MAX_AGE_H) —
// and only OPEN offers may be a product's headline price or count as a store
// "taking pre-orders". This table used to take the cheapest row of all of them,
// which put Many Realms' sold-out US$119.99 box at the top of the page.
// lib/sealed-offers.ts holds the rules; this file only draws them.

// eBay FIRST (2026-10-15, owner: "move all the eBay rows to the top, even though
// it is the most expensive, and just say eBay may have a lower price"). This
// REVERSES the 2026-09-26 rule below that "the ranking is untouched": within each
// product, every OPEN eBay row now leads, cheapest eBay first, and the store rows
// follow in their usual price-and-stock order (orderPreorderRows). What did NOT
// change, and is what keeps the reversal honest:
//  - the headline price is still the cheapest OPEN offer from anyone, so pinning
//    a dearer eBay row never moves the number the product is sold on;
//  - the "+N%" over that cheapest offer still shows on the eBay row, so the page
//    never hides that it is dearer;
//  - every pinned row carries a "Shown first" tag beside its "Paid link" tag,
//    and the table's top line says open eBay listings come first — the pin is
//    labelled WHERE IT HAPPENS, not only in the footnote below the last product;
//  - the owner's "eBay may have a lower price" sits on the per-product "Search
//    eBay" line, NOT on the eBay row. The row is already the cheapest valid
//    listing the importer found (searchEbaySealed sorts by delivered cost and
//    keeps the best), so "may be lower than this listing" would have been false
//    there (strictly: it is the best by DELIVERED cost, and the table shows item
//    price, so a lower item price behind dearer postage can exist — the point
//    stands that the row was chosen for being the best). A SEARCH also covers
//    auctions and listings posted since our last check, so "may" is true on it. The row itself says what it is: the listing
//    at our last check, and that eBay prices change often;
//  - the footnote, /editorial-policy, /about, /privacy, /terms, /methodology,
//    the consulting FAQ and every "cheapest first" description of this page
//    now say this table pins eBay first, instead of promising an order it no
//    longer has.
// A stale or sold-out eBay row is NOT pinned: a greyed "Unknown" at the very top
// of a product would be the worst first impression the table could make.
//
// eBay (2026-09-26, "Pushing eBay clicks" in DECISIONS.md). eBay is the site's
// main affiliate partner and the owner asked for more of its clicks, including
// where a store is cheaper. The ranking was untouched then (see above for what
// changed on 2026-10-15) — and the "+N%" over the cheapest open offer still
// shows on an eBay row. What changed then is presentation, and what sits OUTSIDE
// the ranked list:
//  - an open eBay row reads "View on eBay" in eBay blue at the same ghost weight
//    as its neighbours, so a dearer paid row is never the one filled button;
//  - every paid row (eBay, TCGplayer) carries the "Paid link" tag, as the card
//    table's rows already did;
//  - under each product's list, a "Search eBay for <product>" line — a search,
//    not a ranked result, so it claims no price or stock. It is filled only when
//    no store has an open offer, where eBay sellers are the only route left.

/** Groups with an OPEN offer — what may be priced in structured data or a CTA. */
export function pricedPreorderGroups(groups: SealedGroup[]): SealedGroup[] {
  return sortByCheapestOpen(groups.filter((g) => g.lowestPriceCents != null && g.listings.length > 0));
}

/**
 * Every group with at least one listing, cheapest OPEN offer first; products
 * no store is currently taking orders on go last rather than vanishing — "sold
 * out everywhere" is itself worth knowing before release day.
 */
export function preorderTableGroups(groups: SealedGroup[]): SealedGroup[] {
  return sortByCheapestOpen(groups.filter((g) => g.listings.length > 0));
}

// The products most people come for lead the page (owner, 2026-10-15: "move the
// booster box, the booster packs up to the very top because they're the main
// ones"). Every other product follows, cheapest open offer first. Within a
// product, open eBay rows lead (orderPreorderRows, below) and the stores follow,
// ranked purely by price and stock.
export const LEAD_PRODUCT_TYPES = ["Booster Box", "Booster Pack"] as const;

function leadRank(g: SealedGroup): number {
  const i = (LEAD_PRODUCT_TYPES as readonly string[]).indexOf(g.productType);
  return i < 0 ? LEAD_PRODUCT_TYPES.length : i;
}

function sortByCheapestOpen(groups: SealedGroup[]): SealedGroup[] {
  return [...groups].sort(
    (a, b) => leadRank(a) - leadRank(b) || (a.lowestPriceCents ?? Infinity) - (b.lowestPriceCents ?? Infinity),
  );
}

const isEbayRetailer = (retailer: string) => retailer.startsWith("ebay");

/**
 * The order a product's rows are drawn in: every OPEN eBay row first (cheapest
 * eBay first), then everything else in rankOffers' order — open cheapest first,
 * then unknown, then sold out. See the 2026-10-15 note at the top of this file.
 */
export function orderPreorderRows<T extends SealedOffer & { retailer: string }>(
  rows: readonly T[],
  now: number = Date.now(),
): T[] {
  const ranked = rankOffers(rows, now);
  const pinned = ranked.filter((r) => isEbayRetailer(r.retailer) && offerStock(r, now) === "open");
  return [...pinned, ...ranked.filter((r) => !pinned.includes(r))];
}

/** The in-page anchor for a product's section, for the page's jump links. */
export function productAnchor(g: Pick<SealedGroup, "groupKey">): string {
  return `p-${g.groupKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

const BADGE: Record<OfferStock, string> = {
  open: "bg-emerald-500/15 text-emerald-300",
  soldout: "bg-red-500/10 text-red-300",
  unknown: "bg-ink-800 text-slate-400",
};

export function PreorderPriceTable({
  groups,
  country,
  currency,
  page = "/radiance-preorders",
  now = Date.now(),
}: {
  groups: SealedGroup[];
  country: Country;
  currency: string;
  /** The path this table renders on. It reaches the affiliate sub-id (EPN's
   *  customid) and buy_click's page_type: without it every click from this
   *  table — eBay included — reported as the HOMEPAGE ("<retailer>-home"),
   *  which hid the pre-order page's earnings inside the homepage's. */
  page?: "/radiance-preorders" | "/sets/radiance";
  /** Injected for tests; the page renders at request/ISR time. */
  now?: number;
}) {
  const pageType = page === "/sets/radiance" ? "set_hub" : "radiance_preorders";
  // EPN customid segment for the per-product search line, one per page.
  const searchSource = page === "/sets/radiance" ? "set-hub-product" : "preorders-product";
  const label = ebayLabel(country);
  const shown = preorderTableGroups(groups);
  if (shown.length === 0) return null;

  const storeCount = openStoreCount(shown.flatMap((g) => g.listings), now);

  return (
    <div>
      <p className="text-xs text-slate-500">
        {shown.length} product{shown.length === 1 ? "" : "s"} · {storeCount} store{storeCount === 1 ? "" : "s"} taking
        pre-orders · booster boxes and packs first · in each, open eBay listings first (paid links), then stores
        taking pre-orders cheapest first, then unconfirmed and sold-out ones
      </p>

      <div className="mt-4 space-y-4">
        {shown.map((g) => {
          const rows = orderPreorderRows(g.listings, now);
          // The cheapest OPEN offer from anyone, read from the UNPINNED ranking:
          // headlineOffer keeps the first of equal prices, so reading the pinned
          // list would have handed every price tie to eBay (final review,
          // 2026-10-15). Ties resolve exactly as they did before the pin.
          const headline = headlineOffer(rankOffers(g.listings, now), now);
          const open = openStoreCount(rows, now);
          return (
            <section key={g.groupKey} id={productAnchor(g)} className="card-surface scroll-mt-header overflow-hidden" data-group={g.groupKey}>
              <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-3">
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-white">{g.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {open > 0
                      ? `${open} store${open === 1 ? "" : "s"} taking pre-orders`
                      : "No store is taking pre-orders right now"}
                    {rows.length > open ? ` · ${rows.length - open} sold out or unconfirmed` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-right">
                  <div>
                    {headline ? (
                      <>
                        <div className="num text-lg font-extrabold text-brand-400" data-headline>
                          {formatMoney(headline.priceCents, currency)}
                        </div>
                        <div className="text-[11px] text-slate-500">cheapest open · {headline.retailerName}</div>
                      </>
                    ) : (
                      <div className="text-sm font-bold text-slate-400">Sold out everywhere</div>
                    )}
                  </div>
                  {/* Watch it (Plus/Premium, 2026-09-29): a restock or at-RRP
                      email for a pre-order that sells out — lib/sealed-watch.ts. */}
                  <SealedWatchButton groupKey={g.groupKey} name={g.name} market={country} compact />
                </div>
              </div>
              <ul className="divide-y divide-ink-800">
                {rows.map((l, rank) => {
                  const state = offerStock(l, now);
                  const isOpen = state === "open";
                  const overPct =
                    isOpen && headline && headline.priceCents > 0
                      ? Math.round(((l.priceCents - headline.priceCents) / headline.priceCents) * 100)
                      : 0;
                  const isEbay = isEbayRetailer(l.retailer);
                  // Exactly the rows orderPreorderRows moved to the top.
                  const pinned = isEbay && isOpen;
                  const paid = isPaidLink(affiliateUrl(l.url, l.retailer, page));
                  return (
                    <li
                      key={`${g.groupKey}-${l.retailer}`}
                      data-stock={state}
                      className={`flex items-center justify-between gap-3 px-4 py-2.5 ${isOpen ? "" : "opacity-60"}`}
                    >
                      <span className="min-w-0">
                        <span className={`block truncate text-sm ${isOpen ? "text-slate-300" : "text-slate-500"}`}>
                          {l.retailerName}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                          <span className={`rounded px-1.5 py-px font-semibold ${BADGE[state]}`}>
                            {offerStockLabel(state, true)}
                          </span>
                          <CheckedAgo iso={l.lastSeen} className="text-slate-500" />
                          {paid && <PaidLinkTag />}
                          {pinned && (
                            // The pin, labelled on the row it moved.
                            <span data-shown-first className="rounded bg-sky-500/10 px-1.5 py-px font-semibold text-sky-300">
                              Shown first
                            </span>
                          )}
                        </span>
                        {pinned && (
                          // What the row IS. Not "may be lower than this": it is
                          // already the cheapest valid listing the importer found.
                          <span data-ebay-note className="mt-0.5 block text-[11px] text-slate-500">
                            eBay listing at our last check — eBay prices change often
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        {overPct > 0 && <span className="num text-[11px] text-slate-500">+{overPct}%</span>}
                        <span
                          className={`num text-sm font-semibold ${isOpen ? "text-white" : "text-slate-500 line-through decoration-slate-600"}`}
                        >
                          {formatMoney(l.priceCents, currency)}
                        </span>
                        <OutboundLink
                          href={affiliateUrl(l.url, l.retailer, page)}
                          retailer={l.retailer}
                          country={country}
                          kind="sealed"
                          cardName={g.name}
                          price={l.priceCents / 100}
                          positionInList={rank + 1}
                          inStock={isOpen}
                          pageType={pageType}
                          surface="table"
                          // lnum only: tabular figures widen Inter's hyphen ('Pre -order').
                          // A sold-out or unconfirmed offer keeps its link (the store
                          // may restock) but loses the button: no emphasis on a
                          // purchase that probably cannot be made. An open eBay row
                          // is the same size and weight in eBay blue (2026-09-26).
                          className={
                            !isOpen
                              ? "px-2.5 py-1 text-xs text-slate-500 underline-offset-2 hover:underline"
                              : isEbay
                                ? "btn-ebay-ghost px-2.5 py-1 text-xs [font-feature-settings:'lnum'_1]"
                                : "btn-ghost px-2.5 py-1 text-xs [font-feature-settings:'lnum'_1]"
                          }
                        >
                          {!isOpen ? "View" : isEbay ? "View on eBay" : "Pre-order"}
                        </OutboundLink>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {/* OUTSIDE the ranked <ul> on purpose: a search of eBay, not a
                  result, so it can never read as a row of the comparison. */}
              <div
                data-ebay-search
                className={`flex items-center gap-2 border-t border-ink-800 ${headline ? "px-4" : "p-3"}`}
              >
                <PaidLinkTag className="shrink-0" />
                <OutboundLink
                  href={ebaySearchUrl(country, ebaySealedQuery(g.name, g.productType), searchSource)}
                  retailer="ebay_search"
                  country={country}
                  kind="sealed"
                  cardName={g.name}
                  pageType={pageType}
                  surface="ebay_search"
                  className={
                    headline
                      ? "flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 text-sm text-sky-300 underline-offset-2 hover:underline"
                      : "btn-ebay min-w-0 flex-1"
                  }
                >
                  <span className="min-w-0">
                    <span className="block">
                      Search {label} for {g.name}
                    </span>
                    {/* The owner's line, where it is true: a SEARCH covers
                        auctions and listings posted since our last check. */}
                    <span data-ebay-lower className="block text-[11px]">
                      eBay may have a lower price — listings change between our checks
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0">
                    →
                  </span>
                </OutboundLink>
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Every price above is a <strong className="text-slate-300">pre-order</strong> — the store is taking payment
        or a deposit now for stock that ships after release. &ldquo;Sold out&rdquo; means the store&apos;s own page
        said so when we last checked; &ldquo;Unknown&rdquo; means we have not been able to re-read it for three
        days. Pre-order prices move before release, and store terms
        differ, so confirm both at checkout.
      </p>
      {/* The per-link half of the disclosure is the "Paid link" tag on each paid
          row and search line; this is the plain-language half, then the network
          disclosure for the eBay and TCGplayer links (2026-09-26). It also says
          what the eBay search lines are, since they sit inside each product. */}
      <p className="mt-2 text-[11px] leading-snug text-slate-400">
        Links marked &ldquo;Paid link&rdquo; earn us a commission if you buy through them, at no extra cost to you.
        Open eBay listings are shown first in each product, tagged &ldquo;Shown first&rdquo;. They are paid links
        and are often not the cheapest, so compare the price beside each one. Every other row is sorted purely by
        price and stock, whether it pays us or not. The separate &ldquo;Search eBay&rdquo; links are searches of
        eBay, not ranked results.
      </p>
      <AffiliateDisclosure partner="both" tight />
    </div>
  );
}
