import { Suspense } from "react";
import Link from "next/link";
import { ParallaxRoot } from "./ParallaxRoot";
import { CountryHeroToggle } from "@/components/CountryHeroToggle";
import { SearchBar } from "@/components/SearchBar";
import { HeroStats, type MarketStat } from "./HeroStats";
import { TrendingChips } from "./TrendingChips";
import type { CardTileData } from "@/components/CardTile";
import type { Country } from "@/lib/country";
import { HeroAdRail } from "./HeroAdRail";

// The cinematic, full-bleed homepage hero. Breaks out of the centered content
// column to fill the viewport (left-1/2 + w-screen + -translate-x-1/2). All
// decorative layers are aria-hidden; the foreground re-aligns to the normal grid via
// container-app. Parallax is layered on by ParallaxRoot (client) and degrades to a
// clean static composition with no JS / reduced motion.
//
// Search-first: the old hero packed in 4 CTAs, 4 stat boxes, a partner-logo row
// and the affiliate disclosure — nothing above the fold was an actual price. Now
// the hero is H1 → subhead → search → one stat line → one button + one link +
// the (quiet) region toggle. The partner row and disclosure moved to
// PartnersStrip, rendered below the fold in page.tsx (disclosure still travels
// with the links it discloses — see AffiliateDisclosure's rules — just further
// down the page instead of inside the first viewport).
export function CinematicHero({
  totalCards,
  statsByCountry,
  trendingCards,
  freshness,
}: {
  totalCards: number;
  // Per-market stat tiles — localised to the visitor's market client-side (HeroStats).
  statsByCountry: Record<Country, MarketStat>;
  // Top slice of the same most-searched-cards signal that powers "Most popular
  // cards" below — rendered as one-click trending chips under the search bar.
  trendingCards: CardTileData[];
  // Pre-formatted "Xh ago" string — see HeroStats' doc comment for why this is
  // computed server-side once rather than client-recomputed.
  freshness: string | null;
}) {
  return (
    <ParallaxShell>
      {/* ── Background (flat terminal panel) ─────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div className="absolute inset-0 bg-ink-950 border-b border-ink-800" />
      </div>

      {/* Vertical affiliate rails, one either side — ≥1400px only, absolutely
          positioned, so the centred search-first column below is completely
          unaffected at every smaller size. They occupy the exact slots (and the
          exact measured 1400px clearance) that the floating chase-card showcase
          used to; that showcase earned nothing and cost a serial DB read on an
          ISR-cached page. Which partner lands on which side is decided
          client-side per market — AU/NZ get eBay on both sides, since TCGplayer
          is US-centric — and Premium subscribers get neither. See HeroAdRail. */}
      <HeroAdRail side="left" />
      <HeroAdRail side="right" />

      {/* ── Foreground content (re-aligned to the normal grid) ───────────────── */}
      <div className="container-app relative z-10 w-full py-8 text-center sm:py-10">
        {/* Kinetic headline — MARKET-NEUTRAL: this page is cached (ISR), so one
            version serves every visitor and crawler; naming all six markets
            ranks in all six. Prices localise client-side after hydration.
            Sized to lead the page without dominating it. Capped at lg:text-5xl
            (not 6xl) with a wider max-w-4xl measure so the full sentence
            settles into ~2 lines at desktop instead of wrapping to 3. */}
        <h1 className="animate-fade-in [animation-delay:160ms] mx-auto mt-4 max-w-4xl text-3xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-4xl lg:text-5xl">
          Compare <span className="text-brand-400">Riftbound</span> card prices across AU, NZ, US, UK, SG &amp; CA stores
        </h1>
        <p className="animate-fade-in [animation-delay:240ms] mx-auto mt-4 max-w-2xl text-base text-slate-300">
          Find the cheapest place to buy Riftbound TCG cards — live local prices in AUD, NZD, USD, GBP, SGD &amp; CAD
          compared across stores in Australia, New Zealand, the US, the UK, Singapore and Canada, updated daily.
        </p>

        {/* The primary action: search, not a row of buttons. Wired to the exact
            same search as the nav box (same component, `variant="hero"`).
            Autofocus is desktop-only — SearchBar itself gates on viewport
            width, never on mobile.

            THE <Suspense> IS LOAD-BEARING, not a nicety. SearchBar calls
            useSearchParams(), and in the App Router an unwrapped
            useSearchParams() deopts its whole subtree to client-side rendering.
            Without this boundary the deopt escalated to the nearest Suspense
            above it — app/loading.tsx — so the ENTIRE homepage was replaced in
            the server-rendered HTML by the loading spinner:

              <main id="main-content">
                <template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>
                <div …>Loading…</div>
              </main>

            Every other page on the site server-renders its content; the homepage
            alone shipped a spinner, no <h1>, and not one internal link, to any
            client that doesn't execute JavaScript — including an AdSense
            reviewer fetching the page and every "does this site have content?"
            check that runs on raw HTML. The Navbar wraps its two SearchBar
            instances in exactly this boundary; the hero was the one that
            didn't. See docs/adsense-remediation.md § Phase 11. */}
        <div className="animate-fade-in [animation-delay:300ms] mt-6">
          <Suspense fallback={<div className="input mx-auto h-12 max-w-2xl" />}>
            <SearchBar variant="hero" autoFocusDesktop />
          </Suspense>
        </div>

        {/* Trending search chips — an instant path in for a visitor who doesn't
            know what to type yet. Server-rendered (real data, real hrefs); only
            the click beacon is client-side. */}
        <TrendingChips cards={trendingCards} />

        {/* One thin stat line, directly under the search field — was 4 bordered
            boxes. */}
        <HeroStats totalCards={totalCards} statsByCountry={statsByCountry} freshness={freshness} />

        {/* One primary button + one secondary text link — was 4 competing CTAs
            (Browse / Marketplace / Decks / ⌘K launcher). Marketplace and the
            command launcher stay reachable from the nav; nothing here is a
            dead end. The region switcher rides along in the same row, kept
            visually quiet (see CountryHeroToggle) so it doesn't compete. */}
        <div className="animate-fade-in [animation-delay:360ms] mt-6 flex flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Link href="/browse" className="btn-primary px-5 py-2.5 text-base">Browse the database</Link>
            <Link href="/decks" className="text-sm font-semibold text-slate-300 underline-offset-4 hover:text-brand-400 hover:underline">
              Top meta decks →
            </Link>
          </div>
          {/* Newcomer entry point. Deliberately on its OWN line and at a lower
              visual weight than the two CTAs above, rather than a third item in
              that row: the row was cut from four competing CTAs to two on
              purpose (see the note above), and re-crowding it would undo that.

              It earns the space because /learn was an ORPHAN — 359 lines of
              interactive new-player content at sitemap priority 0.8 with zero
              inbound internal links from any of 1,698 pages. The only thing
              referencing it was the mega-menu, which renders client-side and is
              therefore invisible to the crawler that decides whether the page is
              worth indexing. See GROWTH-AUDIT.md § 2. */}
          <Link
            href="/learn"
            className="text-xs text-slate-500 underline-offset-4 transition-colors hover:text-brand-400 hover:underline"
          >
            New to Riftbound? Learn how to play →
          </Link>
          <CountryHeroToggle />
        </div>
      </div>
    </ParallaxShell>
  );
}

// Full-bleed breakout shell. `-mt-6` tightens the gap to the wrap banner above;
// `left-1/2 w-screen -translate-x-1/2` breaks the hero out to the full viewport
// (safe because globals.css sets html{overflow-x:clip}). `main` is centred in the
// viewport on every breakpoint, so the breakout is symmetric. min-height is kept
// modest so the vertically-centred content doesn't leave a large void up top —
// content-driven height (via the section's own py-8/10) does most of the work;
// this floor just stops a short-content flash on the very first paint. Trimmed
// again (36vh → 30vh) alongside the tighter padding/H1 above — the section was
// running ~650px tall with a large dead band before the first content section.
function ParallaxShell({ children }: { children: React.ReactNode }) {
  return (
    <ParallaxRoot className="relative left-1/2 -mt-6 flex min-h-[30vh] w-screen -translate-x-1/2 items-center overflow-hidden">
      {children}
    </ParallaxRoot>
  );
}
