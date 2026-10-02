import { cardHref } from "@/lib/card-url";
import { cardThumbProps } from "@/lib/card-image-url";
import { displayRarity, domainInfo, rarityInfo, setByCode } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { cardSearchName } from "@/lib/card-name";
import type { GuideRow } from "@/lib/price-guide-query";
import { PriceGuideSortHeader } from "./PriceGuideSortHeader";
import { PriceGuideRows, type GuideRowProps } from "./PriceGuideRows";

// The price guide's one table (server-rendered): ≤100 rows per URL, every
// figure in the page's market and display currency.
//
// ONE <table> AT EVERY WIDTH, never a stacked phone list beside it (that renders
// every row and every anchor twice). `table-fixed` with widths on the narrow
// columns, so the Card column takes what is left and its name TRUNCATES — in
// auto layout a cell has no definite width and nothing ever truncates
// (IndexConstituents, 2026-09-23). Columns appear as the RESULTS column can
// hold them, not the viewport: the 17rem rail is permanent from lg and the
// filter sidebar joins from xl, so the table is narrower at 1280 than at 1024.
//   phones   Card · Lowest (7-day folded under it, rarity chip in line 2) · eBay
//   sm       + TCGplayer
//   md       + 7-day
//   2xl      + Rarity · Domain · Type · Stores, and 30-day once at least half
//            the priced rows have one
// (2026-10-02: the TCGplayer and eBay columns took Rarity's and Stores' room
// below 2xl; the rarity chip stays in line 2 until then.)
//
// The sticky header lives in an INNER scroller from sm up (the SetPriceGuide /
// IndexConstituents pattern) — never inside overflow-x-auto, and not on phones,
// where the two-column header is short and a nested scroll area traps the
// thumb.
export interface GuideTableItem {
  row: GuideRow;
  /** Display-currency cents in this market, or null. */
  price: number | null;
  /** The market's cheapest tracked eBay listing / TCGplayer figure, display cents, or null. */
  ebay: number | null;
  tcg: number | null;
  stores: number;
  d7: number | null;
  d30: number | null;
}

export function PriceGuideTable({
  items,
  currency,
  market,
  sort,
  showD30,
  caption,
}: {
  items: GuideTableItem[];
  currency: string;
  /** The page's market, for the eBay / TCGplayer buttons. */
  market: string;
  /** The resolved sort, for the headers' aria-sort. */
  sort: string;
  showD30: boolean;
  caption: string;
}) {
  return (
    <div className="card-surface overflow-hidden">
      <div className="sm:max-h-[75vh] sm:overflow-auto sm:overscroll-contain">
        <table className="pg-t w-full table-fixed text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr className="text-left [&>th]:border-b [&>th]:border-ink-700 [&>th]:bg-ink-900 sm:[&>th]:sticky sm:[&>th]:top-0 sm:[&>th]:z-10">
              <PriceGuideSortHeader label="Card" asc="name" first="asc" current={sort} className="pl-3 pr-2 sm:pl-4" />
              <th scope="col" className="hidden w-32 px-3 py-2 font-semibold 2xl:table-cell">
                Rarity
              </th>
              <th scope="col" className="hidden w-44 px-3 py-2 font-semibold 2xl:table-cell">
                Domain · Type
              </th>
              <PriceGuideSortHeader
                label="Lowest"
                desc="price_desc"
                asc="price_asc"
                current={sort}
                align="right"
                className="w-[6.75rem] pl-2 pr-3 sm:w-32"
              />
              <th scope="col" className="hidden w-[6.5rem] px-2 py-2 text-right font-semibold sm:table-cell">
                TCGplayer
              </th>
              <th scope="col" className="w-[5.25rem] px-2 py-2 text-right font-semibold sm:w-[6.5rem]">
                eBay
              </th>
              <PriceGuideSortHeader
                label="7-day"
                desc="change_desc"
                asc="change_asc"
                current={sort}
                align="right"
                className="hidden w-24 px-3 md:table-cell"
              />
              {showD30 && (
                <th scope="col" className="hidden w-24 px-3 py-2 text-right font-semibold 2xl:table-cell">
                  30-day
                </th>
              )}
              <PriceGuideSortHeader
                label="Stores"
                desc="stores_desc"
                asc="stores_asc"
                current={sort}
                align="right"
                className="hidden w-24 pl-2 pr-3 2xl:table-cell sm:pr-4"
              />
            </tr>
          </thead>
          <PriceGuideRows rows={items.map((it) => toRowProps(it, currency))} showD30={showD30} market={market} />
        </table>
      </div>
    </div>
  );
}

// Resolve everything server-side into PriceGuideRows' compact props: set name,
// display rarity, colours, the one 320w thumbnail (cardThumbProps maps a raw
// CDN URL onto the mirror; its srcSet is dropped — ~200 B a row, twice — since
// a 28px thumb never needs more) and the formatted price.
function toRowProps({ row: r, price, ebay, tcg, stores, d7, d30 }: GuideTableItem, currency: string): GuideRowProps {
  const rarity = rarityInfo(displayRarity({ setCode: r.set, collectorNumber: r.no, rarity: r.r }));
  const dom = domainInfo(r.dom);
  return {
    k: r.id,
    h: cardHref(r),
    i: (r.img && cardThumbProps({ imageThumbUrl: r.img }, "28px").src) || null,
    n: r.dn,
    s: setByCode(r.set)?.name ?? r.set,
    c: r.no,
    r: rarity.label,
    rc: rarity.color,
    d: dom.label,
    dc: dom.color,
    t: r.ty,
    // Lowest is stores + eBay already; clamped to the eBay figure beside it so
    // the two can never disagree by an import (the homepage table's rule).
    p: price != null || ebay != null ? formatMoney(Math.min(price ?? Infinity, ebay ?? Infinity), currency) : null,
    e: ebay != null ? formatMoney(ebay, currency) : null,
    g: tcg != null ? formatMoney(tcg, currency) : null,
    q: cardSearchName(r.n, { collectorNumber: r.no, rarity: r.r, variant: r.v ?? null, isPromo: !!r.promo }),
    nr: r.n,
    sc: r.set,
    rr: r.r,
    dr: r.dom,
    v: r.v ?? null,
    pr: r.promo,
    st: stores,
    w: d7,
    m: d30,
  };
}
