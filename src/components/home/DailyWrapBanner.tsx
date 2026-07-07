import Link from "next/link";
import type { MarketReportPost } from "@/lib/posts";
import { COUNTRIES } from "@/lib/country";
import { DeltaChip, Sparkline, trendColor } from "@/components/MarketReportCharts";

// A short, single-row version of DailyWrapHero for the homepage: today's wrap as a
// small banner — the "Daily Market Wrap" badge + headline on the left, the RiftCompare
// Index (level, 1-day move, sparkline, regional moves) on the right — linking to the
// full wrap. This is the ONLY wrap/index element on the homepage; the taller
// DailyWrapHero card still renders on /blog and /market/wrap. Responsive: the index
// collapses progressively on narrower screens so it never overflows (headline + badge
// always show). No cookie reads — safe on the ISR-cached homepage.
export function DailyWrapBanner({ post }: { post: MarketReportPost }) {
  const g = post.data?.global ?? null;
  const regions = post.data?.regions ?? [];

  return (
    <Link
      href={`/blog/${post.article.slug}`}
      aria-label={`Read today's market wrap: ${post.article.title}`}
      className="group flex items-center gap-4 overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-ink-900 to-cyan-500/10 px-4 py-3 transition-all hover:border-emerald-400/50 hover:shadow-glow sm:px-5"
    >
      {/* Left — badge + headline */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          Daily Market Wrap
        </span>
        <span className="truncate text-sm font-bold text-white group-hover:text-emerald-200 sm:text-base">
          {post.article.title}
        </span>
      </div>

      {/* Right — compact RiftCompare Index */}
      {g && (
        <div className="hidden shrink-0 items-center gap-3 border-l border-ink-700 pl-4 sm:flex">
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Index</span>
            <div className="flex items-baseline gap-1.5">
              <span className="num text-lg font-extrabold text-white">{g.level != null ? g.level.toFixed(1) : "—"}</span>
              {g.d1 != null && (
                <span className="num text-xs font-bold" style={{ color: trendColor(g.d1) }}>
                  {g.d1 > 0 ? "▲ +" : g.d1 < 0 ? "▼ " : "■ "}{g.d1.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
          {g.series.length >= 2 && (
            <span className="hidden md:block">
              <Sparkline series={g.series} id="wrap-banner" width={110} height={34} />
            </span>
          )}
          {regions.length > 0 && (
            <span className="hidden items-center gap-2 border-l border-ink-700 pl-3 lg:flex">
              {regions.map((r) => (
                <span key={r.code} className="flex items-center gap-1 text-[11px] text-slate-400">
                  <span aria-hidden>{COUNTRIES[r.code].flag}</span>
                  <DeltaChip pct={r.d1} />
                </span>
              ))}
            </span>
          )}
        </div>
      )}

      <span className="shrink-0 text-sm font-bold text-emerald-400 [transition:transform_.15s] group-hover:translate-x-0.5" aria-hidden>
        →
      </span>
    </Link>
  );
}
