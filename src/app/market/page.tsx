import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getMarketIndex, INDEX_SIZE, type MarketScope, type IndexConstituent } from "@/lib/market-index";
import { prisma } from "@/lib/db";
import { IndexChart } from "@/components/IndexChart";
import { MarketSwitcher } from "@/components/MarketSwitcher";
import { COUNTRIES, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";
import { AdSlot } from "@/components/AdSlot";
import { Reveal } from "@/components/Reveal";
import { DailyWrapHero } from "@/components/DailyWrapHero";
import { MarketSectionNav } from "@/components/MarketSectionNav";
import { getLatestMarketReport } from "@/lib/posts";

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

// Recent daily market-wrap reports (the auto-generated "what moved the market"
// posts). Resilient to a missing DB (build/static-gen) — returns [] on error.
async function getRecentReports() {
  try {
    return await prisma.marketReport.findMany({
      orderBy: { day: "desc" },
      take: 6,
      select: { slug: true, day: true, title: true, excerpt: true, globalChangePct: true },
    });
  } catch {
    return [];
  }
}

// A compact gainers/fallers column derived from the Index constituents' own 7-day moves.
function MoverCol({ title, cards, positive, currency }: { title: string; cards: IndexConstituent[]; positive: boolean; currency: string }) {
  return (
    <div className="card-surface p-4">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</div>
      {cards.length === 0 ? (
        <p className="text-sm text-slate-500">No notable moves this week.</p>
      ) : (
        <ul className="divide-y divide-ink-800">
          {cards.map((c) => (
            <li key={c.id}>
              <Link href={cardHref(c)} className="flex items-center gap-2.5 rounded-md px-1 py-2 transition-colors hover:bg-ink-800">
                {c.imageThumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageThumbUrl} alt="" aria-hidden="true" width={28} height={39} loading="lazy" decoding="async" className="h-9 w-7 shrink-0 rounded-sm object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{c.name}</span>
                  <span className="num block text-[11px] text-slate-500">{formatMoney(c.priceCents, currency)}</span>
                </span>
                <span className={`num shrink-0 text-sm font-bold ${positive ? "text-up" : "text-down"}`}>
                  {positive ? "+" : "−"}{Math.abs(c.d7pct ?? 0)}%
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Delta({ label, pct }: { label: string; pct: number | null }) {
  if (pct == null) return null;
  const up = pct > 0;
  const flat = pct === 0;
  return (
    <div className="rounded-md bg-ink-900 px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num text-sm font-extrabold ${flat ? "text-slate-300" : up ? "text-up" : "text-down"}`}>
        {flat ? "—" : `${up ? "+" : "−"}${Math.abs(pct)}%`}
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
  const reports = await unstable_cache(getRecentReports, ["market-reports-recent"], { revalidate: 1800 })();
  // The newest wrap, featured prominently near the top of the page (with charts).
  const latestWrap = await unstable_cache(getLatestMarketReport, ["market-wrap-latest"], { revalidate: 1800 })();

  // Biggest 7-day movers among the Index constituents (stock-index style gainers/losers).
  const constituents = index?.constituents ?? [];
  const gainers = constituents
    .filter((c) => c.d7pct != null && c.d7pct > 0)
    .sort((a, b) => (b.d7pct ?? 0) - (a.d7pct ?? 0))
    .slice(0, 5);
  const fallers = constituents
    .filter((c) => c.d7pct != null && c.d7pct < 0)
    .sort((a, b) => (a.d7pct ?? 0) - (b.d7pct ?? 0))
    .slice(0, 5);

  // Display chrome. GLOBAL has no single currency/region, so prices fall back to the
  // composite's reference region (carried on the index as `currency`/`priceMarket`).
  const heading = isGlobal ? "Global" : `${COUNTRIES[market as Country].code}`;
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

  // Daily wrap block: the featured latest report up top + a few recent ones. Exclude
  // the featured one from the small grid so it isn't shown twice.
  const featuredSlug = latestWrap?.article.slug;
  const gridReports = reports.filter((r) => r.slug !== featuredSlug).slice(0, 3);
  const hasWrap = !!latestWrap || gridReports.length > 0;

  // Jump nav (sticky on desktop) — only the sections that actually render, in DOM order.
  const sections = [
    ...(index ? [{ id: "index", label: "Index" }] : []),
    ...(hasWrap ? [{ id: "wrap", label: "Market wrap" }] : []),
    ...(index ? [{ id: "constituents", label: "Constituents" }] : []),
    ...(index && (gainers.length > 0 || fallers.length > 0) ? [{ id: "movers", label: "Movers" }] : []),
    { id: "cite", label: "Methodology" },
  ];

  // The featured wrap + recent grid, rendered once and slotted in just under the
  // headline number (so the daily wrap is reachable near the top, not only the bottom).
  const wrapBlock = hasWrap ? (
    <Reveal delayMs={80}>
      <section id="wrap" className="scroll-mt-32">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-white">Daily market wrap</h2>
            <p className="mt-0.5 text-xs text-slate-500">What moved the market — auto-generated each day after the price refresh.</p>
          </div>
          <Link href="/market/wrap" className="btn-ghost shrink-0 text-xs">Explore all wraps →</Link>
        </div>
        {latestWrap && <DailyWrapHero post={latestWrap} />}
        {gridReports.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {gridReports.map((r) => (
              <Link key={r.slug} href={`/blog/${r.slug}`} className="card-surface p-4 transition-colors hover:border-ink-600">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">{r.day}</span>
                  {r.globalChangePct != null && (
                    <span className={`num text-xs font-bold ${r.globalChangePct > 0 ? "text-up" : r.globalChangePct < 0 ? "text-down" : "text-slate-400"}`}>
                      {r.globalChangePct > 0 ? "+" : r.globalChangePct < 0 ? "−" : ""}{Math.abs(r.globalChangePct).toFixed(2)}%
                    </span>
                  )}
                </div>
                <h3 className="mt-1 line-clamp-2 text-sm font-bold text-white">{r.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">{r.excerpt}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Reveal>
  ) : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetLd ? [breadcrumbLd, datasetLd] : [breadcrumbLd]) }}
      />

      {/* Breadcrumb + hero — flat panel with a brand accent rule */}
      <section className="card-surface animate-fade-up overflow-hidden border-l-2 border-brand-500 bg-ink-900">
        <div className="px-6 py-8">
          <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-slate-300">Home</Link>
            <span>/</span>
            <span className="text-slate-300">RiftCompare Index</span>
          </nav>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-extrabold text-white sm:text-3xl">The RiftCompare Index</h1>
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
      </section>

      {/* Sticky jump nav — makes the long page easy to scan/navigate while scrolling. */}
      <MarketSectionNav sections={sections} />

      {index ? (
        <>
          {/* Headline number + chart */}
          <Reveal>
            <section id="index" className="card-surface scroll-mt-32 p-5">
              <div>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      {heading} {isGlobal ? "composite" : "market"} · base 100 on {index.startDay}
                    </div>
                    <div className="num text-5xl font-extrabold text-white">
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
                  + rising prices · − falling prices · recalculated daily after the price refresh.
                </p>
              </div>
            </section>
          </Reveal>

          {/* Daily wrap — featured near the top, just under the headline number. */}
          {wrapBlock}

          {/* Constituents */}
          <Reveal delayMs={120}>
          <section id="constituents" className="scroll-mt-32">
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
                    <tr key={c.id} className="hover:bg-ink-800">
                      <td className="px-4 py-2 font-bold text-slate-500">
                        {i < 3 ? <span className="chip bg-gold/20 text-gold">{i + 1}</span> : i + 1}
                      </td>
                      <td className="px-2 py-2">
                        <Link href={cardHref(c)} className="flex items-center gap-2.5">
                          {c.imageThumbUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.imageThumbUrl} alt="" aria-hidden="true" width={28} height={39} loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-white">{c.name}</span>
                            <span className="block text-[11px] text-slate-500">{c.setCode} · {c.collectorNumber}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="num px-2 py-2 text-right text-xs text-slate-400">{c.weightPct}%</td>
                      <td className="num px-2 py-2 text-right font-semibold text-white">{formatMoney(c.priceCents, currency)}</td>
                      <td className={`num px-4 py-2 text-right font-semibold ${c.d7pct == null ? "text-slate-600" : c.d7pct > 0 ? "text-up" : c.d7pct < 0 ? "text-down" : "text-slate-400"}`}>
                        {c.d7pct == null ? "—" : `${c.d7pct > 0 ? "+" : c.d7pct < 0 ? "−" : ""}${Math.abs(c.d7pct)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          </Reveal>

          {/* Biggest movers — stock-index style gainers/losers from the constituents */}
          {(gainers.length > 0 || fallers.length > 0) && (
            <Reveal delayMs={180}>
              <section id="movers" className="scroll-mt-32">
                <h2 className="mb-3 text-xl font-extrabold text-white">Biggest movers (7-day)</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <MoverCol title="Top gainers" cards={gainers} positive currency={currency} />
                  <MoverCol title="Top fallers" cards={fallers} positive={false} currency={currency} />
                </div>
              </section>
            </Reveal>
          )}
        </>
      ) : (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">The Index is warming up</p>
            <p className="mt-1 text-sm">
              We need a few days of price history{isGlobal ? "" : " in this market"} before the chart
              means anything. Check back soon{isGlobal ? "" : " — or switch to Global"}, or see
              what&apos;s moving today.
            </p>
            <Link href="/movers" className="btn-primary mt-4">Price movers →</Link>
          </div>
        </div>
      )}

      {/* When the index is cold but wraps exist, still surface them here so the page
          isn't empty. (When the index renders, the wrap block sits up under it.) */}
      {!index && wrapBlock}

      <AdSlot height={100} />

      {/* Methodology — written to be citable */}
      <section id="cite" className="card-surface scroll-mt-32 p-6">
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
          <Link href="/market/wrap" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">Daily market wrap →</Link>
          <Link href="/movers" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">This week&apos;s movers →</Link>
          <Link href="/browse" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">Browse all cards →</Link>
          <Link href="/sealed" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">Sealed prices →</Link>
        </div>
      </section>

    </div>
  );
}
