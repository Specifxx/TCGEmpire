import Link from "next/link";
import type { Article } from "@/lib/articles";
import { METHODOLOGY, type DailyMover, type ReportData } from "@/lib/market-report";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { Markdown } from "./Markdown";
import { fmtDate } from "./ArticleList";
import { AdSlot } from "./AdSlot";
import { SITE_URL } from "@/lib/site";
import { BreadthBar, DeltaChip, DivergingBar, IndexAreaChart, Sparkline, trendColor } from "./MarketReportCharts";

// The rich rendering of an auto-generated daily market report: the prose sections
// interleaved with server-rendered charts, laid out like a financial-press market
// wrap. Reports without a stored chart payload fall back to the plain ArticleView.

function StatTile({ label, value, pct, big }: { label: string; value?: string; pct?: number | null; big?: boolean }) {
  return (
    <div className="card-surface p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      {value != null ? (
        <div className={`mt-1 font-extrabold tabular-nums text-white ${big ? "text-3xl" : "text-2xl"}`}>{value}</div>
      ) : (
        <div
          className="mt-1 text-2xl font-extrabold tabular-nums"
          style={{ color: trendColor(pct ?? null) }}
        >
          {pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`}
        </div>
      )}
    </div>
  );
}

function MoverRow({ m, scale }: { m: DailyMover; scale: number }) {
  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/card/${m.slug ?? m.id}`}
        className="w-[38%] min-w-0 truncate text-sm font-semibold text-white hover:text-brand-400 sm:w-[32%]"
        title={`${m.name} (${m.setCode} ${m.collectorNumber})`}
      >
        {m.name}
      </Link>
      <DivergingBar pct={m.pct} scale={scale} />
      <div className="w-24 text-right">
        <DeltaChip pct={m.pct} dp={1} />
        <div className="text-[11px] tabular-nums text-slate-500">{formatMoney(m.priceCents, m.currency)}</div>
      </div>
    </div>
  );
}

export function MarketReportView({ article, data }: { article: Article; data: ReportData }) {
  const g = data.global;
  const liveRegions = data.regions.filter((r) => r.level != null);
  const regionScale = Math.max(0.3, ...data.regions.map((r) => Math.abs(r.d1 ?? 0)));
  const movers = [...data.movers.risers, ...data.movers.fallers];
  const moverScale = Math.max(1, ...movers.map((m) => Math.abs(m.pct)));

  const reportUrl = `${SITE_URL}/blog/${article.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.excerpt,
    datePublished: article.date,
    // The report is regenerated through its Sydney calendar day, so the report's
    // own day stamp is the honest dateModified.
    dateModified: data.day ?? article.updated ?? article.date,
    author: { "@type": "Organization", name: article.author },
    publisher: { "@type": "Organization", name: "RiftCompare" },
    mainEntityOfPage: reportUrl,
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: article.title, item: reportUrl },
    ],
  };

  return (
    <article className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([jsonLd, breadcrumbLd]) }} />

      <Link href="/blog" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        ← All posts
      </Link>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {article.tags.map((t) => (
          <span key={t} className="chip bg-ink-800 text-slate-400">{t}</span>
        ))}
      </div>

      <h1 className="text-3xl font-extrabold leading-tight text-white">{article.title}</h1>
      <div className="mt-2 text-sm text-slate-500">
        {article.author} · {fmtDate(article.date)} · {article.readMins} min read
      </div>

      {/* Headline stats — the ticker strip */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Global index" value={g.level != null ? g.level.toFixed(1) : "—"} big />
        <StatTile label="1 day" pct={g.d1} />
        <StatTile label="7 days" pct={g.d7} />
        <StatTile label="30 days" pct={g.d30} />
      </div>

      {/* Hero chart */}
      {g.series.length >= 2 && (
        <figure className="card-surface mt-4 p-4">
          <figcaption className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-white">RiftCompare Global Index</span>
            <span className="text-xs text-slate-500">Daily closes · base 100</span>
          </figcaption>
          <IndexAreaChart
            series={g.series}
            id="global-index"
            ariaLabel={`RiftCompare Global Index, last ${g.series.length} sessions`}
          />
        </figure>
      )}

      <div className="mt-6 text-[15px] leading-relaxed text-slate-300">
        <Markdown content={data.prose.lede} />
      </div>

      <AdSlot className="mt-6" height={120} />

      {/* Markets at a glance: a card per region with its own sparkline */}
      <h2 className="mt-8 text-xl font-bold text-white">Markets at a glance</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {data.regions.map((r) => {
          const info = COUNTRIES[r.code];
          return (
            <div key={r.code} className="card-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-hidden>{info.flag}</span>
                  <span className="text-sm font-bold text-white">{info.label}</span>
                </div>
                <span className="text-lg font-extrabold tabular-nums text-white">
                  {r.level != null ? r.level.toFixed(1) : "—"}
                </span>
              </div>
              {r.series.length >= 2 ? (
                <div className="mt-2">
                  <Sparkline series={r.series} id={`spark-${r.code}`} width={260} height={44} />
                </div>
              ) : (
                <div className="mt-2 grid h-[44px] place-items-center rounded bg-ink-850 text-[11px] text-slate-500">
                  Index history building
                </div>
              )}
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1">1d <DeltaChip pct={r.d1} /></span>
                <span className="flex items-center gap-1">7d <DeltaChip pct={r.d7} /></span>
                <span className="flex items-center gap-1">30d <DeltaChip pct={r.d30} /></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Regional performance bar chart */}
      {liveRegions.length >= 2 && (
        <figure className="card-surface mt-4 p-4">
          <figcaption className="mb-3 flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-white">Regional performance</span>
            <span className="text-xs text-slate-500">1-day change</span>
          </figcaption>
          <div className="space-y-2.5">
            {data.regions.map((r) => (
              <div key={r.code} className="flex items-center gap-3">
                <span className="w-[38%] truncate text-sm text-slate-300 sm:w-[32%]">
                  <span aria-hidden>{COUNTRIES[r.code].flag}</span> {COUNTRIES[r.code].label}
                </span>
                <DivergingBar pct={r.d1} scale={regionScale} />
                <span className="w-24 text-right">
                  <DeltaChip pct={r.d1} />
                </span>
              </div>
            ))}
          </div>
        </figure>
      )}

      {/* Regional spotlight */}
      {data.prose.spotlight && (
        <>
          <h2 className="mt-8 text-xl font-bold text-white">Regional spotlight: {data.prose.spotlightPlace}</h2>
          <div className="mt-3 text-[15px] leading-relaxed text-slate-300">
            <Markdown content={data.prose.spotlight} />
          </div>
        </>
      )}

      {/* Movers of the day */}
      {movers.length > 0 && (
        <>
          <h2 className="mt-8 text-xl font-bold text-white">Movers of the day</h2>
          {data.movers.risers.length > 0 && (
            <figure className="card-surface mt-3 p-4">
              <figcaption className="mb-3 text-sm font-bold text-emerald-400">Biggest risers</figcaption>
              <div className="space-y-2.5">
                {data.movers.risers.map((m) => (
                  <MoverRow key={m.id} m={m} scale={moverScale} />
                ))}
              </div>
            </figure>
          )}
          {data.movers.fallers.length > 0 && (
            <figure className="card-surface mt-3 p-4">
              <figcaption className="mb-3 text-sm font-bold text-rose-400">Biggest fallers</figcaption>
              <div className="space-y-2.5">
                {data.movers.fallers.map((m) => (
                  <MoverRow key={m.id} m={m} scale={moverScale} />
                ))}
              </div>
            </figure>
          )}
          <p className="mt-2 text-xs italic text-slate-500">
            Card moves are the average one-day change in the lowest live price across the markets where the card trades.
          </p>
        </>
      )}

      {/* Market breadth */}
      {data.breadth.rose + data.breadth.fell + data.breadth.flat > 0 && (
        <figure className="card-surface mt-6 p-4">
          <figcaption className="mb-3 text-sm font-bold text-white">Market breadth — regions</figcaption>
          <BreadthBar rose={data.breadth.rose} fell={data.breadth.fell} flat={data.breadth.flat} />
        </figure>
      )}

      {/* The takeaway */}
      <h2 className="mt-8 text-xl font-bold text-white">The takeaway</h2>
      <div className="mt-3 text-[15px] leading-relaxed text-slate-300">
        <Markdown content={data.prose.takeaway} />
      </div>

      <div className="mt-8 border-t border-ink-800 pt-4 text-xs italic leading-relaxed text-slate-500">
        {METHODOLOGY}{" "}
        <Link href="/about#methodology" className="not-italic text-brand-400 hover:underline">
          How RiftCompare works →
        </Link>
      </div>

      <AdSlot className="mt-8" height={120} />
    </article>
  );
}
