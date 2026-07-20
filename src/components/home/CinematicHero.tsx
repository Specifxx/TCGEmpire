import Link from "next/link";
import { ParallaxRoot } from "./ParallaxRoot";
import { CountryHeroToggle } from "@/components/CountryHeroToggle";
import { OutboundLink } from "@/components/OutboundLink";
import { CommandLauncherButton } from "@/components/CommandLauncher";
import { affiliateUrl, ebayAffiliateUrl } from "@/lib/affiliate";
import { DailyWrapBanner } from "./DailyWrapBanner";
import { HeroStats, type MarketStat } from "./HeroStats";
import type { Country } from "@/lib/country";
import type { MarketReportPost } from "@/lib/posts";
import { MARKETPLACE_NAV_VISIBLE } from "@/components/nav-groups";

// eBay marketplace domain per market (NZ has no eBay of its own → AU).
const EBAY_DOMAIN: Record<string, string> = {
  AU: "ebay.com.au", NZ: "ebay.com.au", US: "ebay.com", UK: "ebay.co.uk", SG: "ebay.com.sg",
};

// The cinematic, full-bleed homepage hero. Breaks out of the centered content
// column to fill the viewport (left-1/2 + w-screen + -translate-x-1/2). All
// decorative layers are aria-hidden; the foreground re-aligns to the normal grid via
// container-app. Parallax is layered on by ParallaxRoot (client) and degrades to a
// clean static composition with no JS / reduced motion.
export function CinematicHero({
  country,
  totalCards,
  statsByCountry,
  wrap,
}: {
  country: Country;
  totalCards: number;
  // Per-market stat tiles — localised to the visitor's market client-side (HeroStats).
  statsByCountry: Record<Country, MarketStat>;
  // Today's market wrap, shown as a banner directly under the live badge.
  wrap?: MarketReportPost | null;
}) {
  const ebayHref = ebayAffiliateUrl(
    `https://www.${EBAY_DOMAIN[country] ?? "ebay.com"}/sch/i.html?_nkw=${encodeURIComponent("Riftbound TCG")}`
  );
  const tcgHref = affiliateUrl(
    "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product"
  );
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

        {/* Today's market wrap — embedded right under the live badge; wide + compact. */}
        {wrap && (
          <div className="animate-fade-in [animation-delay:100ms] mx-auto mt-4 max-w-5xl text-left">
            <DailyWrapBanner post={wrap} />
          </div>
        )}

        {/* Kinetic headline — MARKET-NEUTRAL: this page is cached (ISR), so one
            version serves every visitor and crawler; naming all four markets
            ranks in all four. Prices localise client-side after hydration. */}
        <h1 className="animate-fade-in [animation-delay:160ms] mx-auto mt-5 max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
          Compare <span className="text-brand-400">Riftbound</span> card prices across AU, NZ, US &amp; UK stores
        </h1>
        <p className="animate-fade-in [animation-delay:240ms] mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
          Find the cheapest place to buy Riftbound TCG cards — live local prices in AUD, NZD, USD &amp; GBP
          compared across stores in Australia, New Zealand, the US, the UK and Singapore, updated daily.
        </p>

        {/* CTAs (database + marketplace as the two color-coded primaries, one
            secondary + the all-features launcher). Browse = blue, Marketplace =
            green (the site's one brand accent) — deliberately distinct colors so
            the two main entry points read as separate destinations at a glance. */}
        <div className="animate-fade-in [animation-delay:300ms] mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/browse" className="btn bg-blue-500 px-5 py-2.5 text-base text-white hover:bg-blue-600">Browse the database</Link>
          {MARKETPLACE_NAV_VISIBLE && (
            <Link href="/marketplace" className="btn-primary px-5 py-2.5 text-base">🛒 Marketplace</Link>
          )}
          <Link href="/decks" className="btn-ghost px-5 py-2.5 text-base">Top meta decks</Link>
          <CommandLauncherButton variant="hero" />
        </div>

        {/* Market toggle */}
        <div className="animate-fade-in [animation-delay:360ms] mt-6">
          <CountryHeroToggle />
        </div>

        {/* Stats — reactive to the market switcher (localised client-side). */}
        <HeroStats totalCards={totalCards} statsByCountry={statsByCountry} />

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

// Full-bleed breakout shell. `-mt-6` tightens the gap to the wrap banner above;
// `left-1/2 w-screen -translate-x-1/2` breaks the hero out to the full viewport
// (safe because globals.css sets html{overflow-x:clip}). `main` is centred in the
// viewport on every breakpoint, so the breakout is symmetric. min-height is kept
// modest so the vertically-centred content doesn't leave a large void up top.
function ParallaxShell({ children }: { children: React.ReactNode }) {
  return (
    <ParallaxRoot className="relative left-1/2 -mt-6 flex min-h-[64vh] w-screen -translate-x-1/2 items-center overflow-hidden">
      {children}
    </ParallaxRoot>
  );
}
