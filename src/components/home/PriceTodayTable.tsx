import Link from "next/link";
import { COUNTRIES, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { ldJson } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";
import type { PriceTableRow } from "@/lib/price-table";
import { cardArtThumb, cardImageSrc, cardImageSrcSet } from "@/lib/card-image-url";

// "Riftbound card prices today" — a SERVER-RENDERED price list directly under
// each market homepage's hero (lib/price-table.ts has the why). Rendered in the
// page's own market and currency: "/" is the US page, /au is AUD, and so on. It
// deliberately does not re-price on the client — the market pages exist so each
// one is a coherent, crawlable price list for its own market.
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

  return (
    <section id="prices-today" aria-labelledby="prices-today-h" className="card-surface scroll-mt-header overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-2 p-4 sm:p-5">
        <div>
          <h2 id="prices-today-h" className="text-xl font-extrabold text-white">
            Riftbound card prices today
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            The {rows.length} most-searched cards, with the cheapest in-stock price across {adjective} stores in{" "}
            {currency}. Updated daily. <span className="whitespace-nowrap">▼ green = cheaper this week.</span>
          </p>
        </div>
      </div>
      {/* Below 640px (2026-09-26): stacked rows, price always visible. The
          five-column table overflowed a 390px phone and clipped the price. */}
      <ul className="divide-y divide-ink-800 border-t border-ink-800 sm:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={cardHref(r)} className="flex min-h-11 items-center gap-3 px-4 py-2 hover:bg-ink-900/40">
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
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="border-y border-ink-800 bg-ink-900/60 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">Card</th>
              <th scope="col" className="px-3 py-2 font-semibold">Set</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Cheapest</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Stores in stock</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">7-day change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {rows.map((r) => (
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
                <td className="num whitespace-nowrap px-4 py-2 text-right">
                  <Change7d pct={r.change7d} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-ink-800 p-4 text-right sm:px-5">
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
