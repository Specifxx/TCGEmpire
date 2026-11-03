"use client";

import { OutboundLink } from "./OutboundLink";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { usePremium } from "./PremiumProvider";
import { useCountry } from "./CountryProvider";
import { formatMoney } from "@/lib/format";
import { affiliateUrl } from "@/lib/affiliate";

export interface TcgPick {
  cardId: string;
  name: string;
  imageUrl: string;
  /** US cents: TCGplayer's market price, or its cheapest listing when `market` is false. */
  priceCents: number;
  url: string;
  market: boolean;
}

// Same page keys as EbayPicksLive, for the Impact sub-id (`rc-<page>-tcg_strip`).
const PAGE: Record<string, string> = { homepage: "/", browse: "/browse", set_hub: "/sets", article: "/blog", card_detail: "/card" };
const SEARCH = "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product";
const ACCENT = "#1f6fe5";
const MIN_TILES = 4;

/**
 * Client half of the TCGplayer card strip (TcgplayerPicks.tsx): the Gundam
 * Compare design the owner picked on 2026-10-29. A boxed, horizontally
 * scrolling row of real card art, each with TCGplayer's price on a badge, a
 * "Shop TCGplayer" button and an end tile, the "Ad" label and the disclosure
 * directly under it. Hidden for ad-free members like every other ad. TCGplayer
 * is the US marketplace: prices stay US$, and outside the US the line says so.
 */
export function TcgplayerPicksLive({
  picks,
  heading,
  searchName,
  className,
  pageType,
}: {
  picks: TcgPick[];
  heading: string;
  searchName: string;
  className?: string;
  pageType: string;
}) {
  const { country } = useCountry();
  const adFree = usePremium();
  if (adFree || picks.length < MIN_TILES) return null;
  const page = PAGE[pageType] ?? "/";
  const searchHref = affiliateUrl(`${SEARCH}?q=${encodeURIComponent(searchName)}&view=grid`, "tcg_strip", page);
  const tagline = country === "US" ? "Market prices from thousands of US sellers" : "US marketplace · prices in US$";
  return (
    <section
      data-ad-placement=""
      aria-label={heading}
      className={`overflow-hidden rounded-xl border bg-ink-900/60 ${className ?? ""}`}
      style={{ borderColor: `${ACCENT}55`, backgroundImage: `linear-gradient(135deg, ${ACCENT}14, transparent 55%)` }}
    >
      <div className="flex items-center gap-3 px-4 pt-3">
        <span className="shrink-0 text-xl font-black tracking-tight" aria-label="TCGplayer">
          <span className="text-white">TCG</span>
          <span style={{ color: "#4fa3ff" }}>player</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-bold leading-tight text-white">{heading}</p>
          <p className="truncate text-[11px] text-slate-400">{tagline}</p>
        </div>
        <span className="rounded bg-ink-950/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ad</span>
        <OutboundLink
          href={searchHref}
          retailer="tcgplayer_strip"
          country={country}
          pageType={pageType}
          surface="tcg_strip"
          className="hidden shrink-0 rounded-md bg-[#1f6fe5] px-2.5 py-1 text-xs font-bold text-white sm:inline-block"
        >
          Shop TCGplayer →
        </OutboundLink>
      </div>
      <ul className="flex snap-x gap-3 overflow-x-auto px-4 pb-2 pt-3">
        {picks.map((p) => (
          <li key={p.cardId} className="w-[136px] shrink-0 snap-start">
            <OutboundLink
              href={affiliateUrl(p.url, "tcg_strip", page)}
              retailer="tcgplayer_strip"
              country={country}
              cardId={p.cardId}
              cardName={p.name}
              price={p.priceCents / 100}
              pageType={pageType}
              surface="tcg_strip"
              className="group flex h-full flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-900 transition hover:-translate-y-0.5 hover:border-[#1f6fe5]"
            >
              <span className="relative block aspect-[5/7] bg-ink-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-contain p-1.5 transition group-hover:scale-[1.03]" />
                <span className="num absolute bottom-1.5 right-1.5 rounded-md bg-[#1f6fe5] px-1.5 py-0.5 text-xs font-black text-white shadow">
                  {formatMoney(p.priceCents, "USD")}
                </span>
              </span>
              <span className="flex flex-1 flex-col gap-0.5 p-2">
                <span className="line-clamp-2 text-xs font-medium leading-tight text-white">{p.name}</span>
                <span className="mt-auto text-[11px] text-slate-400">{p.market ? "TCGplayer market" : "On TCGplayer"}</span>
              </span>
            </OutboundLink>
          </li>
        ))}
        <li className="w-[136px] shrink-0 snap-start">
          <OutboundLink
            href={searchHref}
            retailer="tcgplayer_strip"
            country={country}
            pageType={pageType}
            surface="tcg_strip"
            className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600 p-3 text-center hover:border-[#1f6fe5]"
          >
            <span className="rounded-full bg-[#1f6fe5] px-3 py-1 text-xs font-bold text-white">
              Shop TCGplayer →
            </span>
            <span className="text-[11px] text-slate-400">Every listing, sorted by price</span>
          </OutboundLink>
        </li>
      </ul>
      <div className="px-4 pb-3">
        <AffiliateDisclosure partner="tcgplayer" tight />
      </div>
    </section>
  );
}
