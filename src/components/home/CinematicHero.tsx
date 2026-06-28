import Link from "next/link";
import { ParallaxRoot } from "./ParallaxRoot";
import { CountUp } from "@/components/CountUp";
import { CountryHeroToggle } from "@/components/CountryHeroToggle";
import { OutboundLink } from "@/components/OutboundLink";
import { CommandLauncherButton } from "@/components/CommandLauncher";
import { Sparkline } from "@/components/PriceChart";
import { affiliateUrl, ebayAffiliateUrl } from "@/lib/affiliate";
import type { CountryInfo, Country } from "@/lib/country";
import type { MarketIndex } from "@/lib/market-index";

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
}: {
  country: Country;
  info: CountryInfo;
  storeCount: number;
  storeWord: string;
  totalCards: number;
  pricedCards: number;
  inStockUnits: number;
  index: MarketIndex | null;
}) {
  const ebayHref = ebayAffiliateUrl(
    `https://www.${EBAY_DOMAIN[country] ?? "ebay.com"}/sch/i.html?_nkw=${encodeURIComponent("Riftbound TCG")}`
  );
  const tcgHref = affiliateUrl(
    "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product"
  );
  const indexUp = index?.d7 != null && index.d7 > 0;

  return (
    <ParallaxShell>
      {/* ── Background layers (decorative) ───────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        {/* Branded atmospheric glow from the R mark — large, blurred, low-opacity
            (the asset is small, so it's used as texture, not a sharp photo). */}
        <div className="parallax-art absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/r2-source.png"
            alt=""
            width={391}
            height={376}
            fetchPriority="high"
            decoding="async"
            className="absolute left-1/2 top-1/2 h-[150%] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 opacity-[0.16] blur-2xl saturate-150"
          />
        </div>
        {/* Aurora blobs (parallax at a slower rate than the artwork for depth). */}
        <div className="parallax-aurora absolute inset-0">
          <div className="absolute -left-24 -top-28 h-96 w-96 rounded-full bg-brand-500/25 blur-3xl animate-blob" />
          <div className="absolute -right-20 top-8 h-80 w-80 rounded-full bg-gold/15 blur-3xl animate-blob [animation-delay:3s]" />
          <div className="absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl animate-blob [animation-delay:6s]" />
        </div>
        {/* Colour grade to seat the text + blend into the page below. */}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/60 via-ink-950/30 to-ink-950" />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/20 via-transparent to-gold/10" />
        {/* Dot texture + cinematic vignette. */}
        <div className="hero-dots absolute inset-0 opacity-60" />
        <div className="hero-vignette absolute inset-0" />
      </div>

      {/* ── Foreground content (re-aligned to the normal grid) ───────────────── */}
      <div className="container-app relative z-10 w-full py-16 text-center sm:py-20">
        {/* Live badge */}
        <div className="animate-fade-in [animation-delay:60ms]">
          <span className="chip border border-brand-500/30 bg-ink-950/60 text-brand-300 backdrop-blur">
            <span className="relative mr-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
            </span>
            Live prices · updated daily
          </span>
        </div>

        {/* Live RiftCompare Index accent */}
        {index && (
          <div className="animate-fade-in [animation-delay:100ms] mt-3 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-ink-700/70 bg-ink-950/60 px-3 py-1.5 shadow-glow backdrop-blur">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">RiftCompare Index</span>
              <span className="font-display text-lg font-extrabold leading-none text-white">{index.latest.toFixed(1)}</span>
              {index.d7 != null && (
                <span className={`text-xs font-bold ${indexUp ? "text-brand-400" : "text-rose-400"}`}>
                  {indexUp ? "▲" : "▼"} {Math.abs(index.d7)}% · 7d
                </span>
              )}
              <span className="hidden sm:block"><Sparkline points={index.points} up={indexUp} upIsGood /></span>
            </span>
          </div>
        )}

        {/* Kinetic headline */}
        <h1 className="animate-fade-in [animation-delay:160ms] mx-auto mt-5 max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
          Compare <span className="brand-shimmer">Riftbound</span> card prices across {info.adjective} stores
        </h1>
        <p className="animate-fade-in [animation-delay:240ms] mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
          Find the cheapest place to buy Riftbound TCG cards in {info.place} — live prices in{" "}
          {info.currency} compared across {storeCount} {info.adjective} {storeWord}, updated daily.
        </p>

        {/* CTAs (one primary + one secondary + the all-features launcher) */}
        <div className="animate-fade-in [animation-delay:300ms] mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/browse" className="btn-primary cta-shine px-5 py-2.5 text-base">Browse the database</Link>
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
          <Stat value={storeCount} label={`${info.code} ${storeWord}`} />
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
    <div className="rounded-xl border border-ink-700/50 bg-ink-950/50 p-3 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/40">
      <div className="text-xl font-extrabold text-gold sm:text-2xl">
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
