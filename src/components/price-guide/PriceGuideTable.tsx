import { cardHref } from "@/lib/card-url";
import { cardThumbProps } from "@/lib/card-image-url";
import { displayRarity, domainInfo, rarityInfo, setByCode } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
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
//   phones   Card · Price (7-day folded under it, rarity chip in line 2)
//   sm       + 7-day · Stores
//   md       + Rarity
//   2xl      + Domain · Type, and 30-day once at least half the priced rows have one
//
// The sticky header lives in an INNER scroller from sm up (the SetPriceGuide /
// IndexConstituents pattern) — never inside overflow-x-auto, and not on phones,
// where the two-column header is short and a nested scroll area traps the
// thumb.
export interface GuideTableItem {
  row: GuideRow;
  /** Display-currency cents in this market, or null. */
  price: number | null;
  stores: number;
  d7: number | null;
  d30: number | null;
}

export function PriceGuideTable({
  items,
  currency,
  sort,
  showD30,
  caption,
}: {
  items: GuideTableItem[];
  currency: string;
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
              <th scope="col" className="hidden w-32 px-3 py-2 font-semibold md:table-cell">
                Rarity
              </th>
              <th scope="col" className="hidden w-44 px-3 py-2 font-semibold 2xl:table-cell">
                Domain · Type
              </th>
              <PriceGuideSortHeader
                label="Price"
                desc="price_desc"
                asc="price_asc"
                current={sort}
                align="right"
                className="w-[6.75rem] pl-2 pr-3 sm:w-32"
              />
              <PriceGuideSortHeader
                label="7-day"
                desc="change_desc"
                asc="change_asc"
                current={sort}
                align="right"
                className="hidden w-24 px-3 sm:table-cell"
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
                className="hidden w-24 pl-2 pr-3 sm:table-cell sm:pr-4"
              />
            </tr>
          </thead>
          <PriceGuideRows rows={items.map((it) => toRowProps(it, currency))} showD30={showD30} />
        </table>
      </div>
    </div>
  );
}

// Resolve everything server-side into PriceGuideRows' compact props: set name,
// display rarity, colours, the one 320w thumbnail (cardThumbProps maps a raw
// CDN URL onto the mirror; its srcSet is dropped — ~200 B a row, twice — since
// a 28px thumb never needs more) and the formatted price.
function toRowProps({ row: r, price, stores, d7, d30 }: GuideTableItem, currency: string): GuideRowProps {
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
    p: price != null ? formatMoney(price, currency) : null,
    st: stores,
    w: d7,
    m: d30,
  };
}
