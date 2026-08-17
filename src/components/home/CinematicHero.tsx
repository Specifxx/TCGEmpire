import { Suspense } from "react";
import Link from "next/link";
import { ParallaxRoot } from "./ParallaxRoot";
import { CountryHeroToggle } from "@/components/CountryHeroToggle";
import { SearchBar } from "@/components/SearchBar";
import { HeroStats, type MarketStat } from "./HeroStats";
import { TrendingChips } from "./TrendingChips";
import type { CardTileData } from "@/components/CardTile";
import { COUNTRY_LIST, type Country } from "@/lib/country";

/** The bit of a region home page (/au, /nz, /uk, /sg, /ca) that varies the
 *  hero's copy and locks its stat block — see app/au/page.tsx etc. */
export interface HeroRegion {
  code: Country;
  /** e.g. "Australian", "US", "UK" — reused verbatim from lib/country.ts's
   *  COUNTRIES so the hero never invents its own copy of that map. */
  adjective: string;
}

// Short, subhead-style place names — deliberately NOT CountryInfo.place (which
// spells out "the United Kingdom"/"the United States" for prose elsewhere): this
// sentence already reads "...retailer we track, plus five more markets..." and
// keeping these short is what makes it read as a list rather than a run-on.
const SHORT_PLACE: Record<Country, string> = {
  AU: "Australia",
  NZ: "New Zealand",
  US: "the US",
  UK: "the UK",
  SG: "Singapore",
  CA: "Canada",
};

/** "Australia, New Zealand, the UK, Singapore and Canada" — every market EXCEPT
 *  the one leading the H1, so a region page never re-lists its own market as
 *  one of the "five more". */
function otherMarketsList(exclude: Country): string {
  const names = COUNTRY_LIST.filter((c) => c.code !== exclude).map((c) => SHORT_PLACE[c.code]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

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
  region,
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
  // Present only on a region home page (/au, /nz, /uk, /sg, /ca). Swaps the
  // US-first H1/subhead for that region's own and locks the stat block to it —
  // omitted on the real homepage, which keeps its existing US-first copy and
  // switcher-following stat exactly as before.
  region?: HeroRegion;
}) {
  const heroAdjective = region?.adjective ?? "US";
  const otherMarkets = otherMarketsList(region?.code ?? "US");
  return (
    <ParallaxShell>
      {/* ── Background (flat terminal panel) ─────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div className="absolute inset-0 bg-ink-950 border-b border-ink-800" />
      </div>

      {/* NOTHING FLANKS THE HERO, deliberately. Two vertical affiliate rails sat
          here (≥1400px only, absolutely positioned) and were removed on
          2026-08-16: on a page whose entire job is "search, then a fact, then
          go", a pair of ad panes framing the search box is the first thing a
          wide-screen visitor sees, and it reads as an ad site rather than a
          price comparison. Their predecessor — a floating chase-card showcase —
          was removed from these same slots for a related reason. Twice now this
          position has been filled and then emptied, so treat it as a slot that
          costs more in first impression than anything has yet earned back.
          Affiliate revenue still runs through PartnersStrip and FooterAds below
          the fold, where it doesn't compete with the search box. */}

      {/* ── Foreground content (re-aligned to the normal grid) ───────────────── */}
      <div className="container-app relative z-10 w-full py-8 text-center sm:py-10">
        {/* Kinetic headline — US-FIRST, not market-neutral. This page is cached
            (ISR) and DEFAULT_COUNTRY is "US" (lib/country.ts), which is also
            where the traffic actually is: SimilarWeb reports the real visitor
            split as ~89% US / ~11% AU, with NZ/UK/SG/CA not registering — so a
            headline enumerating six countries greeted the vast majority of
            visitors with five markets they don't live in before the one they
            do. The other five markets aren't dropped, just demoted: they're
            still named in the very next sentence (this page's own subhead),
            in the About section further down, in metadata.description and in
            the organization JSON-LD's areaServed — every one of those is real,
            crawlable text, so the geo keywords that matter for AU/NZ/SG search
            traffic (markets with far less competition than the US) survive
            the reorder. Sized to lead the page without dominating it. Capped
            at lg:text-5xl (not 6xl) with a wider max-w-4xl measure so the full
            sentence settles into ~2 lines at desktop instead of wrapping to 3. */}
        <h1 className="animate-fade-in [animation-delay:160ms] mx-auto mt-4 max-w-4xl text-3xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-4xl lg:text-5xl">
          Compare <span className="text-brand-400">Riftbound</span> card prices across every {heroAdjective} store
        </h1>
        <p className="animate-fade-in [animation-delay:240ms] mx-auto mt-4 max-w-2xl text-base text-slate-300">
          Find the cheapest place to buy Riftbound TCG cards — live prices from every {heroAdjective} retailer we track,
          plus five more markets in their own currency: {otherMarkets}, updated daily.
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
        <HeroStats totalCards={totalCards} statsByCountry={statsByCountry} freshness={freshness} lockCountry={region?.code} />

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
