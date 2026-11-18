"use client";

import { useEffect, useState } from "react";
import { OutboundLink } from "./OutboundLink";
import { usePremium } from "./PremiumProvider";
import { useCountry } from "./CountryProvider";
import { affiliateUrl, ebaySearchUrl } from "@/lib/affiliate";
import { inlinePicksUrl } from "@/lib/inline-picks-url";
import { railTiles, TCG_SEARCH, type MiniData, type Tile } from "./PhoneDockAds";

// The two big ad banners (owner, 2026-11-14: "separate big ad banners for TCGplayer and eBay", replacing the one mixed block of
// 2026-11-13): one banner for eBay and one for TCGplayer, side by side from lg and stacked below it, each with its own "Ad" label, a
// big "Browse on …" button and up to four real cards (eBay's cheapest live listing in the visitor's market; TCGplayer's market price),
// tagged inline_<market> / tcg_inline.
//
//   • At the TOP of every page: directly under the hero on the home pages, under the page's header or breadcrumbs elsewhere.
//   • Browser only: nothing in the server HTML (no SEO change). It asks /api/mini-picks (the same CDN-held answer as the phone dock) after
//     hydration, and both banners' height is reserved from the first paint of the client (CLS 0). A side with fewer than two tiles keeps
//     its banner and shows the button alone.
//   • Calm and native: the site's own card surface, hairline border and slate text; no brand colours, no pop-up, nothing fixed.
//   • Ad-free for Plus and Premium like every ad (data-ad-placement is hidden under the data-adfree hint, and usePremium returns null).
//   • eBay and TCGplayer only, every link through OutboundLink (rel sponsored), surface `inline_ads`. Never a store row, a best price, a
//     deal or an alert. One of each per page: pages place the pair once; articles (Mediavine) and the quick views never carry it.

export const INLINE_MAX = 4;

/** The banners' tiles: up to four of eBay's and up to four of TCGplayer's; a side with fewer than two is empty. Pure, for the tests. */
export function inlineTiles(data: MiniData, country: string, arm = ""): { ebay: Tile[]; tcg: Tile[] } {
  const all = railTiles(data, country, "inline", arm);
  const ebayAll = all.ebay.filter((t) => t.image);
  const tcgAll = all.tcg.filter((t) => t.image);
  return { ebay: ebayAll.length >= 2 ? ebayAll.slice(0, INLINE_MAX) : [], tcg: tcgAll.length >= 2 ? tcgAll.slice(0, INLINE_MAX) : [] };
}

// One fetch per set per page view.
const inflight = new Map<string, Promise<MiniData | null>>();
function load(set: string): Promise<MiniData | null> {
  let p = inflight.get(set);
  if (!p) {
    p = fetch(inlinePicksUrl(set))
      .then((r) => (r.ok ? (r.json() as Promise<MiniData>) : null))
      .catch(() => null);
    inflight.set(set, p);
  }
  return p;
}

/** One banner's height: padding 32 + head 44 + tiles 176 + note 14 (+ gap). */
export const BANNER_H = 280;

function Banner({ brand, headline, cta, ctaHref, ctaRetailer, tiles, retailer, note, pageType, country }: { brand: string; headline: string; cta: string; ctaHref: string; ctaRetailer: string; tiles: Tile[]; retailer: string; note: string; pageType: string; country: ReturnType<typeof useCountry>["country"] }) {
  return (
    <aside data-ad-placement="" data-inline-ads="" aria-label={`Sponsored: ${headline}`} className="card-surface flex min-w-0 flex-col overflow-hidden p-3 sm:p-4" style={{ height: BANNER_H }}>
      <div className="flex h-11 shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className="rounded border border-ink-700 px-1.5 text-[11px] font-bold leading-[18px] text-slate-400">Ad</span>
            <span className="text-base font-bold tracking-tight text-white">{brand}</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{headline}</p>
        </div>
        <OutboundLink href={ctaHref} retailer={ctaRetailer} country={country} pageType={pageType} surface="inline_ads" className="shrink-0 whitespace-nowrap rounded-full bg-white px-4 py-2 text-xs font-semibold text-ink-950 hover:bg-slate-200 sm:text-sm">
          {cta} →
        </OutboundLink>
      </div>
      <ul role="list" className="mt-3 flex h-[176px] shrink-0 snap-x gap-3 overflow-x-auto overflow-y-hidden">
        {tiles.map((t, i) => (
          <li key={`${retailer}-${t.key}`} className="w-[120px] shrink-0 snap-start">
            <OutboundLink href={t.href} retailer={retailer} country={country} cardId={t.cardId} cardName={t.name} price={t.cents / 100} pageType={pageType} surface="inline_ads" className="group flex h-full flex-col">
              <span className="relative block h-[100px] w-full overflow-hidden rounded-md border border-ink-700 bg-ink-950" title={`${t.name} · ${t.price}`}>
                {t.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.image} alt={t.name} width={120} height={100} loading={i < 3 ? "eager" : "lazy"} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                )}
              </span>
              <span className="mt-1.5 line-clamp-2 block h-8 text-[11px] font-semibold leading-4 text-slate-200 group-hover:text-white">{t.name}</span>
              <span className="num block h-[18px] truncate text-sm font-bold leading-[18px] text-white">{t.price}</span>
            </OutboundLink>
          </li>
        ))}
      </ul>
      <p className="mt-auto h-3.5 truncate text-[11px] leading-[14px] text-slate-400">{note}</p>
    </aside>
  );
}

// `arm` ("top" | "low") is the home page's banner-position test (HomeAdSlot): it reaches EPN's customid and buy_click's pageType.
export function InlineAds({ setCode = "", pageType, className = "", arm = "" }: { setCode?: string; pageType: string; className?: string; arm?: string }) {
  const { country } = useCountry();
  const adFree = usePremium();
  const [data, setData] = useState<MiniData | null | undefined>(undefined);
  useEffect(() => {
    if (adFree) return;
    let live = true;
    load(setCode).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [setCode, adFree]);
  if (adFree || data === null) return null;
  if (data === undefined) {
    return (
      <div className={`grid gap-3 lg:grid-cols-2 ${className}`} aria-hidden="true" data-ad-placement="">
        <div style={{ height: BANNER_H }} />
        <div style={{ height: BANNER_H }} />
      </div>
    );
  }
  const { ebay, tcg } = inlineTiles(data, country, arm);
  const pt = arm ? `${pageType}-${arm}` : pageType;
  return (
    <div className={`grid gap-3 lg:grid-cols-2 ${className}`}>
      <Banner
        brand="eBay"
        headline="Riftbound cards on eBay · live listings"
        cta="Browse on eBay"
        ctaHref={ebaySearchUrl(country, "Riftbound", `inline${arm}`)}
        ctaRetailer="ebay_inline"
        tiles={ebay}
        retailer="ebay_inline"
        note="Affiliate links: RiftCompare may earn a commission, at no extra cost to you."
        pageType={pt}
        country={country}
      />
      <Banner
        brand="TCGplayer"
        headline="Riftbound cards on TCGplayer · market prices"
        cta="Browse on TCGplayer"
        ctaHref={affiliateUrl(TCG_SEARCH, `tcg_inline${arm}`, `/${pageType}`)}
        ctaRetailer="tcgplayer_inline"
        tiles={tcg}
        retailer="tcgplayer_inline"
        note={`Affiliate links: RiftCompare may earn a commission, at no extra cost to you.${country !== "US" ? " Prices in US$." : ""}`}
        pageType={pt}
        country={country}
      />
    </div>
  );
}
