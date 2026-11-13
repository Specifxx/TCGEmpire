import { Suspense } from "react";
import Link from "next/link";
import { SiteRatingBadge } from "@/components/SiteRatingBadge";
import type { SiteRating } from "@/lib/site-rating";
import { ParallaxRoot } from "./ParallaxRoot";
import { CountryHeroToggle } from "@/components/CountryHeroToggle";
import { SearchBar } from "@/components/SearchBar";
import { NavIcon, type NavIconName } from "@/components/NavIcon";
import { HeroStats, type MarketStat } from "./HeroStats";
import { RiftEmbers } from "./RiftEmbers";
import { NocturneComing } from "./NocturneComing";
import { HalloweenDecor } from "./HalloweenDecor";
import { ChristmasGifts } from "./ChristmasGifts";
import type { CardTileData } from "@/components/CardTile";
import type { Country } from "@/lib/country";

/** The bit of a region home page (/au, /uk, /sg, /ca) that varies the
 *  hero's copy and locks its stat block — see app/au/page.tsx etc. */
export interface HeroRegion {
  code: Country;
  /** e.g. "Australian", "US", "UK" — reused verbatim from lib/country.ts's
   *  COUNTRIES so the hero never invents its own copy of that map. */
  adjective: string;
}

// Short place names for the h1 of a region page ("Riftbound Card Prices in the UK"), deliberately NOT
// CountryInfo.place, which spells out "the United Kingdom" for prose elsewhere.
const SHORT_PLACE: Record<Country, string> = {
  AU: "Australia",
  US: "the US",
  UK: "the UK",
  SG: "Singapore",
  CA: "Canada",
  // "Europe", not "the EU": after "in" this reads as a place. The market's formal label is COUNTRIES.EU.label.
  EU: "Europe",
};

// THE WAYS IN (owner, 2026-11-13: "the product's very easy to access rather than have everything everywhere all at
// once"). Six doors to the six things people come for, each a real route, drawn with the site's own line icons. They
// replace the hero's six trending-card chips, its "All N cards" link and its Premium link: a card is one search away,
// and the search's own empty state still lists the trending ones. The same six on every region home.
const WAYS: { href: string; label: string; icon: NavIconName }[] = [
  { href: "/browse", label: "Card database", icon: "browse" },
  { href: "/sealed", label: "Sealed", icon: "collection" },
  { href: "/tools/deal-finder", label: "Deals", icon: "deals" },
  { href: "/sets", label: "Sets", icon: "news" },
  { href: "/price-guide", label: "Price guide", icon: "prices" },
  { href: "/decks", label: "Decks", icon: "decks" },
];

/** The entrance order of one part of the hero (globals.css `.rb-rise`): each part rises 80ms after the one before. */
const riseAt = (i: number) => ({ "--rise": i }) as React.CSSProperties;

// THE HOME PAGE'S HERO: WORDS, THE SEARCH AND SIX WAYS IN (owner, 2026-11-13: "get rid of the products on the hero",
// "minimalistic, dynamic, aesthetic and smooth without having everything there"; DECISIONS.md "Minimal redesign: one
// navigation, a hero of words and search"). Top to bottom, centred:
//   1. at most ONE small eyebrow pill, in season (the Christmas gift guide; Nocturne at Halloween),
//   2. the h1, word for word what it was (the head term; tests/keyword-ownership.test.ts),
//   3. the buy phrase and one short line,
//   4. the card search, the page's main action (from sm; a phone has the header's own full-width search directly
//      above this, always visible, so a second box here would be the same control twice in one screen),
//   5. the market switch,
//   6. the six ways in,
//   7. one quiet line of numbers.
// What left it, and where each lives now: the creators badge (/creators, in the menu and the footer), the repeated
// logo (the header has it), the ornament rule, the six trending chips (the search's empty state), "All N cards in the
// database" (the Card database tile and the header's Database link) and "Get Premium" (the header's Pricing link).
//
// It breaks out of the centred content column to fill the window (left-1/2 + w-screen + -translate-x-1/2); the
// decorative layers are aria-hidden and the foreground re-aligns to the column through container-app. ParallaxRoot is
// a plain server element kept for the stable `#rc-hero` marker other components watch.
//
// MOTION is CSS only (globals.css): the parts rise in one after another (`.rb-rise`), never the h1, which is the LCP
// element and paints at once; all of it is off under prefers-reduced-motion.
//
// SERVER/CLIENT: this is a server component. The interactive leaves (SearchBar, CountryHeroToggle, HeroStats) are
// their own client components, so the h1 and the copy are in the HTML without waiting for hydration.
export function CinematicHero({
  totalCards,
  statsByCountry,
  trendingCards,
  freshness,
  freshnessAt,
  region,
  rating,
}: {
  totalCards: number;
  // Per-market counts for the stat line. Without a `region` they follow the country switcher (HeroStats is a client
  // leaf); with one, the line is locked to it, since a URL that names a market must not drift.
  statsByCountry: Record<Country, MarketStat>;
  // The search's empty-state suggestions (SearchBar's zero state). No longer drawn as chips.
  trendingCards: CardTileData[];
  freshness: string | null;
  /** ISO time of the last import: the stat line's client leaf recounts the age from it on each visit. */
  freshnessAt?: string | null;
  // Set only by RegionHome (/au, /uk, /sg, /ca, /eu). Undefined on "/" itself.
  region?: HeroRegion;
  /** The site's rating, shown only once enough real ratings exist (SiteRatingBadge decides). */
  rating?: SiteRating | null;
}) {
  // "US" on the root page (US first, owner 2026-09-24); a region page passes its own.
  const heroAdjective = region?.adjective ?? "US";
  return (
    <ParallaxShell>
      {/* Background: flat band, the slow vortex, the embers. All decorative. */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="rb-hero-band absolute inset-0 border-b border-ink-800 bg-ink-950" />
        <div className="rb-depth-slow absolute inset-0">
          <div className="rb-vortex" />
        </div>
        <RiftEmbers />
        <HalloweenDecor />
        <div className="rb-paranoia absolute inset-0" />
      </div>

      <div className="rb-hero-content container-app relative z-10 w-full py-8 text-center sm:py-14 lg:py-16">
        {/* The one eyebrow, in season only: each of these renders nothing outside its own season. */}
        <div className="rb-rise" style={riseAt(0)}>
          <NocturneComing />
          <ChristmasGifts />
        </div>

        <h1 className="mx-auto max-w-4xl text-[2rem] font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
          <span className="rb-flame-text rb-flame-live">Riftbound</span> Card Prices{region ? ` in ${SHORT_PLACE[region.code]}` : ""}
        </h1>

        <p className="rb-rise mx-auto mt-4 max-w-4xl text-slate-300 sm:mt-5" style={riseAt(1)}>
          <strong className="block text-lg font-semibold text-white sm:text-xl">Buy Riftbound cards at the best price</strong>
          <span className="mt-1.5 block text-sm leading-relaxed sm:text-base">
            Price check any card and find the cheapest place to buy — live Riftbound prices from every {heroAdjective} retailer we track, updated daily.
          </span>
        </p>

        {/* The main action. z-20 keeps its dropdown above the parts below it. The Suspense is the guard for
            SearchBar's useSearchParams; the real input is in the server HTML. */}
        <div className="rb-rise relative z-20 mt-7 hidden sm:block" style={riseAt(2)}>
          <Suspense fallback={<div className="input mx-auto h-14 max-w-2xl" />}>
            <SearchBar variant="hero" autoFocusDesktop trendingCards={trendingCards} />
          </Suspense>
        </div>

        <div className="rb-rise" style={riseAt(3)}>
          <CountryHeroToggle />
        </div>

        <nav aria-label="Start here" className="rb-rise mx-auto mt-6 grid max-w-3xl grid-cols-3 gap-2 sm:mt-8 sm:grid-cols-6 sm:gap-3" style={riseAt(4)}>
          {WAYS.map((w) => (
            <Link key={w.href} href={w.href} prefetch={false} className="rb-way">
              <NavIcon name={w.icon} className="h-5 w-5" />
              <span>{w.label}</span>
            </Link>
          ))}
        </nav>

        <div className="rb-rise" style={riseAt(5)}>
          <SiteRatingBadge rating={rating} className="mt-5" />
          <HeroStats totalCards={totalCards} statsByCountry={statsByCountry} freshness={freshness} freshnessAt={freshnessAt} lockCountry={region?.code} />
        </div>
      </div>
    </ParallaxShell>
  );
}

// `left-1/2 w-screen -translate-x-1/2` breaks the hero out of <main>'s centred column to the window's edges (the
// column is centred in the window since the rail went, so half and half is exact). `-mt-6` cancels <main>'s top
// padding so the band meets the header.
function ParallaxShell({ children }: { children: React.ReactNode }) {
  return (
    <ParallaxRoot id="rc-hero" className="relative left-1/2 z-10 -mt-6 flex min-h-[30vh] w-screen -translate-x-1/2 items-center">
      {children}
    </ParallaxRoot>
  );
}
