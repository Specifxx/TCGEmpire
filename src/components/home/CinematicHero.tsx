import { Suspense } from "react";
import Link from "next/link";
import { ParallaxRoot } from "./ParallaxRoot";
import { CountryHeroToggle } from "@/components/CountryHeroToggle";
import { SearchBar } from "@/components/SearchBar";
import { HeroStats, type MarketStat } from "./HeroStats";
import { TrendingChips } from "./TrendingChips";
import { BrandLogo } from "@/components/BrandLogo";
import type { CardTileData } from "@/components/CardTile";
import { COUNTRY_LIST, type Country } from "@/lib/country";

/** The bit of a region home page (/au, /uk, /sg, /ca) that varies the
 *  hero's copy and locks its stat block — see app/au/page.tsx etc. */
export interface HeroRegion {
  code: Country;
  /** e.g. "Australian", "US", "UK" — reused verbatim from lib/country.ts's
   *  COUNTRIES so the hero never invents its own copy of that map. */
  adjective: string;
}

// Short, subhead-style place names — deliberately NOT CountryInfo.place (which
// spells out "the United Kingdom"/"the United States" for prose elsewhere): this
// sentence already reads "...retailer we track, plus four more markets..." and
// keeping these short is what makes it read as a list rather than a run-on.
const SHORT_PLACE: Record<Country, string> = {
  AU: "Australia",
  US: "the US",
  UK: "the UK",
  SG: "Singapore",
  CA: "Canada",
};

/** "Australia, the UK, Singapore and Canada" — every market EXCEPT
 *  the one leading the H1, so a region page never re-lists its own market as
 *  one of the "others". */
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
  // Present only on a region home page (/au, /uk, /sg, /ca). Swaps the
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
      {/* pl-[var(--sidenav-w)] on the OUTER div, container-app's own px-* stays
          on the inner one — same Tailwind cascade-order footgun noted in
          layout.tsx (a pl-* utility and container-app's px-* on the SAME
          element race in generated-CSS order, not className order). Without
          this the hero's H1/search/trending-chips column — which re-centers
          on the FULL viewport via container-app's mx-auto, same as the
          breakout background it sits inside — would render partly behind
          the fixed SideNav on every page ≥1280px, not just visually below it.
          `w-full` HERE IS LOAD-BEARING: ParallaxRoot (this div's parent) is
          `flex items-center`, and the background layer is `position:absolute`
          (out of flow), so this wrapper is the row's ONLY normal-flow flex
          item — without an explicit width a flex item sizes to its CONTENT
          (shrink-to-fit), not the row's full width, which is what actually
          broke the hero's centering the first time this shipped: the wrapper
          shrank to content width and sat at the row's flex-start (the
          left edge) instead of spanning the row for container-app's mx-auto
          to center within. The inner container-app div's own `w-full` was
          providing this before there were two nested divs; now both need it. */}
      <div className="w-full pl-[var(--sidenav-w)]">
      <div className="container-app relative z-10 w-full py-8 text-center sm:py-10">
        {/* Brand mark, centered above the headline — the nav's own logo sits
            in the fixed header, but this is the FIRST thing painted (the
            hero often IS the first viewport, above the header having
            scrolled/loaded), and the H1 below leads with "Riftbound" (the
            game), not "RiftCompare" (the site) — so nothing in the hero
            previously named the site itself at a glance. Reuses BrandLogo
            verbatim (same mark, same mask technique) rather than a new
            asset/component. */}
        <div className="animate-fade-in [animation-delay:80ms] flex items-center justify-center gap-2">
          <BrandLogo className="h-8 w-8" />
          <span className="text-lg font-extrabold tracking-tight text-white">
            Rift<span className="text-brand-400">Compare</span>
          </span>
        </div>
        {/* Kinetic headline — US-FIRST, not market-neutral. This page is cached
            (ISR) and DEFAULT_COUNTRY is "US" (lib/country.ts), which is also
            where the traffic actually is: SimilarWeb reports the real visitor
            split as ~89% US / ~11% AU, with UK/SG/CA not registering — so a
            headline enumerating five countries greeted the vast majority of
            visitors with four markets they don't live in before the one they
            do. The other four markets aren't dropped, just demoted: they're
            still named in the very next sentence (this page's own subhead),
            in the About section further down, in metadata.description and in
            the organization JSON-LD's areaServed — every one of those is real,
            crawlable text, so the geo keywords that matter for AU/SG search
            traffic (markets with far less competition than the US) survive
            the reorder. Sized to lead the page without dominating it. Capped
            at lg:text-5xl (not 6xl) with a wider max-w-4xl measure so the full
            sentence settles into ~2 lines at desktop instead of wrapping to 3.

            RECONCILED with the homepage-redesign brief's own (older, market-
            neutral, job-not-features) H1 — two independent passes rewrote
            this same line the same day. This US-first version wins: it's the
            more recent decision, backed by real traffic data rather than a
            general heuristic, and it has real infrastructure built around it
            (the HeroRegion system above, four real region pages) that a
            market-neutral H1 would leave half-orphaned. The brief's actual
            underlying goal — one short, job-focused sentence instead of a
            60-character country list — is still fully honored here, just
            phrased in the market-aware way. See DECISIONS.md for the full
            reasoning.

            "Riftbound" + "prices" ADJACENT, not split by "card": an SEO audit
            (2026-08-20, "riftbound prices" ranking ~13th) found this exact
            phrase absent from every on-page signal — title, meta description,
            H1, JSON-LD — always broken up by "Card"/"TCG". This H1 is the
            single highest-leverage place to fix that (see page.tsx's metadata
            for the matching title/description/JSON-LD fix). The subhead below
            now carries the "Riftbound cards" and "Riftbound card prices"
            variants verbatim instead, so all three of the site's target
            phrases land in the first ~45 words without stuffing any one of
            them into the H1 alongside the others. */}
        <h1 className="animate-fade-in [animation-delay:160ms] mx-auto mt-4 max-w-4xl text-3xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-4xl lg:text-5xl">
          Compare <span className="text-brand-400">Riftbound</span> prices across every {heroAdjective} store
        </h1>
        <p className="animate-fade-in [animation-delay:240ms] mx-auto mt-4 max-w-2xl text-base text-slate-300">
          Find the cheapest place to buy Riftbound cards — live Riftbound card prices from every {heroAdjective} retailer we track,
          plus four more markets in their own currency: {otherMarkets}, updated daily.
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
        {/* relative z-20: a real stacking-context bug, found auditing search
            (not merely a test-script inconvenience — confirmed with a real
            screenshot) — independently, by two separate passes at this file
            the same day, which found and fixed the identical bug the same
            way. Every direct child of this section that carries
            `animate-fade-in` (this one, TrendingChips' row, the browse-link/
            region-toggle row below) becomes a CSS stacking context for as
            long as its animation is "in effect" — which, with `animation-
            fill-mode: both`, is forever, not just during the 0.6s it plays —
            per the CSS spec, an element that is (or has been) the target of
            an animation on a stacking-context-triggering property forms one
            REGARDLESS of its own `position`/`transform` staying static/none
            afterward. None of these siblings sets an explicit z-index, so
            each is sorted as z-index:0 in THIS section's own stacking order,
            and ties break by DOM order — meaning TrendingChips (mounted
            after this div) was silently painting, and hit-testing, ABOVE
            this div's own dropdown despite the dropdown's internal `z-50`,
            because that z-50 only ever competed against siblings INSIDE this
            div's now-separate stacking context, never against TrendingChips
            directly. The visible symptom: opening the dropdown showed its
            rows visually interleaved with the trending chips underneath, and
            a real mouse click on a dropdown suggestion could land on a chip
            instead. `relative z-20` gives this whole div an EXPLICIT,
            positive stacking level at the section's own top scope — now
            unambiguously above every animation-promoted sibling regardless
            of DOM order, closing the gap for good rather than only for the
            one sibling (TrendingChips) this instance happened to be tested
            against. */}
        <div className="relative z-20 animate-fade-in [animation-delay:300ms] mt-6">
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
        <HeroStats totalCards={totalCards} statsByCountry={statsByCountry} freshness={freshness} lockCountry={region?.code} />

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
      </div>
    </ParallaxShell>
  );
}

// Full-bleed breakout shell. `-mt-6` tightens the gap to the wrap banner above;
// `left-1/2 w-screen translate-x-[calc(-50%-var(--sidenav-w)/2)]` breaks the hero
// out to the full viewport (safe because globals.css sets html{overflow-x:clip}).
//
// THE --sidenav-w TERM: `left:50%` on a `position:relative` element offsets by
// 50% of its CONTAINING BLOCK's width, not the viewport's — so once SideNav.tsx
// (via `<main>`'s `pl-[var(--sidenav-w)]` wrapper in layout.tsx) shifts that
// containing block's horizontal center right by `--sidenav-w / 2`, a bare
// `-translate-x-1/2` would land the breakout's left edge that same
// `--sidenav-w / 2` short of x=0 — a visible gap on the left and an equal
// overflow clipped on the right. The extra `-var(--sidenav-w)/2` in the
// translate cancels that out, same math as the plain-`-translate-x-1/2` case
// when `--sidenav-w` is 0 (its default below the breakpoint SideNav renders
// at), so this is provably a no-op change everywhere the old comment's
// "`main` is centred in the viewport" assumption still holds, and correct
// where it no longer does. tests/sidenav.test.ts pins the exact expression.
// min-height is kept
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
//
// NO overflow-hidden here (removed 2026-08-17): it used to contain the
// .parallax-art/.parallax-aurora background layers' translate3d/scale, which
// could otherwise bleed past the hero's edges during scroll/pointer parallax.
// Both layers — and .hero-vignette — were cut when the hero's background was
// flattened to the plain bg-ink-950 panel above (see "NOTHING FLANKS THE
// HERO" below); none of globals.css's three parallax/vignette classes are
// referenced by any component anymore. The overflow-hidden outlived them and
// became a real bug instead of dead weight: CountryHeroToggle's dropdown and
// SearchBar's suggestion list are both position:absolute descendants that sit
// INSIDE this section, so they don't grow the section's own (short, ~30vh)
// height — the ancestor's overflow-hidden was silently slicing both dropdowns
// off at the hero's bottom edge instead of letting them float over the
// content below, exactly as a z-50 absolute dropdown is meant to.
//
// z-10 here (added 2026-08-17, right after the overflow-hidden removal above):
// once the dropdowns were free to extend past the hero's own short height,
// they ran into a SECOND, previously-masked bug one level up from the
// TrendingChips stacking fix documented inside CinematicHero's own search
// wrapper. Market Pulse's marquee row (HomeSections, the very next sibling
// below this section) animates via `transform` (animate-marquee), which —
// exactly like animate-fade-in above — makes it (or its ancestor) a CSS
// stacking context regardless of its own position staying static. Neither
// this section nor Market Pulse's wrapper carried an explicit z-index, so
// they were both z-index:auto and painted in DOM order — Market Pulse, being
// LATER in the page, painted its opaque cards OVER this section's dropdowns
// instead of behind them, which read as the dropdown itself being
// see-through. An explicit, positive z-index here beats that z-index:auto
// sibling outright, regardless of DOM order — the actual fix, not a
// workaround for Market Pulse's own animation (which is correct as-is).
function ParallaxShell({ children }: { children: React.ReactNode }) {
  return (
    <ParallaxRoot id="rc-hero" className="relative z-10 left-1/2 -mt-6 flex min-h-[30vh] w-screen translate-x-[calc(-50%-var(--sidenav-w)/2)] items-center">
      {children}
    </ParallaxRoot>
  );
}
