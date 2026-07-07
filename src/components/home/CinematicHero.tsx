import Link from "next/link";
import { ParallaxRoot } from "./ParallaxRoot";
import { CountUp } from "@/components/CountUp";
import { CountryHeroToggle } from "@/components/CountryHeroToggle";
import { OutboundLink } from "@/components/OutboundLink";
import { CommandLauncherButton } from "@/components/CommandLauncher";
import { Sparkline } from "@/components/PriceChart";
import { Sparkline as WrapSparkline, DeltaChip, trendColor } from "@/components/MarketReportCharts";
import { affiliateUrl, ebayAffiliateUrl } from "@/lib/affiliate";
import { COUNTRIES } from "@/lib/country";
import type { CountryInfo, Country } from "@/lib/country";
import type { MarketIndex } from "@/lib/market-index";
import type { MarketReportPost } from "@/lib/posts";

// eBay marketplace domain per market (NZ has no eBay of its own → AU).
const EBAY_DOMAIN: Record<string, string> = {
  AU: "ebay.com.au", NZ: "ebay.com.au", US: "ebay.com", UK: "ebay.co.uk",
};

// The cinematic, full-bleed homepage hero. Breaks out of the centered content
// column to fill the viewport (left-1/2 + w-screen + -translate-x-1/2). All
// decorative layers are aria-hidden; the foreground re-aligns to the normal grid via
// container-app. Parallax is layered on by ParallaxRoot (client) and degrades to a
// clean static composition with no JS / reduced motion.
export function CinematicHero({
  country,
  info,
  storeCount,
  storeWord,
  totalCards,
  pricedCards,
  inStockUnits,
  index,
  wrap,
}: {
  country: Country;
  info: CountryInfo;
  storeCount: number;
  storeWord: string;
  totalCards: number;
  pricedCards: number;
  inStockUnits: number;
  index: MarketIndex | null;
  // Today's market wrap. When present, the hero accent is a compact RiftCompare
  // Index panel (level + sparkline + regional moves) linking to the wrap — the only
  // index on the homepage. Falls back to a plain Index chip (from `index`) when null.
  wrap?: MarketReportPost | null;
}) {
  const ebayHref = ebayAffiliateUrl(
    `https://www.${EBAY_DOMAIN[country] ?? "ebay.com"}/sch/i.html?_nkw=${encodeURIComponent("Riftbound TCG")}`
  );
  const tcgHref = affiliateUrl(
    "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product"
  );
  const indexUp = index?.d7 != null && index.d7 > 0;
  // Compact Index panel data from today's wrap (level, 1-day move, sparkline, regional
  // moves) — mirrors the featured wrap's Global Index panel, shown once, here.
  const wrapAccent =
    wrap?.data?.global != null
      ? { g: wrap.data.global, regions: wrap.data.regions, slug: wrap.article.slug }
      : null;

  return (
    <ParallaxShell>
      {/* ── Background (flat terminal panel) ─────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div className="absolute inset-0 bg-ink-950 border-b border-ink-800" />
      </div>

      {/* ── Foreground content (re-aligned to the normal grid) ───────────────── */}
      <div className="container-app relative z-10 w-full py-16 text-center sm:py-20">
        {/* Live badge */}
        <div className="animate-fade-in [animation-delay:60ms]">
          <span className="chip border border-brand-500/30 bg-ink-900 text-brand-300">
            <span className="relative mr-0.5 flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
            </span>
            Live prices · updated daily
          </span>
        </div>

        {/* Live market accent — the ONE RiftCompare Index on the homepage: a compact
            panel (level, sparkline, regional moves) linking to today's wrap. Falls
            back to a plain Index chip until the first wrap exists. */}
        {wrapAccent ? (
          <div className="animate-fade-in [animation-delay:100ms] mt-3 flex justify-center">
            <Link
              href={`/blog/${wrapAccent.slug}`}
              aria-label="View the RiftCompare Index — read today's market wrap"
              className="group inline-flex max-w-full items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 px-4 py-2 transition-colors duration-200 hover:border-brand-500 hover:bg-ink-800"
            >
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">RiftCompare Index</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="num text-lg font-extrabold text-white">{wrapAccent.g.level != null ? wrapAccent.g.level.toFixed(1) : "—"}</span>
                  {wrapAccent.g.d1 != null && (
                    <span className="num text-xs font-bold" style={{ color: trendColor(wrapAccent.g.d1) }}>
                      {wrapAccent.g.d1 > 0 ? "▲ +" : wrapAccent.g.d1 < 0 ? "▼ " : "■ "}{wrapAccent.g.d1.toFixed(2)}%
                    </span>
                  )}
                </span>
              </span>
              {wrapAccent.g.series.length >= 2 && (
                <span className="hidden sm:block"><WrapSparkline series={wrapAccent.g.series} id="hero-index" width={120} height={34} /></span>
              )}
              {wrapAccent.regions.length > 0 && (
                <span className="hidden items-center gap-2 border-l border-ink-700 pl-3 md:flex">
                  {wrapAccent.regions.map((r) => (
                    <span key={r.code} className="flex items-center gap-1 text-[11px] text-slate-400">
                      <span aria-hidden>{COUNTRIES[r.code].flag}</span>
                      <DeltaChip pct={r.d1} />
                    </span>
                  ))}
                </span>
              )}
              <span className="ml-1 shrink-0 text-[11px] font-bold text-brand-400 group-hover:underline">Today&apos;s wrap →</span>
            </Link>
          </div>
        ) : index ? (
          <div className="animate-fade-in [animation-delay:100ms] mt-3 flex justify-center">
            <Link
              href="/market"
              aria-label="View the RiftCompare Index"
              className="inline-flex items-center gap-2 rounded-md border border-ink-700 bg-ink-900 px-3 py-1.5 transition-colors duration-200 hover:border-brand-500 hover:bg-ink-800"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">RiftCompare Index</span>
              <span className="num text-lg font-extrabold leading-none text-white">{index.latest.toFixed(1)}</span>
              {index.d7 != null && (
                <span className={`num text-xs font-bold ${indexUp ? "text-up" : "text-down"}`}>
                  {indexUp ? "+" : "−"}{Math.abs(index.d7)}% · 7d
                </span>
              )}
              <span className="hidden sm:block"><Sparkline points={index.points} up={indexUp} upIsGood /></span>
              <span className="text-slate-500" aria-hidden>→</span>
            </Link>
          </div>
        ) : null}

        {/* Kinetic headline — MARKET-NEUTRAL: this page is cached (ISR), so one
            version serves every visitor and crawler; naming all four markets
            ranks in all four. Prices localise client-side after hydration. */}
        <h1 className="animate-fade-in [animation-delay:160ms] mx-auto mt-5 max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
          Compare <span className="text-brand-400">Riftbound</span> card prices across AU, NZ, US &amp; UK stores
        </h1>
        <p className="animate-fade-in [animation-delay:240ms] mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
          Find the cheapest place to buy Riftbound TCG cards — live local prices in AUD, NZD, USD &amp; GBP
          compared across stores in Australia, New Zealand, the US and the UK, updated daily.
        </p>

        {/* CTAs (one primary + one secondary + the all-features launcher) */}
        <div className="animate-fade-in [animation-delay:300ms] mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/browse" className="btn-primary px-5 py-2.5 text-base">Browse the database</Link>
          <Link href="/decks" className="btn-ghost px-5 py-2.5 text-base">Top meta decks</Link>
          <CommandLauncherButton variant="hero" />
        </div>

        {/* Market toggle */}
        <div className="animate-fade-in [animation-delay:360ms] mt-6">
          <CountryHeroToggle />
        </div>

        {/* Stats */}
        <div className="animate-fade-in [animation-delay:420ms] mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={totalCards} label="cards" />
          <Stat value={pricedCards} label="priced" />
          <Stat value={inStockUnits} label="in-stock listings" />
          <Stat value={storeCount} label={`AU ${storeWord}`} />
        </div>

        {/* Trust line — approved affiliate partners (absorbs the old Partners strip) */}
        <div className="animate-fade-in [animation-delay:480ms] mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <span className="uppercase tracking-wide">Approved partners</span>
          <OutboundLink href={ebayHref} retailer="ebay_search" country={country} className="text-lg font-extrabold lowercase leading-none transition-opacity hover:opacity-80" aria-label="eBay Partner Network">
            <span style={{ color: "#e53238" }}>e</span><span style={{ color: "#0064d2" }}>b</span><span style={{ color: "#f5af02" }}>a</span><span style={{ color: "#86b817" }}>y</span>
          </OutboundLink>
          <OutboundLink href={tcgHref} retailer="tcgplayer" country={country} className="text-base font-extrabold leading-none text-white transition-opacity hover:opacity-80" aria-label="TCGplayer">
            TCG<span className="text-sky-400">player</span>
          </OutboundLink>
        </div>
      </div>
    </ParallaxShell>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900 p-3 transition-colors duration-200 hover:border-brand-500/40 hover:bg-ink-800">
      <div className="num text-xl font-extrabold text-accent sm:text-2xl">
        <CountUp value={value} />
      </div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

// Full-bleed breakout shell. `-mt-6` cancels the layout's top padding so the hero
// kisses the navbar; `left-1/2 w-screen -translate-x-1/2` breaks the hero out to the
// full viewport (safe because globals.css sets html{overflow-x:clip}). `main` is
// centred in the viewport on every breakpoint, so the breakout is symmetric.
function ParallaxShell({ children }: { children: React.ReactNode }) {
  return (
    <ParallaxRoot className="relative left-1/2 -mt-6 flex min-h-[86vh] w-screen -translate-x-1/2 items-center overflow-hidden">
      {children}
    </ParallaxRoot>
  );
}
