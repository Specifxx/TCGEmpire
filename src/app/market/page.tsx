import type { Metadata } from "next";
import Link from "next/link";
import { getMarketIndex, INDEX_SIZE, type IndexConstituent } from "@/lib/market-index";
import { IndexChart } from "@/components/IndexChart";
import { MarketSwitcher } from "@/components/MarketSwitcher";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";
import { AdSlot } from "@/components/AdSlot";
import { Reveal } from "@/components/Reveal";
import { MarketSectionNav } from "@/components/MarketSectionNav";
import { IndexStats } from "@/components/IndexStats";
import { IndexConstituents } from "@/components/IndexConstituents";
import { cardImageAlt } from "@/lib/image-alt";
import { pageAlternates } from "@/lib/seo";

// searchParams-driven (?market=), so the route is dynamic regardless of any
// page-level revalidate window — same reasoning as /browse and /sets/[set]. The
// real caching lives one layer down: getMarketIndex() is itself day-cached via
// unstable_cache (see lib/market-index.ts), shared across every caller, so this
// page hits Postgres at most once per market per Sydney day no matter how the
// page component itself is rendered — a page-level `revalidate` bought nothing
// here that wasn't already bought there.
//
// This used to be `export const revalidate = 3600` with a market/loading.tsx
// above it. That combination — an ISR revalidate window on a page that ALSO
// reads searchParams, with a route-level Suspense boundary via loading.tsx — is
// exactly what produced a real, reproducible bug: the FIRST-ever request for any
// specific `?market=` value the ISR cache hadn't seen returned the loading.tsx
// spinner as the COMPLETE, final response (confirmed via a bare fetch — no JS
// execution needed to reproduce it), with the real content only appearing on a
// second visit once the background render finished. A crawler's first (and
// often only) visit to a URL variant would have seen nothing. force-dynamic
// removes the ambiguity: every request blocks until the real render is ready,
// so there's nothing to fall back to.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "The RiftCompare Index — Riftbound Market Tracker | RiftCompare" },
  description:
    "One number for the global Riftbound market: a weighted index of the most-searched cards — like a stock index for the game. Updated weekly, free to cite.",
  keywords: [
    "RiftCompare Index",
    "Riftbound market index",
    "Riftbound card market",
    "Riftbound prices tracker",
    "Riftbound market health",
    "TCG market index",
  ],
  alternates: pageAlternates("/market", {
    types: { "text/markdown": `${SITE_URL}/llm/market` },
  }),
  openGraph: {
    title: "The RiftCompare Index — the Riftbound market in one number",
    description:
      "One number for the global Riftbound market: a weighted index of the most-searched cards — like a stock index for the game. Updated weekly, free to cite.",
    url: `${SITE_URL}/market`,
  },
};

function parseMarket(v?: string): Country {
  const up = (v ?? "").toUpperCase();
  // Validated against the market registry rather than a hand-written || chain —
  // that chain had silently gone stale: it never listed SG, so ?market=SG fell
  // back to the default instead of rendering Singapore's, and CA would have
  // done the same.
  return up in COUNTRIES ? (up as Country) : DEFAULT_COUNTRY;
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
                  <img src={c.imageThumbUrl} alt={cardImageAlt(c)} width={28} height={39} loading="lazy" decoding="async" className="h-9 w-7 shrink-0 rounded-sm object-cover" />
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
  // getMarketIndex is day-cached internally (once per market per Sydney day, shared
  // across every caller), so it needs no page-level wrapper — that only re-serialised
  // the same blob without cutting history-DB reads. Auto-refreshes at the day rollover.
  const index = await getMarketIndex(market);

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

  const heading = COUNTRIES[market].code;
  const currency = index?.currency ?? COUNTRIES[market].currency;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "RiftCompare Index", item: `${SITE_URL}/market` },
    ],
  };
  // Honest dateModified = the last day the series actually has data for.
  const lastDataDay = index?.points.length
    ? new Date(index.points[index.points.length - 1].t).toISOString().slice(0, 10)
    : undefined;
  const datasetLd = index
    ? {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "The RiftCompare Index",
        description: `Weekly weighted price index of the ${index.constituents.length} most-searched Riftbound TCG cards. Base 100 on ${index.startDay}.`,
        url: `${SITE_URL}/market`,
        creator: { "@type": "Organization", name: "RiftCompare", "@id": `${SITE_URL}/#org`, url: SITE_URL },
        license: `${SITE_URL}/market#cite`,
        isAccessibleForFree: true,
        temporalCoverage: `${index.startDay}/..`,
        dateModified: lastDataDay,
        variableMeasured: "RiftCompare Index level (base 100)",
        keywords: ["Riftbound", "TCG price index", "trading card market", "RiftCompare Index"],
        // Machine-readable distribution — marks the site as a primary data source AI
        // engines can fetch and cite, not just a page to scrape.
        distribution: {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: `${SITE_URL}/api/v1/index.json`,
        },
      }
    : null;

  // Jump nav (sticky on desktop) — only the sections that actually render, in DOM order.
  const sections = [
    ...(index ? [{ id: "index", label: "Index" }] : []),
    ...(index ? [{ id: "constituents", label: "Constituents" }] : []),
    ...(index && (gainers.length > 0 || fallers.length > 0) ? [{ id: "movers", label: "Movers" }] : []),
    { id: "cite", label: "Methodology" },
  ];

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
            search-weighted index, updated weekly — like a stock index for the game. When the cards players
            actually chase get dearer, the Index rises; when the market cools, it falls.{" "}
            You&apos;re viewing the <strong className="text-slate-200">{COUNTRIES[market].place}</strong> market,
            priced from {COUNTRIES[market].adjective} stores. Switch markets using the selector at the top right.
          </p>
          {/* The Index is today's number; records are the same data asked the
              other way round ("what is the most this has ever been?"). Linked
              from the top rather than buried at the bottom because it is the
              page a visitor searching "riftbound all-time high" wants, and they
              land here. */}
          <p className="mt-3 text-sm">
            <Link href="/market/records" className="font-semibold text-brand-400 hover:underline">
              All-time price records &amp; cross-market gaps →
            </Link>{" "}
            <span className="text-slate-500">every card&apos;s highest and lowest recorded price, and the day it was set.</span>
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
                      {heading} market · base 100 on {index.startDay}
                    </div>
                    <div className="num text-5xl font-extrabold text-white">
                      {index.latest.toFixed(1)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Delta label="Latest" pct={index.d1} />
                    <Delta label="7 days" pct={index.d7} />
                    <Delta label="30 days" pct={index.d30} />
                    <Delta label="All time" pct={index.sinceStart} />
                  </div>
                </div>
                {/* One self-contained, quotable summary sentence — the format AI answer
                    engines lift verbatim (a real, dated statistic). */}
                <p className="mt-3 max-w-2xl text-sm text-slate-400">
                  As of {lastDataDay ?? index.startDay}, the RiftCompare {heading} index sits at{" "}
                  <strong className="text-slate-200">{index.latest.toFixed(1)}</strong>
                  {index.d7 == null ? null : <> — {index.d7 > 0 ? "up" : index.d7 < 0 ? "down" : "flat"} {Math.abs(index.d7)}% over 7 days</>}
                  {index.stats ? <>, with {index.stats.advancing} of {index.constituents.length} tracked cards higher on the week</> : null}.
                </p>
                <div className="mt-4">
                  <IndexChart points={index.points} />
                </div>
                <p className="mt-2 text-[11px] text-slate-600">
                  + rising prices · − falling prices · recalculated weekly, matching the price-history snapshot.
                </p>
                <div className="mt-5 border-t border-ink-800 pt-4">
                  <IndexStats index={index} />
                </div>
              </div>
            </section>
          </Reveal>

          {/* Constituents */}
          <Reveal delayMs={120}>
          <section id="constituents" className="scroll-mt-32">
            <h2 className="mb-1 text-xl font-extrabold text-white">What&apos;s in the Index</h2>
            <p className="mb-3 text-sm text-slate-400">
              The {index.constituents.length} most-searched cards with a live price, weighted by
              search volume (capped at 20% each). Scroll within the list to see them all.
            </p>
            {/* Interactive: filter by card/gainers/fallers, and click any heading to
                sort ascending/descending. Capped-height inner scroll + sticky header. */}
            <IndexConstituents constituents={index.constituents} currency={currency} />
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
              We need a few days of price history in this market before the chart means anything.
              Check back soon, or see what&apos;s moving today.
            </p>
            <Link href="/movers" className="btn-primary mt-4">Price movers →</Link>
          </div>
        </div>
      )}

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
            single card dominates it. The level is <strong className="text-slate-300">chain-linked</strong>,
            not a plain average: rather than averaging price levels at each snapshot, every step
            computes a percentage move using only cards priced at both that snapshot and the
            previous one, then applies that move to a running level starting at 100. That is what
            keeps a new set&apos;s cards climbing into the basket — or any other constituent
            turnover — from jumping the Index the moment they arrive: a debuting card has no
            earlier price to compare against, so it simply sits out the step it debuts on. An
            Index of 112 means the watched market is up 12% since tracking began. The full
            step-by-step formula is published in the{" "}
            <Link
              href="/guides/understanding-the-riftcompare-index-methodology"
              className="text-brand-400 hover:underline"
            >
              methodology guide
            </Link>
            .
          </p>
          <p>
            The Index defaults to the US market; pick a different region from the Market selector
            to see that market&apos;s own index, priced in its own local currency.
          </p>
          <p>
            <strong className="text-slate-300">Key statistics.</strong> Index value is what it would
            cost to buy <em>one copy of each card</em> in the Index — the sum of every
            constituent&apos;s lowest in-stock price, in the market&apos;s currency. It is deliberately
            <strong> not</strong> a circulating-supply market cap: trading-card singles have no public
            float, so a true price×supply capitalisation can&apos;t be computed — this is the
            one-of-each basket value. Range is the index&apos;s own low–high over the tracked window (a
            52-week-range analogue). Breadth counts how many constituents rose vs fell over the last 7
            days, and volatility is the standard deviation of the index&apos;s most recent snapshot-to-snapshot moves.
          </p>
          <p>
            Constituents are refreshed from live search data, so the basket evolves with the
            metagame; history is recomputed against the current basket for consistency. Each
            constituent&apos;s listed price is the current live figure; the Index&apos;s own level and
            chart update weekly, matching the price-history snapshot.
          </p>
          <p className="text-slate-300">
            <strong>Citing the Index:</strong> journalists and creators are welcome to quote it
            freely as &ldquo;the RiftCompare Index&rdquo; with a link to this page.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/movers" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">This week&apos;s movers →</Link>
          <Link href="/browse" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">Browse all cards →</Link>
          <Link href="/sealed" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">Sealed prices →</Link>
        </div>
      </section>
    </div>
  );
}
