import type { Metadata } from "next";
import Link from "next/link";
import { getSealedIndex, SEALED_INDEX_MIN_GROUPS, type SealedIndexConstituent } from "@/lib/sealed-index";
import { IndexChart } from "@/components/IndexChart";
import { IndexStats } from "@/components/IndexStats";
import { SealedIndexConstituents } from "@/components/SealedIndexConstituents";
import { MarketSwitcher } from "@/components/MarketSwitcher";
import { MarketSectionNav } from "@/components/MarketSectionNav";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { sealedImageAlt } from "@/lib/image-alt";
import { SITE_URL } from "@/lib/site";
import { AdSlot } from "@/components/AdSlot";
import { Reveal } from "@/components/Reveal";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

// Same reasoning as /market and /market/records: searchParams-driven (?market=)
// makes the route dynamic regardless of any page-level revalidate window, and the
// real caching lives one layer down in getSealedIndex (week-scoped unstable_cache,
// see lib/sealed-index.ts) — shared across every caller. A page-level `revalidate`
// combined with a route Suspense boundary is what previously served /market's
// loading.tsx spinner as the COMPLETE response for the first request to an unseen
// ?market= value; force-dynamic removes that failure mode entirely.
export const dynamic = "force-dynamic";

const TITLE = "The RiftCompare Sealed Index — Riftbound Sealed Market Tracker";
const DESCRIPTION =
  "One number for the Riftbound sealed market: booster boxes, packs, bundles and Proving Grounds kits tracked as an equal-weighted index. Updated weekly, free to cite.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | RiftCompare` },
  description: DESCRIPTION,
  keywords: [
    "RiftCompare Sealed Index",
    "Riftbound sealed market index",
    "Riftbound booster box price tracker",
    "Riftbound sealed product prices",
    "Riftbound sealed market health",
    "TCG sealed market index",
  ],
  alternates: pageAlternates("/market/sealed"),
  openGraph: pageOpenGraph({ title: TITLE, description: DESCRIPTION, url: "/market/sealed" }),
};

function parseMarket(v?: string): Country {
  const up = (v ?? "").toUpperCase();
  return up in COUNTRIES ? (up as Country) : DEFAULT_COUNTRY;
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

// A compact gainers/fallers column, the sealed-side sibling of /market/page.tsx's
// own MoverCol — links out to /sealed?q= rather than a per-card href, same
// reasoning as SealedIndexConstituents (no /sealed/<slug> page exists to link to).
function MoverCol({ title, products, positive, currency }: { title: string; products: SealedIndexConstituent[]; positive: boolean; currency: string }) {
  return (
    <div className="card-surface p-4">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</div>
      {products.length === 0 ? (
        <p className="text-sm text-slate-500">No notable moves this week.</p>
      ) : (
        <ul className="divide-y divide-ink-800">
          {products.map((c) => (
            <li key={c.id}>
              <Link href={`/sealed?q=${encodeURIComponent(c.name)}`} className="flex items-center gap-2.5 rounded-md px-1 py-2 transition-colors hover:bg-ink-800">
                {c.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt={sealedImageAlt(c.name)} loading="lazy" decoding="async" className="h-9 w-9 shrink-0 rounded-sm bg-ink-950 object-contain" />
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

export default async function SealedIndexPage({ searchParams }: { searchParams: { market?: string } }) {
  const market = parseMarket(searchParams.market);
  const index = await getSealedIndex(market);

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
      { "@type": "ListItem", position: 3, name: "Sealed Index", item: `${SITE_URL}/market/sealed` },
    ],
  };
  const lastDataDay = index?.points.length
    ? new Date(index.points[index.points.length - 1].t).toISOString().slice(0, 10)
    : undefined;
  const datasetLd = index
    ? {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "The RiftCompare Sealed Index",
        description: `Weekly equal-weighted price index of ${index.constituents.length} tracked Riftbound sealed products. Base 100 on ${index.startDay}.`,
        url: `${SITE_URL}/market/sealed`,
        creator: { "@type": "Organization", name: "RiftCompare", "@id": `${SITE_URL}/#org`, url: SITE_URL },
        license: `${SITE_URL}/market/sealed#cite`,
        isAccessibleForFree: true,
        temporalCoverage: `${index.startDay}/..`,
        dateModified: lastDataDay,
        variableMeasured: "RiftCompare Sealed Index level (base 100)",
        keywords: ["Riftbound", "TCG sealed price index", "trading card sealed market", "RiftCompare Sealed Index"],
      }
    : null;

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

      <section className="card-surface animate-fade-up overflow-hidden border-l-2 border-brand-500 bg-ink-900">
        <div className="px-6 py-8">
          <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-slate-300">Home</Link>
            <span>/</span>
            <Link href="/market" className="hover:text-slate-300">RiftCompare Index</Link>
            <span>/</span>
            <span className="text-slate-300">Sealed Index</span>
          </nav>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-extrabold text-white sm:text-3xl">The RiftCompare Sealed Index</h1>
            <MarketSwitcher value={market} basePath="/market/sealed" label="Choose the market the Sealed Index tracks" />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            The sealed-side sibling of{" "}
            <Link href="/market" className="text-brand-400 hover:underline">the RiftCompare Index</Link>: booster
            boxes, packs, bundles and Proving Grounds kits tracked as their own index, updated weekly. It is kept
            separate from the singles Index rather than merged in — a booster box and a common single sit on wildly
            different price scales, and blending them would make &ldquo;what moved the number&rdquo; hard to read
            honestly. Every tracked product counts equally (see Methodology below for why), so the number reflects
            the sealed market broadly rather than a hand-picked few.{" "}
            You&apos;re viewing the <strong className="text-slate-200">{COUNTRIES[market].place}</strong> market,
            priced from {COUNTRIES[market].adjective} stores. Switch markets using the selector at the top right.
          </p>
          <p className="mt-3 text-sm">
            <Link href="/sealed" className="font-semibold text-brand-400 hover:underline">
              Shop live sealed prices →
            </Link>{" "}
            <span className="text-slate-500">every tracked box, pack and bundle, with filters and store links.</span>
          </p>
        </div>
      </section>

      <MarketSectionNav sections={sections} />

      {index ? (
        <>
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
                <p className="mt-3 max-w-2xl text-sm text-slate-400">
                  As of {lastDataDay ?? index.startDay}, the RiftCompare Sealed {heading} index sits at{" "}
                  <strong className="text-slate-200">{index.latest.toFixed(1)}</strong>
                  {index.d7 == null ? null : <> — {index.d7 > 0 ? "up" : index.d7 < 0 ? "down" : "flat"} {Math.abs(index.d7)}% over 7 days</>}
                  {index.stats ? <>, with {index.stats.advancing} of {index.constituents.length} tracked products higher on the week</> : null}.
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

          <Reveal delayMs={120}>
          <section id="constituents" className="scroll-mt-32">
            <h2 className="mb-1 text-xl font-extrabold text-white">What&apos;s in the Sealed Index</h2>
            <p className="mb-3 text-sm text-slate-400">
              Every currently-listed, shipped sealed product with a live price — {index.constituents.length} in
              total — weighted equally. Scroll within the list to see them all.
            </p>
            <SealedIndexConstituents constituents={index.constituents} currency={currency} />
          </section>
          </Reveal>

          {(gainers.length > 0 || fallers.length > 0) && (
            <Reveal delayMs={180}>
              <section id="movers" className="scroll-mt-32">
                <h2 className="mb-3 text-xl font-extrabold text-white">Biggest movers (7-day)</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <MoverCol title="Top gainers" products={gainers} positive currency={currency} />
                  <MoverCol title="Top fallers" products={fallers} positive={false} currency={currency} />
                </div>
              </section>
            </Reveal>
          )}
        </>
      ) : (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">The Sealed Index is warming up</p>
            <p className="mt-1 text-sm">
              We need a few weeks of sealed price history in this market before the chart means anything (at least
              {" "}{SEALED_INDEX_MIN_GROUPS} tracked products with two snapshots each). Check back soon, or browse
              live sealed prices now.
            </p>
            <Link href="/sealed" className="btn-primary mt-4">Shop sealed prices →</Link>
          </div>
        </div>
      )}

      <AdSlot height={100} />

      <section id="cite" className="card-surface scroll-mt-32 p-6">
        <h2 className="text-xl font-extrabold text-white">Methodology</h2>
        <div className="mt-2 max-w-3xl space-y-3 text-sm leading-relaxed text-slate-400">
          <p>
            The RiftCompare Sealed Index measures the price level of the Riftbound sealed market — booster boxes,
            packs, bundles, Proving Grounds kits and similar products — with a live price in the selected market.
            Unlike the singles Index, which ranks its 200 constituents by search volume, the sealed catalogue is
            small enough (roughly 30 tracked product groups per market) that there is no need to cut it down: every
            shipped, in-stock product counts, weighted equally. There is no search or view-tracking signal for
            sealed products today — inventing one (store count, MSRP) would dress up a made-up number as if it
            meant something, so this Index simply does not weight by demand.
          </p>
          <p>
            The level is <strong className="text-slate-300">chain-linked</strong> using the exact same formula as
            the singles Index — published in full in the{" "}
            <Link href="/guides/understanding-the-riftcompare-index-methodology" className="text-brand-400 hover:underline">
              methodology guide
            </Link>
            . In short: rather than averaging price levels at each snapshot, every step computes a percentage move
            using only products priced at both that snapshot and the previous one, then applies that move to a
            running level starting at 100. A new set&apos;s booster box climbing onto shelves mid-week has no earlier
            price to compare against, so it simply sits out the step it debuts on rather than jumping the Index the
            moment it arrives.
          </p>
          <p>
            The Index defaults to the US market; pick a different region from the Market selector to see that
            market&apos;s own index, priced in its own local currency.
          </p>
          <p>
            <strong className="text-slate-300">Key statistics.</strong> Index value is what it would cost to buy{" "}
            <em>one of each tracked product</em> — the sum of every constituent&apos;s lowest in-stock price. Range
            is the index&apos;s own low–high over the tracked window. Breadth counts how many constituents rose vs
            fell over the last 7 days, and volatility is the standard deviation of the index&apos;s most recent
            snapshot-to-snapshot moves.
          </p>
          <p>
            Each constituent&apos;s listed price is the current live figure; the Index&apos;s own level and chart
            update weekly, matching the price-history snapshot — the same cadence as the singles Index.
          </p>
          <p className="text-slate-300">
            <strong>Citing the Index:</strong> journalists and creators are welcome to quote it freely as &ldquo;the
            RiftCompare Sealed Index&rdquo; with a link to this page.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/market" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">The RiftCompare Index →</Link>
          <Link href="/market/records" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">Price records →</Link>
          <Link href="/sealed" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">Sealed prices →</Link>
        </div>
      </section>
    </div>
  );
}
