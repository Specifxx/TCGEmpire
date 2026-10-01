import Link from "next/link";
import type { Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { ebaySearchUrl } from "@/lib/affiliate";
import { kindInfo } from "@/lib/pokemon/kinds";
import { sourceWord } from "@/lib/pokemon/format";
import { pokemonEbayQuery } from "@/lib/pokemon/ebay-query";
import { formatPerPack } from "@/lib/pokemon/value";
import type { PkTile } from "@/lib/pokemon/types";
import { OutboundLink } from "../OutboundLink";
import { AffiliateDisclosure } from "../AffiliateDisclosure";

// A ranked price-per-pack table (/pokemon/price-per-pack). Server-rendered:
// every row's eBay search is built here with lib/affiliate.ts, where the
// campaign id is readable, and only the href reaches the client OutboundLink.
//
// LAYOUT: one table, no duplicate markup. From `md` up it is a table; below,
// each row becomes a compact two-line card (name and per-pack figure, then
// the listing, its packs and the eBay search), so a 390px screen never
// scrolls sideways, the longest ranking stays a reasonable scroll, and the
// audit (which drops <table> text as data) sees the same rows either way.
// The table's box scrolls on its own if a long name ever makes it wider than
// the column, so a cell is never clipped.

const CELL = "block md:table-cell md:px-2.5 md:py-2.5 md:align-middle";
const ROW =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-ink-800 px-3 py-2.5 last:border-b-0 md:table-row md:p-0";

/** The eBay column's header marker: these are affiliate searches. */
export function PaidLinksMarker() {
  return (
    <span
      className="chip ml-1 bg-ink-800 text-[10px] font-normal normal-case tracking-normal text-slate-400"
      title="We earn a commission on purchases through these links, at no extra cost to you."
    >
      Paid links
    </span>
  );
}

export function EbayRowLink({
  href,
  country,
  pageType,
  name,
  className = "w-full xl:w-auto",
}: {
  href: string;
  country: Country;
  pageType: string;
  name: string;
  className?: string;
}) {
  return (
    <OutboundLink
      href={href}
      retailer="pkmn_ebay_search"
      country={country}
      kind="sealed"
      pageType={pageType}
      surface="ebay_search"
      aria-label={`Search eBay for ${name}`}
      className={`btn-ebay-ghost min-h-11 whitespace-nowrap px-3 py-1.5 text-xs ${className}`}
    >
      Search eBay
    </OutboundLink>
  );
}

export function PerPackTable({
  tiles,
  currency,
  country,
  surface,
  pageType,
  caption,
  showKind = false,
  startRank = 1,
}: {
  tiles: readonly PkTile[];
  currency: string;
  country: Country;
  /** eBay customid surface, `pkmn-…`. */
  surface: `pkmn-${string}`;
  /** Analytics page_type, `pokemon_…`. */
  pageType: `pokemon_${string}`;
  caption: string;
  showKind?: boolean;
  startRank?: number;
}) {
  if (!tiles.length) return null;
  return (
    <div>
      <p className="mb-2 flex items-center gap-1 text-[11px] text-slate-500 md:hidden">
        <PaidLinksMarker /> The Search eBay buttons are paid links.
      </p>
      <div className="card-surface overflow-hidden md:overflow-x-auto">
        <table className="block w-full text-sm md:table">
          <caption className="sr-only">{caption}</caption>
          <thead className="hidden border-b border-ink-800 bg-ink-900/60 text-left text-[11px] uppercase tracking-wide text-slate-500 md:table-header-group">
            <tr>
              <th scope="col" className="px-2.5 py-2 font-semibold">
                #
              </th>
              <th scope="col" className="px-2.5 py-2 font-semibold">
                Product
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">
                Per pack
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">
                Cheapest listing
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">
                Packs
              </th>
              <th scope="col" className="px-2.5 py-2 font-semibold">
                eBay
                <PaidLinksMarker />
              </th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {tiles.map((t, i) => (
              <tr key={t.id} className={ROW}>
                <td className={`${CELL} hidden md:w-10`}>
                  <span className="num text-xs font-semibold text-slate-500">{startRank + i}</span>
                </td>
                <td className={`${CELL} flex min-w-0 gap-2 md:table-cell`}>
                  <span aria-hidden className="num pt-0.5 text-xs font-semibold text-slate-500 md:hidden">
                    {startRank + i}
                  </span>
                  <ProductCell tile={t} showKind={showKind} />
                </td>
                <td className={`${CELL} text-right`}>
                  <span className="num whitespace-nowrap font-bold text-accent">{formatPerPack(t.perPackCents as number, currency)}</span>
                </td>
                <td className={`${CELL} min-w-0 md:text-right`}>
                  <span className="num font-semibold text-white">{formatMoney(t.lowCents as number, currency)}</span>{" "}
                  <span className="text-xs text-slate-400">{sourceWord(t.lowSource)}</span>
                  {/* The Packs column is hidden on a phone; its figure rides here. */}
                  <span className="text-xs text-slate-400 md:hidden"> · {t.packCount} packs</span>
                </td>
                <td className={`${CELL} hidden md:table-cell md:text-right`}>
                  <span className="num">{t.packCount}</span>
                </td>
                <td className={CELL}>
                  <EbayRowLink
                    href={ebaySearchUrl(country, pokemonEbayQuery(t.name), surface)}
                    country={country}
                    pageType={pageType}
                    name={t.name}
                    className="w-auto"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AffiliateDisclosure partner="ebay" />
    </div>
  );
}

function ProductCell({ tile, showKind }: { tile: PkTile; showKind: boolean }) {
  return (
    <span className="inline-block min-w-0 align-top">
      <Link href={`/pokemon/sealed/${tile.slug}`} className="font-semibold text-white hover:text-brand-300 hover:underline">
        {tile.name}
      </Link>
      <span className="block text-xs text-slate-500">
        {showKind ? `${kindInfo(tile.kind).label} · ` : ""}
        {tile.setName ?? "No set"}
      </span>
    </span>
  );
}
