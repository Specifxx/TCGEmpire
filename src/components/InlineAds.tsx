"use client";

import { useEffect, useState } from "react";
import { OutboundLink } from "./OutboundLink";
import { usePremium } from "./PremiumProvider";
import { useCountry } from "./CountryProvider";
import { affiliateUrl, ebaySearchUrl } from "@/lib/affiliate";
import { railTiles, TCG_SEARCH, type MiniData, type Tile } from "./PhoneDockAds";

// The one in-page ad block (owner, 2026-11-13, replacing the side rails and the small MiniPicks / EbayPicks / TcgplayerPicks strips):
// a full-column-width card with a row of larger tiles (eBay's cheapest live listing in the visitor's market first, TCGplayer's market
// price after), each naming its marketplace in words, labelled "Ad" and tagged inline_<market> / tcg_inline.
//
//   • Browser only: nothing in the server HTML (no SEO change). It asks /api/mini-picks (the same CDN-held answer as the phone dock) after
//     hydration, and the card's height is reserved from the first paint of the client (CLS 0) so the tiles arriving move nothing.
//   • Calm and native: the site's own card surface, hairline border and slate text; no brand colours, no pop-up, nothing fixed.
//   • Ad-free for Plus and Premium like every ad (data-ad-placement is hidden under the data-adfree hint, and usePremium returns null).
//   • eBay and TCGplayer only, every link through OutboundLink (rel sponsored), surface `inline_ads`. Never a store row, a best price, a
//     deal or an alert. One per page: pages place it once; articles (Mediavine) and the quick views never carry it.

export const INLINE_MAX = 6;

/** The block's tiles: up to three of eBay's, then TCGplayer's to fill six; a side with fewer than two tiles is dropped. Pure, for the tests. */
export function inlineTiles(data: MiniData, country: string): { ebay: Tile[]; tcg: Tile[] } {
  const all = railTiles(data, country, "inline");
  const ebayAll = all.ebay.filter((t) => t.image);
  const tcgAll = all.tcg.filter((t) => t.image);
  const eN = ebayAll.length >= 2 ? Math.min(ebayAll.length, tcgAll.length >= 2 ? 3 : INLINE_MAX) : 0;
  const tN = tcgAll.length >= 2 ? Math.min(tcgAll.length, INLINE_MAX - eN) : 0;
  const ebay = ebayAll.slice(0, eN);
  const tcg = tcgAll.slice(0, tN);
  return ebay.length + tcg.length >= 3 ? { ebay, tcg } : { ebay: [], tcg: [] };
}

// One fetch per set per page view.
const inflight = new Map<string, Promise<MiniData | null>>();
function load(set: string): Promise<MiniData | null> {
  let p = inflight.get(set);
  if (!p) {
    p = fetch(`/api/mini-picks${set ? `?set=${encodeURIComponent(set)}` : ""}`)
      .then((r) => (r.ok ? (r.json() as Promise<MiniData>) : null))
      .catch(() => null);
    inflight.set(set, p);
  }
  return p;
}

// Reserved height: label row + 5:7 picture of TILE_W + two-line title + price + padding.
const TILE_W = 152;
const BLOCK_MIN_H = 24 + Math.round((TILE_W * 7) / 5) + 8 + 36 + 22 + 28 + 40;

export function InlineAds({ setCode = "", pageType, className = "" }: { setCode?: string; pageType: string; className?: string }) {
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
  const { ebay, tcg } = data ? inlineTiles(data, country) : { ebay: [], tcg: [] };
  const tiles = [...ebay.map((t) => ({ t, brand: "eBay", retailer: "ebay_inline" })), ...tcg.map((t) => ({ t, brand: "TCGplayer", retailer: "tcgplayer_inline" }))];
  if (data && tiles.length === 0) return null;
  const hasEbay = ebay.length > 0;
  const hasTcg = tcg.length > 0;
  return (
    <aside
      data-ad-placement=""
      data-inline-ads=""
      aria-label="Sponsored: Riftbound cards on eBay and TCGplayer"
      className={`card-surface min-w-0 p-4 ${className}`}
      style={{ minHeight: BLOCK_MIN_H }}
    >
      <p className="mb-3 flex items-center gap-2 text-xs text-slate-400">
        <span className="rounded border border-ink-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Ad</span>
        <span>Riftbound cards on {hasEbay && hasTcg ? "eBay and TCGplayer" : hasEbay ? "eBay" : "TCGplayer"}</span>
      </p>
      {data && (
        <>
          <ul role="list" className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {tiles.map(({ t, brand, retailer }) => (
              <li key={`${retailer}-${t.key}`} className="shrink-0 snap-start" style={{ width: TILE_W }}>
                <OutboundLink
                  href={t.href}
                  retailer={retailer}
                  country={country}
                  cardId={t.cardId}
                  cardName={t.name}
                  price={t.cents / 100}
                  pageType={pageType}
                  surface="inline_ads"
                  className="group flex flex-col"
                >
                  <span className="relative block aspect-[5/7] w-full overflow-hidden rounded-md border border-ink-700 bg-ink-950" title={`${t.name} · ${t.price}`}>
                    {t.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.image} alt={t.name} width={TILE_W} height={Math.round((TILE_W * 7) / 5)} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{brand}</span>
                  <span className="mt-0.5 line-clamp-2 block h-9 text-xs font-semibold leading-[18px] text-slate-200 group-hover:text-white">{t.name}</span>
                  <span className="num mt-0.5 block text-sm font-bold text-white">{t.price}</span>
                </OutboundLink>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] leading-tight text-slate-400">
            {hasEbay && (
              <OutboundLink href={ebaySearchUrl(country, "Riftbound", "inline")} retailer="ebay_inline" country={country} pageType={pageType} surface="inline_ads" className="font-semibold underline-offset-2 hover:underline">
                See more on eBay →
              </OutboundLink>
            )}
            {hasTcg && (
              <OutboundLink href={affiliateUrl(TCG_SEARCH, "tcg_inline", `/${pageType}`)} retailer="tcgplayer_inline" country={country} pageType={pageType} surface="inline_ads" className="font-semibold underline-offset-2 hover:underline">
                See more on TCGplayer →
              </OutboundLink>
            )}
            <span>Affiliate links: RiftCompare may earn a commission, at no extra cost to you.{hasTcg && country !== "US" ? " TCGplayer prices in US$." : ""}</span>
          </p>
        </>
      )}
    </aside>
  );
}
