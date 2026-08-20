"use client";

import { useCountry } from "@/components/CountryProvider";
import { CountUp } from "@/components/CountUp";
import type { Country } from "@/lib/country";

// Per-market figures for the hero stat tiles. Serialized for all four markets so the
// tiles can localise to the visitor's market client-side (the page itself is ISR-
// cached and market-neutral). `cards` is global, so it lives outside this.
//
// `priced`/`inStock` are still computed and threaded through from page.tsx (see
// that file's own Prisma queries — untouched by this component) even though
// this compressed line no longer displays them. Trimming those queries out of
// page.tsx is a separate, higher-risk data-plumbing change this phase didn't
// make; keeping the shape stable here means that's a future no-op cleanup
// rather than something this rebuild needed to force.
export interface MarketStat {
  priced: number;
  inStock: number;
  stores: number;
}

// The hero stat line — reactive to the country switcher. Reads the active
// market from CountryProvider and shows that market's store count alongside
// the global card count and the last-refresh freshness signal.
//
// Compressed to ONE line per the homepage-redesign brief: `{cards} cards ·
// {stores} {market} stores · prices updated {freshness}`. This used to be two
// lines and four clauses (cards / priced / in-stock listings / stores), three
// of them wrapped in links to /browse, /tools/deal-finder and /stores/tracked.
// The brief is explicit that this line is "trust signal, not navigation" —
// plain text now, no links, on purpose: /browse is already one click away via
// the hero's own "Browse all N cards →" link just below the search box (see
// CinematicHero), and /tools/deal-finder + /stores/tracked stay reachable
// through the site-wide nav/footer (nav-groups.ts → FOOTER_GROUPS), same as
// everything else this rebuild moved out of the hero rather than deleted.
// Removing three interactive targets from here also helps the page's
// above-the-fold interactive-target budget, but that's a side effect of
// following the brief's explicit instruction, not the reason for it.
//
// `freshness` is a pre-formatted "Xh ago"-style string, computed SERVER-SIDE
// once (see app/page.tsx) from the real max(RetailerPrice.lastSeen) and passed
// down as plain text — deliberately NOT recomputed client-side. This page is
// ISR-cached, so the server-render timestamp and the moment a visitor hydrates
// can be up to an hour apart; a component that called timeAgo() again on the
// client would read a DIFFERENT elapsed time than what the server rendered and
// throw a hydration mismatch. Baking the string once, like every other server-
// computed figure on this page, avoids that entirely.
export function HeroStats({
  totalCards,
  statsByCountry,
  freshness,
  lockCountry,
}: {
  totalCards: number;
  statsByCountry: Record<Country, MarketStat>;
  freshness?: string | null;
  /** Region home pages (/au, /uk, /sg, /ca) show THAT market's own stat on
   *  first paint regardless of the visitor's actual market — the whole point of
   *  a region-specific landing page — so they lock this instead of reading the
   *  site-wide switcher. Omitted everywhere else (the real homepage), where the
   *  stat still follows useCountry() exactly as before. */
  lockCountry?: Country;
}) {
  const { country: switcherCountry } = useCountry();
  const country = lockCountry ?? switcherCountry;
  const s = statsByCountry[country] ?? statsByCountry.AU;
  const storeWord = s.stores === 1 ? "store" : "stores";

  return (
    <div className="mt-3 text-center">
      {/* No entrance animation here (unlike its siblings in CinematicHero): this
          line is Lighthouse's LCP element on mobile, and an opacity-0 → 1 fade
          with a staggered delay pushes back the moment it's actually painted,
          directly inflating LCP. It's real informational content, not
          decoration, so it renders immediately with the rest of the SSR'd hero. */}
      <p className="num text-xs text-slate-500 sm:text-sm">
        <CountUp value={totalCards} /> cards · <CountUp value={s.stores} /> {country} {storeWord}
        {freshness && (
          <>
            {" "}
            · <span aria-hidden="true" className="text-up">●</span> prices updated {freshness}
          </>
        )}
      </p>
    </div>
  );
}
