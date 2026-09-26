import Link from "next/link";
import { COUNTRIES, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { ldJson } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";
import type { PriceTableRow } from "@/lib/price-table";
import { cardArtThumb, cardImageSrc, cardImageSrcSet } from "@/lib/card-image-url";
import { affiliateUrl } from "@/lib/affiliate";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { PriceRowEbay } from "@/components/home/PriceRowEbay";

// "Riftbound card prices today" — a SERVER-RENDERED price list directly under
// each market homepage's hero (lib/price-table.ts has the why). Rendered in the
// page's own market and currency: "/" is the US page, /au is AUD, and so on. It
// deliberately does not re-price on the client — the market pages exist so each
// one is a coherent, crawlable price list for its own market.
//
// EBAY ON EVERY ROW (2026-09-26, "The homepage's eBay column" in DECISIONS.md):
// eBay is the site's main affiliate partner and this is the first thing under
// the hero, yet none of its rows led to eBay. Each row now ends in an eBay
// button (PriceRowEbay): the market's cheapest tracked listing, or a search. It
// is a column BESIDE the list — the rows stay ranked by demand, and "Cheapest"
// stays the cheapest across every source — with the EPN disclosure above the
// first row, for every visitor. The only thing in the table that follows the
// visitor rather than the page is that button's destination (see its header).
export function PriceTodayTable({
  rows,
  country,
  totalPriced,
}: {
  rows: PriceTableRow[];
  country: Country;
  /** Cards priced in this market, for the "All N card prices" link. */
  totalPriced: number;
}) {
  if (!rows.length) return null;
  const { currency, adjective } = COUNTRIES[country];
  // The page this table renders on, for the EPN customid ("/" is the US page).
  const homePath = country === "US" ? "/" : `/${country.toLowerCase()}`;
  const ebayCell = (r: PriceTableRow, i: number) => (
    <PriceRowEbay
      pageCountry={country}
      listing={r.ebay ? { retailer: r.ebay.retailer, priceCents: r.ebay.priceCents, href: affiliateUrl(r.ebay.url, "home_table", homePath) } : null}
      cheapestCents={r.priceCents}
      currency={currency}
      cardId={r.id}
      cardName={r.name}
      searchName={r.ebayQuery ?? r.name}
      position={i + 1}
    />
  );

  return (
    <section id="prices-today" aria-labelledby="prices-today-h" className="card-surface scroll-mt-header overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-2 p-4 sm:p-5">
        <div>
          <h2 id="prices-today-h" className="text-xl font-extrabold text-white">
            Riftbound card prices today
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            The {rows.length} most-searched cards, with the cheapest in-stock price across {adjective} stores in{" "}
            {currency}, and eBay beside each.{" "}
            {/* Phones (2026-09-26): the key line is CSS-hidden below sm (still
                in the HTML; ▲/▼ and the sr-only words carry direction without
                colour), so the first row and its eBay button reach the first
                screen. */}
            <span className="hidden sm:inline">
              Updated daily. <span className="whitespace-nowrap">▼ green = cheaper this week.</span>
            </span>
          </p>
          {/* Above the first eBay button, on first paint, for every visitor. */}
          <AffiliateDisclosure partner="ebay" tight />
        </div>
      </div>
      {/* Stacked rows, price always visible (2026-09-26): the five-column
          table overflowed a 390px phone and clipped the price. Below 768px, not
          640, since the eBay column: the six-column table needs ~670px and the
          sm band's scroller is 590–720px, which cut off the eBay button. */}
      <ul className="divide-y divide-ink-800 border-t border-ink-800 md:hidden">
        {rows.map((r, i) => (
          // Two SIBLING links (a link cannot nest another): the row to the card
          // page, and the eBay button at its right edge.
          <li key={r.id} className="flex items-center gap-2 pr-3 hover:bg-ink-900/40">
            <Link href={cardHref(r)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2 pl-4">
              <RowThumb row={r} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-100">{r.name}</span>
                <span className="block truncate text-xs text-slate-500">{r.setName}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="num block text-sm font-semibold text-white">{formatMoney(r.priceCents, currency)}</span>
                <span className="num block text-xs">
                  <Change7d pct={r.change7d} />
                </span>
              </span>
            </Link>
            {ebayCell(r, i)}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-y border-ink-800 bg-ink-900/60 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">Card</th>
              <th scope="col" className="px-3 py-2 font-semibold">Set</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Cheapest</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Stores in stock</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">7-day change</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">eBay</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {rows.map((r, i) => (
              <tr key={r.id} className="hover:bg-ink-900/40">
                <td className="px-4 py-1.5">
                  <Link href={cardHref(r)} className="flex items-center gap-2.5 font-semibold text-slate-100 hover:text-brand-300 hover:underline">
                    {/* Row thumbnail (2026-09-24). Decorative: the name beside it
                        is the link text. Fixed box so rows cannot shift. */}
                    <RowThumb row={r} />
                    {r.name}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-400">{r.setName}</td>
                <td className="num whitespace-nowrap px-3 py-2 text-right font-semibold text-white">
                  {formatMoney(r.priceCents, currency)}
                </td>
                <td className="num px-3 py-2 text-right text-slate-300">{r.stores || "—"}</td>
                <td className="num whitespace-nowrap px-3 py-2 text-right">
                  <Change7d pct={r.change7d} />
                </td>
                <td className="px-4 py-1.5">
                  <div className="flex justify-end">{ebayCell(r, i)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-ink-800 p-4 sm:px-5">
        {/* What the eBay column is, in words that stay true: an item price
            (postage extra) for a listing we track, or a search. Never "live",
            never "cheaper" — a tracked listing can be a day or three old. */}
        <p className="min-w-0 flex-1 basis-64 text-[11px] leading-snug text-slate-500">
          eBay: the cheapest in-stock listing we track for each card in this market (item price, postage extra), or a
          search of your own eBay where we track none.
        </p>
        <Link href="/browse" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
          See all {totalPriced.toLocaleString("en-US")} card prices →
        </Link>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Riftbound card prices today",
            itemListElement: rows.map((r, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: r.name,
              url: `${SITE_URL}${cardHref(r)}`,
            })),
          }),
        }}
      />
    </section>
  );
}

/** Row thumbnail (2026-09-24). Decorative: the name beside it is the link text. Fixed box so rows cannot shift. */
function RowThumb({ row }: { row: PriceTableRow }) {
  const img = cardImageSrc(row);
  return img ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={cardArtThumb(img)} srcSet={cardImageSrcSet(img) ?? undefined} sizes="28px" alt="" aria-hidden="true" width={28} height={39} loading="lazy" decoding="async" className="h-[39px] w-7 shrink-0 rounded-sm object-cover" />
  ) : (
    <span aria-hidden="true" className="h-[39px] w-7 shrink-0 rounded-sm bg-ink-800" />
  );
}

function Change7d({ pct }: { pct: number | null }) {
  return (
    <>
      {pct == null ? (
        <span className="text-slate-600">—</span>
      ) : (
        // Buyer's-eye colours, as the watchlist and digest email use:
        // a price drop is the good news (green), a rise is not. That
        // is the reverse of TCGplayer/PriceCharting, so the meaning
        // is never colour-only (2026-09-24): ▲/▼ give the direction
        // at a glance and the sr-only text says it in words.
        <span className={pct < 0 ? "text-up" : pct > 0 ? "text-down" : "text-slate-400"}>
          <span aria-hidden="true">{pct > 0 ? "▲ " : pct < 0 ? "▼ " : ""}</span>
          <span className="sr-only">
            {pct > 0 ? "Price up " : pct < 0 ? "Price down " : "Unchanged "}
          </span>
          {pct > 0 ? "+" : ""}
          {pct.toFixed(1)}%
        </span>
      )}
    </>
  );
}
