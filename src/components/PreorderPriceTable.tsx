import { affiliateUrl, ebayLabel, ebaySealedQuery, ebaySearchUrl, isPaidLink } from "@/lib/affiliate";
import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure, PaidLinkTag } from "@/components/AffiliateDisclosure";
import { formatMoney } from "@/lib/format";
import type { SealedGroup } from "@/lib/sealed-import";
import type { Country } from "@/lib/country";
import { CheckedAgo } from "@/components/CheckedAgo";
import {
  headlineOffer,
  offerStock,
  offerStockLabel,
  openStoreCount,
  rankOffers,
  type OfferStock,
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

// eBay (2026-09-26, "Pushing eBay clicks" in DECISIONS.md). eBay is the site's
// main affiliate partner and the owner asked for more of its clicks, including
// where a store is cheaper. The ranking is untouched — every row still sorts by
// price and stock, and the "+N%" over the cheapest open offer still shows on an
// eBay row. What changed is presentation, and what sits OUTSIDE the ranked list:
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

function sortByCheapestOpen(groups: SealedGroup[]): SealedGroup[] {
  return [...groups].sort((a, b) => (a.lowestPriceCents ?? Infinity) - (b.lowestPriceCents ?? Infinity));
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
        pre-orders · sorted by the cheapest open pre-order
      </p>

      <div className="mt-4 space-y-4">
        {shown.map((g) => {
          const rows = rankOffers(g.listings, now);
          const headline = headlineOffer(rows, now);
          const open = openStoreCount(rows, now);
          return (
            <section key={g.groupKey} className="card-surface overflow-hidden" data-group={g.groupKey}>
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
                <div className="shrink-0 text-right">
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
              </div>
              <ul className="divide-y divide-ink-800">
                {rows.map((l, rank) => {
                  const state = offerStock(l, now);
                  const isOpen = state === "open";
                  const overPct =
                    isOpen && headline && headline.priceCents > 0
                      ? Math.round(((l.priceCents - headline.priceCents) / headline.priceCents) * 100)
                      : 0;
                  const isEbay = l.retailer.startsWith("ebay");
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
                        </span>
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
                    Search {label} for {g.name}
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
        Every row above is sorted purely by price and stock, whether it pays us or not. The separate &ldquo;Search
        eBay&rdquo; links are searches of eBay, not ranked results.
      </p>
      <AffiliateDisclosure partner="both" tight />
    </div>
  );
}
