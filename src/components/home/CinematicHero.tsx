import { Suspense } from "react";
import Link from "next/link";
import { ParallaxRoot } from "./ParallaxRoot";
import { CountryHeroToggle } from "@/components/CountryHeroToggle";
import { SearchBar } from "@/components/SearchBar";
import { HeroStats, type MarketStat } from "./HeroStats";
import { TrendingChips } from "./TrendingChips";
import type { CardTileData } from "@/components/CardTile";
import type { Country } from "@/lib/country";

// The cinematic, full-bleed homepage hero. Breaks out of the centered content
// column to fill the viewport (left-1/2 + w-screen + -translate-x-1/2). All
// decorative layers are aria-hidden; the foreground re-aligns to the normal grid via
// container-app. Parallax is layered on by ParallaxRoot (client) and degrades to a
// clean static composition with no JS / reduced motion.
//
// Search-first: the old hero packed in 4 CTAs, 4 stat boxes, a partner-logo row
// and the affiliate disclosure — nothing above the fold was an actual price. Now
// the hero is H1 → subhead → search (THE dominant element) → trending chips →
// one stat line → one text link + the (quiet, auto-detected) region toggle.
// The partner row and disclosure moved to PartnersStrip, rendered below the
// fold in page.tsx (disclosure still travels with the links it discloses —
// see AffiliateDisclosure's rules — just further down the page instead of
// inside the first viewport).
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
        {/* Kinetic headline — MARKET-NEUTRAL: this page is cached (ISR), so one
            version serves every visitor and crawler; naming all six markets
            ranks in all six. Prices localise client-side after hydration.
            Sized to lead the page without dominating it.

            Rebuilt per the homepage-redesign brief: the previous H1 spent 60+
            characters listing all six countries the region control already
            names ("Compare Riftbound card prices across AU, NZ, US, UK, SG &
            CA stores") — real estate that told the visitor about the site's
            coverage instead of its job. This version states the job in one
            short sentence ("find the cheapest place to buy any Riftbound
            card") and keeps "Riftbound" for SEO; the countries themselves
            still live in CountryHeroToggle below and in the SEO/FAQ block at
            the foot of the page, not here. Still market-neutral (says
            nothing about which market is active), so the ISR-cached HTML is
            still identical for every visitor and crawler. */}
        <h1 className="animate-fade-in [animation-delay:160ms] mx-auto mt-4 max-w-3xl text-3xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-4xl lg:text-5xl">
          Find the cheapest place to buy any <span className="text-brand-400">Riftbound</span> card
        </h1>
        {/* One sentence, no repeated country list — the old 3-line subhead
            named the same six markets a second time. */}
        <p className="animate-fade-in [animation-delay:240ms] mx-auto mt-4 max-w-xl text-base text-slate-300">
          Compare live prices across every major Riftbound store, instantly.
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
            {/* trendingCards feeds the box's own zero-state dropdown (focused +
                empty — see SearchBar's doc comment) in addition to the
                always-visible TrendingChips row below. The nav variant of
                this same component doesn't get this prop: trending-card data
                is computed here, once, from this page's own server data, and
                threading it into the site-wide Navbar (every route, not just
                "/") would mean a new sitewide data fetch for a component
                whose zero-state degrades perfectly well to "recent searches
                only" without it. */}
            <SearchBar variant="hero" autoFocusDesktop trendingCards={trendingCards} />
          </Suspense>
        </div>

        {/* Trending search chips — an instant path in for a visitor who doesn't
            know what to type yet. Server-rendered (real data, real hrefs); only
            the click beacon is client-side. */}
        <TrendingChips cards={trendingCards} />

        {/* One thin stat line, directly under the search field — was 4 bordered
            boxes. */}
        <HeroStats totalCards={totalCards} statsByCountry={statsByCountry} freshness={freshness} />

        {/* EXACTLY ONE secondary action below the search box, per the redesign
            brief: "the search box is the hero", so nothing here competes with
            it for primary-CTA weight. This used to be a filled "Browse the
            database" BUTTON plus two more links ("Top meta decks →", "New to
            Riftbound? Learn how to play →") — three separate above-the-fold
            targets, none of them the search box, one of them (meta decks)
            pointing away from the price-comparison job entirely. All three
            are gone; a single plain-text link survives, deliberately styled
            below button weight (no .btn-primary fill) so it reads as an
            escape hatch for "I don't want to search, just show me
            everything" rather than a second call to action.

            /decks and /learn are not orphaned by this cut: /decks is a
            top-level Navbar link (md:block, see Navbar.tsx) and /learn has a
            real, server-rendered footer link via NAV_GROUPS → FOOTER_GROUPS →
            FooterNav.tsx (confirmed by reading that chain — FooterNav is a
            plain server component, no client-only gating), which did not
            exist when /learn's hero link was first added to fix its orphan
            problem. Both destinations are still one click away everywhere on
            the site; they just don't need a second, competing home in the
            hero above the fold. */}
        <div className="animate-fade-in [animation-delay:360ms] mt-6 flex flex-col items-center gap-2">
          {/* tap-link: this is the hero's one surviving secondary action, so its
              hit area needs the same 44/48px floor every other tap target on the
              page gets — a plain text link with no padding measured ~20px tall,
              short of that. focus-visible:ring-*: a real, measured gap found
              auditing keyboard focus — this link's default outline was suppressed
              (globals.css's focus-visible reset applies to .btn/.input/etc, not a
              bare Next.js link) with nothing standing in for it, so a keyboard user
              tabbing to it saw no indicator at all. Same ring treatment
              CinematicNavMenu already uses for its own bare links. */}
          <Link
            href="/browse"
            className="tap-link rounded text-sm font-semibold text-slate-300 underline-offset-4 outline-none transition-colors hover:text-brand-400 hover:underline focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            Browse all {totalCards.toLocaleString()} cards →
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
//
// id="rc-hero": a stable marker FeedbackWidget looks for (IntersectionObserver)
// so its launcher can hide itself while the hero — and the hero's own search +
// autocomplete — is in view, without FeedbackWidget needing to know anything
// about page structure beyond "does an element with this id exist and
// intersect". Harmless on every other route: none of them render this id, so
// the observer there finds nothing and no-ops, same shape as the existing
// #rc-ad-zone check right next to it in that file.
function ParallaxShell({ children }: { children: React.ReactNode }) {
  return (
    <ParallaxRoot
      id="rc-hero"
      className="relative left-1/2 -mt-6 flex min-h-[30vh] w-screen -translate-x-1/2 items-center overflow-hidden"
    >
      {children}
    </ParallaxRoot>
  );
}
