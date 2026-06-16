import type { Metadata } from "next";
import Link from "next/link";
import { getArbitrage, getArbSources, EBAY_FEE, type ArbSort } from "@/lib/arbitrage";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { OutboundLink } from "@/components/OutboundLink";
import { ArbitrageFilters } from "@/components/ArbitrageFilters";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Riftbound Arbitrage — Buy From Stores, Sell On eBay | RiftCompare" },
  description:
    "Live Riftbound arbitrage: pick your buy and sell sources (stores + eBay) and see the cards with the biggest profit after fees. Sortable by profit or margin, paginated, updated daily. Free.",
  alternates: { canonical: "/tools/arbitrage" },
  openGraph: { title: "Riftbound Arbitrage Finder", url: `${SITE_URL}/tools/arbitrage` },
};

const PAGE_SIZE = 25;
const SORTS: { key: ArbSort; label: string }[] = [
  { key: "profit", label: "Most profit" },
  { key: "margin", label: "Best margin" },
];

export default async function ArbitragePage({ searchParams }: { searchParams: { sort?: string; page?: string; buy?: string; sell?: string } }) {
  const country = getCountry();
  const info = COUNTRIES[country];
  const sources = getArbSources(country);
  const storeKeys = sources.filter((s) => !s.isEbay).map((s) => s.key);
  const ebay = sources.find((s) => s.isEbay);

  // Sell is fixed to eBay — the only marketplace we can price a resale on right now.
  // Buy defaults to every store (= cheapest store) and is fully selectable.
  const parse = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);
  const buy = parse(searchParams.buy) ?? storeKeys;
  const sell = ebay ? [ebay.key] : [];
  const sort: ArbSort = searchParams.sort === "margin" ? "margin" : "profit";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const data = await getArbitrage(country, { buy, sell, sort, page, pageSize: PAGE_SIZE });
  const href = (p: number) => `/tools/arbitrage?buy=${buy.join(",")}&sell=${sell.join(",")}&sort=${sort}&page=${p}`;
  const sortHref = (s: ArbSort) => `/tools/arbitrage?buy=${buy.join(",")}&sell=${sell.join(",")}&sort=${s}&page=1`;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Arbitrage</span>
        </nav>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">💱 Arbitrage Finder</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Buy a card cheap from a {info.adjective} store and resell it on <strong className="text-slate-200">eBay</strong> for a
          profit. Pick which stores to buy from below (default: the cheapest). Net figures are after an estimated{" "}
          {Math.round(EBAY_FEE * 100)}% eBay fee; postage and your time aren&apos;t included.
        </p>
        <p className="mt-1.5 text-xs text-slate-500">
          eBay is the only marketplace we can price a resale on right now. Know another store that buys cards?{" "}
          <Link href="/contact" className="text-brand-400 hover:underline">Email us</Link> and we&apos;ll add it as a sell option.
        </p>
      </div>

      {!ebay ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          eBay arbitrage isn&apos;t available in {info.place} yet — it&apos;s eBay-only for now, and eBay doesn&apos;t cover this market.
        </div>
      ) : (
        <>
      {/* Source pickers + sort */}
      <div className="card-surface mb-4 flex flex-wrap items-end justify-between gap-4 p-4">
        <ArbitrageFilters sources={sources} buy={buy} sell={sell} sort={sort} />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sort</div>
          <div className="mt-0.5 flex gap-1">
            {SORTS.map((s) => (
              <Link
                key={s.key}
                href={sortHref(s.key)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${sort === s.key ? "bg-brand-500/20 text-brand-200" : "bg-ink-900 text-slate-400 hover:text-white"}`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {data.items.length === 0 ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          No profitable arbitrage for these sources right now in {info.place}. Try widening the buy or sell side.
        </div>
      ) : (
        <>
          <div className="card-surface overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Card</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Buy</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Sell</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Net profit</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {data.items.map((it) => (
                  <tr key={it.id} className="hover:bg-ink-900/50">
                    <td className="px-4 py-2">
                      <Link href={`/card/${it.slug ?? it.id}`} className="flex items-center gap-2.5">
                        {it.imageThumbUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.imageThumbUrl} alt="" width={28} height={39} loading="lazy" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-white">{it.name}</span>
                          <span className="block text-[11px] text-slate-500">{it.setCode} · {it.collectorNumber}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <OutboundLink href={it.buyUrl} retailer={it.buyStore} country={country} className="font-semibold text-white hover:text-brand-400">
                        {formatMoney(it.buyCents, info.currency)}
                      </OutboundLink>
                      <div className="truncate text-[10px] text-slate-500" title={it.buyStoreName}>{it.buyStoreName}</div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <OutboundLink href={it.sellUrl} retailer={it.sellIsEbay ? "ebay_arb" : it.buyStore} country={country} className="font-semibold text-slate-200 hover:text-brand-400">
                        {formatMoney(it.sellCents, info.currency)}
                      </OutboundLink>
                      <div className={`truncate text-[10px] ${it.sellIsEbay ? "text-sky-400" : "text-slate-500"}`}>{it.sellName}</div>
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-brand-400">+{formatMoney(it.netCents, info.currency)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-brand-300">{it.marginPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-xs text-slate-500">{data.total} opportunities · page {data.page} of {data.pageCount}</span>
            <div className="flex gap-2">
              {data.page > 1 && <Link href={href(data.page - 1)} className="btn-ghost text-sm">← Prev</Link>}
              {data.page < data.pageCount && <Link href={href(data.page + 1)} className="btn-ghost text-sm">Next →</Link>}
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
            Buy / Sell are the cheapest current prices on the sources you selected. Net = sell − (eBay sales attract a
            ~{Math.round(EBAY_FEE * 100)}% fee) − buy; it excludes postage, supplies and your time, and thin or one-off
            listings can mislead — sanity-check the card page before you commit.
          </p>
        </>
      )}
        </>
      )}
    </div>
  );
}
