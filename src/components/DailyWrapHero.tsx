import Link from "next/link";
import type { MarketReportPost } from "@/lib/posts";
import { COUNTRIES } from "@/lib/country";
import { fmtDate } from "./ArticleList";
import { DeltaChip, Sparkline, trendColor } from "./MarketReportCharts";

// The featured "Daily Market Wrap" banner at the top of /blog — today's report,
// styled like a terminal ticker so it stands apart from the editorial posts.
export function DailyWrapHero({ post }: { post: MarketReportPost }) {
  const g = post.data?.global ?? null;
  return (
    <Link
      href={`/blog/${post.article.slug}`}
      className="group relative mb-6 block overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-ink-900 to-cyan-500/10 p-5 transition-all hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-glow sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          Daily Market Wrap
        </span>
        <span className="text-xs text-slate-500">{fmtDate(post.day)}</span>
      </div>

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold leading-snug text-white group-hover:text-emerald-200 sm:text-2xl">
            {post.article.title}
          </h2>
          <p className="mt-1.5 line-clamp-2 max-w-xl text-sm text-slate-400">{post.article.excerpt}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-emerald-400 group-hover:gap-2 group-hover:text-emerald-300 [transition:gap_.15s]">
            Read today&apos;s wrap with charts →
          </span>
        </div>

        {g && (
          <div className="shrink-0 rounded-xl border border-ink-700 bg-ink-950/60 p-4 sm:w-56">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Global index</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tabular-nums text-white">
                {g.level != null ? g.level.toFixed(1) : "—"}
              </span>
              <span className="text-sm font-bold tabular-nums" style={{ color: trendColor(g.d1) }}>
                {g.d1 == null ? "" : `${g.d1 > 0 ? "▲ +" : g.d1 < 0 ? "▼ " : "■ "}${g.d1.toFixed(2)}%`}
              </span>
            </div>
            {g.series.length >= 2 && (
              <div className="mt-2">
                <Sparkline series={g.series} id="wrap-hero" width={200} height={42} />
              </div>
            )}
            {post.data && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {post.data.regions.map((r) => (
                  <span key={r.code} className="flex items-center gap-1 text-[11px] text-slate-400">
                    <span aria-hidden>{COUNTRIES[r.code].flag}</span>
                    <DeltaChip pct={r.d1} />
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
