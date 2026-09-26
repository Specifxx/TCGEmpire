"use client";

import type { ComponentProps } from "react";
import { useCountry } from "./CountryProvider";
import { OutboundLink } from "./OutboundLink";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { ebayLabel, ebaySearchUrl, riftboundEbayQuery } from "@/lib/affiliate";
import { shortCardName } from "@/lib/card-name";

// eBay search links for pages that render once for every market (2026-09-26,
// "Pushing eBay clicks" in DECISIONS.md). Articles are ISR and cookie-free, so
// the server cannot know which eBay a visitor shops on; these build the href
// and the "eBay UK" / "eBay Australia" label on the client from useCountry(),
// the way EbayBuyCta and ArticleShopStrip already do.
//
// Every query goes through riftboundEbayQuery, so it names the game exactly
// once — that also drops commas, so an eBay "(a,b)" OR group cannot be passed
// through here. Each link carries a caller-chosen EPN `source` and buy_click
// `pageType` / `surface`; the caller renders the AffiliateDisclosure beside it
// (EbayCardSearchRow below carries its own).

type Surface = ComponentProps<typeof OutboundLink>["surface"];

/** One eBay search link. `label` is a template: "{ebay}" becomes the visitor's
 *  eBay ("eBay", "eBay UK" …), e.g. "Search {ebay} for Radiance". */
export function EbayCountryLink({
  query,
  source,
  label,
  className,
  pageType,
  surface = "ebay_search",
}: {
  query: string;
  source: string;
  label: string;
  className?: string;
  pageType: string;
  surface?: Surface;
}) {
  const { country } = useCountry();
  return (
    <OutboundLink
      href={ebaySearchUrl(country, riftboundEbayQuery(query), source)}
      retailer="ebay_search"
      country={country}
      pageType={pageType}
      surface={surface}
      className={className}
    >
      {label.replace("{ebay}", ebayLabel(country))}
    </OutboundLink>
  );
}

/**
 * "Search eBay: Neeko → · Seraphine →" under a SMALL gallery of current-set
 * cards — the spoiler posts' "where can I get this card" moment. ArticleView
 * decides when it shows (2–6 cards, every one from a current set, never the
 * filterable 400-card tracker); this only draws it. Names only cross the
 * server/client boundary, never the tile data.
 *
 * Labels use the short name ("Neeko", not "Neeko, Blending In"), falling back
 * to the full name when two cards in the row would read the same; two printings
 * with the identical name are one search, so they get one link.
 */
export function EbayCardSearchRow({
  names,
  source,
  pageType,
}: {
  names: string[];
  source: string;
  pageType: string;
}) {
  const { country } = useCountry();
  const unique = [...new Map(names.map((n) => [riftboundEbayQuery(n), n])).entries()];
  const shorts = unique.map(([, n]) => shortCardName(n));
  if (unique.length === 0) return null;

  return (
    <div data-ebay-gallery className="mt-3">
      <p className="flex flex-wrap items-center gap-x-4 text-sm">
        <span className="text-slate-400">Search {ebayLabel(country)}:</span>
        {unique.map(([q, name], i) => {
          const short = shorts[i];
          const clash = shorts.filter((s) => s === short).length > 1;
          return (
            <OutboundLink
              key={q}
              href={ebaySearchUrl(country, q, source)}
              retailer="ebay_search"
              country={country}
              cardName={name}
              pageType={pageType}
              surface="ebay_search"
              positionInList={i + 1}
              className="tap-link min-h-11 text-sky-300 underline-offset-2 hover:underline"
            >
              {clash ? name : short} →
            </OutboundLink>
          );
        })}
      </p>
      <AffiliateDisclosure partner="ebay" tight />
    </div>
  );
}
