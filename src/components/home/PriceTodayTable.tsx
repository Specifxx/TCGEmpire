import Link from "next/link";
import { COUNTRIES, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { ldJson } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";
import type { PriceTableRow } from "@/lib/price-table";

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
            {currency}. Updated daily.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
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
                <td className="px-4 py-2">
                  <Link href={cardHref(r)} className="font-semibold text-slate-100 hover:text-brand-300 hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-400">{r.setName}</td>
                <td className="num whitespace-nowrap px-3 py-2 text-right font-semibold text-white">
                  {formatMoney(r.priceCents, currency)}
                </td>
                <td className="num px-3 py-2 text-right text-slate-300">{r.stores || "—"}</td>
                <td className="num whitespace-nowrap px-4 py-2 text-right">
                  {r.change7d == null ? (
                    <span className="text-slate-600">—</span>
                  ) : (
                    // Buyer's-eye colours, as the watchlist and digest email use:
                    // a price drop is the good news (green), a rise is not.
                    <span className={r.change7d < 0 ? "text-up" : r.change7d > 0 ? "text-down" : "text-slate-400"}>
                      {r.change7d > 0 ? "+" : ""}
                      {r.change7d.toFixed(1)}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-ink-800 p-4 text-right sm:px-5">
        <Link href="/browse" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
          All {totalPriced.toLocaleString("en-US")} card prices →
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
