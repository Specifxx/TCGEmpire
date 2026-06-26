import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getMarketIndex, INDEX_SIZE, type MarketScope } from "@/lib/market-index";
import { IndexChart } from "@/components/IndexChart";
import { MarketSwitcher } from "@/components/MarketSwitcher";
import { COUNTRIES, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";
import { AdSlot } from "@/components/AdSlot";
import { Reveal } from "@/components/Reveal";

// Recompute at most twice an hour — the underlying PriceHistory only changes on
// the daily import, but search-driven constituents drift during the day.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: { absolute: "The RiftCompare Index — Riftbound Market Tracker | RiftCompare" },
  description:
    "One number for the health of the global Riftbound TCG market. The RiftCompare Index tracks the prices of the most-searched Riftbound cards as a weighted daily index — like a stock index for the game. Switch to any region. Updated daily, free to cite.",
  keywords: [
    "RiftCompare Index",
    "Riftbound market index",
    "Riftbound card market",
    "Riftbound prices tracker",
    "Riftbound market health",
    "TCG market index",
  ],
  alternates: { canonical: "/market" },
  openGraph: {
    title: "The RiftCompare Index — the Riftbound market in one number",
    description:
      "A weighted daily index of the most-searched Riftbound cards — like a stock index for the game. Global by default, switchable by region. Updated daily, free to cite.",
    url: `${SITE_URL}/market`,
  },
};

function parseMarket(v?: string): MarketScope {
  const up = (v ?? "").toUpperCase();
  return up === "AU" || up === "NZ" || up === "US" || up === "UK" ? (up as Country) : "GLOBAL";
}

function Delta({ label, pct }: { label: string; pct: number | null }) {
  if (pct == null) return null;
  const up = pct > 0;
  const flat = pct === 0;
  return (
    <div className="rounded-lg bg-ink-900 px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-extrabold ${flat ? "text-slate-300" : up ? "text-rose-400" : "text-brand-400"}`}>
        {flat ? "—" : `${up ? "▲" : "▼"} ${Math.abs(pct)}%`}
      </div>
    </div>
  );
}

export default async function IndexPage({ searchParams }: { searchParams: { market?: string } }) {
  const market = parseMarket(searchParams.market);
  const isGlobal = market === "GLOBAL";
  const index = await unstable_cache(() => getMarketIndex(market), ["market-index", market], {
    revalidate: 1800,
  })();

  // Display chrome. GLOBAL has no single currency/region, so prices fall back to the
  // composite's reference region (carried on the index as `currency`/`priceMarket`).
  const heading = isGlobal ? "🌍 Global" : `${COUNTRIES[market as Country].flag} ${COUNTRIES[market as Country].code}`;
  const currency = index?.currency ?? (isGlobal ? "USD" : COUNTRIES[market as Country].currency);
  const priceMarket = index?.priceMarket ?? "AU";

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "RiftCompare Index", item: `${SITE_URL}/market` },
    ],
  };
  const datasetLd = index
    ? {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "The RiftCompare Index",
        description: `Daily weighted price index of the ${index.constituents.length} most-searched Riftbound TCG cards${isGlobal ? " across every market we track" : ""}. Base 100 on ${index.startDay}.`,
        url: `${SITE_URL}/market`,
        creator: { "@type": "Organization", name: "RiftCompare", url: SITE_URL },
        license: `${SITE_URL}/market#cite`,
        temporalCoverage: `${index.startDay}/..`,
      }
    : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetLd ? [breadcrumbLd, datasetLd] : [breadcrumbLd]) }}
      />

      {/* Breadcrumb + hero */}
      <div>
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">RiftCompare Index</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">📊 The RiftCompare Index</h1>
          <MarketSwitcher value={market} />
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          The Riftbound market in one number. The Index tracks the live prices of the{" "}
          {index?.constituents.length ?? INDEX_SIZE} most-searched cards on RiftCompare as a
          search-weighted daily index — like a stock index for the game. When the cards players
          actually chase get dearer, the Index rises; when the market cools, it falls.{" "}
          {isGlobal ? (
            <>By default it&apos;s the <strong className="text-slate-200">global composite</strong> — every region we track, blended into one currency-agnostic number. Use the Market selector to drill into a single region.</>
          ) : (
            <>You&apos;re viewing the <strong className="text-slate-200">{COUNTRIES[market as Country].place}</strong> market, priced from {COUNTRIES[market as Country].adjective} stores. Switch back to Global at the top right.</>
          )}
        </p>
      </div>

      {index ? (
        <>
          {/* Headline number + chart */}
          <Reveal>
            <section className="card-surface relative overflow-hidden p-5">
              <div className="pointer-events-none absolute inset-0" aria-hidden>
                <div
                  className={`absolute -right-16 -top-20 h-64 w-64 rounded-full blur-3xl animate-blob ${
                    index.sinceStart == null || index.sinceStart <= 0 ? "bg-brand-500/15" : "bg-rose-500/15"
                  }`}
                />
                <div className="hero-dots absolute inset-0 opacity-50" />
              </div>
              <div className="relative">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      {heading} {isGlobal ? "composite" : "market"} · base 100 on {index.startDay}
                    </div>
                    <div className="font-display text-5xl font-extrabold text-white">
                      {index.latest.toFixed(1)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Delta label="1 day" pct={index.d1} />
                    <Delta label="7 days" pct={index.d7} />
                    <Delta label="30 days" pct={index.d30} />
                    <Delta label="All time" pct={index.sinceStart} />
                  </div>
                </div>
                <div className="mt-4">
                  <IndexChart points={index.points} />
                </div>
                <p className="mt-2 text-[11px] text-slate-600">
                  ▲ rising prices · ▼ falling prices · recalculated daily after the price refresh.
                </p>
              </div>
            </section>
          </Reveal>

          {/* Constituents */}
          <Reveal delayMs={120}>
          <section>
            <h2 className="mb-1 text-xl font-extrabold text-white">What&apos;s in the Index</h2>
            <p className="mb-3 text-sm text-slate-400">
              The {index.constituents.length} most-searched cards with a live price, weighted by
              search volume (capped at 20% each).
              {isGlobal && (
                <> Prices shown in {currency}, from the {COUNTRIES[priceMarket].place} market as a global reference.</>
              )}
            </p>
            <div className="card-surface overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-semibold">#</th>
                    <th className="px-2 py-2.5 font-semibold">Card</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Weight</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Price</th>
                    <th className="px-4 py-2.5 text-right font-semibold">7-day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-800">
                  {index.constituents.map((c, i) => (
                    <tr key={c.id} className="hover:bg-ink-900/50">
                      <td className="px-4 py-2 font-bold text-slate-500">
                        {i < 3 ? <span className="chip bg-gold/20 text-gold">{i + 1}</span> : i + 1}
                      </td>
                      <td className="px-2 py-2">
                        <Link href={cardHref(c)} className="flex items-center gap-2.5">
                          {c.imageThumbUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.imageThumbUrl} alt="" width={28} height={39} loading="lazy" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-white">{c.name}</span>
                            <span className="block text-[11px] text-slate-500">{c.setCode} · {c.collectorNumber}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-xs text-slate-400">{c.weightPct}%</td>
                      <td className="px-2 py-2 text-right font-semibold text-white">{formatMoney(c.priceCents, currency)}</td>
                      <td className={`px-4 py-2 text-right font-semibold ${c.d7pct == null ? "text-slate-600" : c.d7pct > 0 ? "text-rose-400" : c.d7pct < 0 ? "text-brand-400" : "text-slate-400"}`}>
                        {c.d7pct == null ? "—" : `${c.d7pct > 0 ? "▲" : c.d7pct < 0 ? "▼" : ""} ${Math.abs(c.d7pct)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          </Reveal>
        </>
      ) : (
        <div className="card-surface relative grid overflow-hidden place-items-center p-16 text-center text-slate-400">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-500/15 blur-3xl animate-blob" />
            <div className="hero-dots absolute inset-0 opacity-50" />
          </div>
          <div className="relative">
            <p className="text-lg font-semibold text-white">The Index is warming up</p>
            <p className="mt-1 text-sm">
              We need a few days of price history{isGlobal ? "" : " in this market"} before the chart
              means anything. Check back soon{isGlobal ? "" : " — or switch to Global"}, or see
              what&apos;s moving today.
            </p>
            <Link href="/movers" className="btn-primary mt-4">📈 Price movers →</Link>
          </div>
        </div>
      )}

      <AdSlot height={100} />

      {/* Methodology — written to be citable */}
      <section id="cite" className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Methodology</h2>
        <div className="mt-2 max-w-3xl space-y-3 text-sm leading-relaxed text-slate-400">
          <p>
            The RiftCompare Index measures the price level of the Riftbound singles market that
            players actually trade. Its constituents are the {INDEX_SIZE} most-searched cards on
            RiftCompare with a live price in the selected market, weighted by search volume with a
            20% cap per card — so a chase card moves the Index more than a bulk common, and no
            single card dominates it. Each day&apos;s value is the weighted average of the
            constituents&apos; lowest in-stock prices across every store we track, normalised to 100
            at the start of the series: an Index of 112 means the watched market is up 12%.
          </p>
          <p>
            <strong className="text-slate-300">The Global composite</strong> (the default) rebases
            each regional index to 100 at their common start, then equal-weight averages them day by
            day — so it tracks worldwide price direction without mixing currencies. Pick a region
            from the Market selector to see that market&apos;s own index in its local currency.
          </p>
          <p>
            Constituents are refreshed from live search data, so the basket evolves with the
            metagame; history is recomputed against the current basket for consistency. Prices
            update daily after the store refresh.
          </p>
          <p className="text-slate-300">
            <strong>Citing the Index:</strong> journalists and creators are welcome to quote it
            freely as &ldquo;the RiftCompare Index&rdquo; with a link to this page.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/movers" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">📈 This week&apos;s movers →</Link>
          <Link href="/browse" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">Browse all cards →</Link>
          <Link href="/sealed" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">Sealed prices →</Link>
        </div>
      </section>

    </div>
  );
}
