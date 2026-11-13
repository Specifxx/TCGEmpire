"use client";

import { useEffect, useState, type ReactNode } from "react";
import { OutboundLink } from "./OutboundLink";
import { usePremium } from "./PremiumProvider";
import { useCountry } from "./CountryProvider";
import { formatMoney } from "@/lib/format";
import { affiliateUrl } from "@/lib/affiliate";
import { ebayImg } from "@/lib/ebay";
import { selectPicks, type PickListing } from "./EbayPicksLive";
import type { TcgPick } from "./TcgplayerPicksLive";
import { AdDock, DockGate, DockTile, DOCK_LINK, type DockSide } from "./AdDock";

// The phone dock (owner, 2026-11-06) and the tile model shared with the in-page ad block (InlineAds.tsx). The side rails that used to
// live here are gone (owner, 2026-11-13: replaced by the one horizontal block inside the page).
//
// The dock: eBay's cheapest live listing in the visitor's market and TCGplayer's market price, from /api/mini-picks, in one bar along
// the foot of a screen under MIN_WIDTH, asked for only once the visitor scrolls (AdDock.tsx has the rules). Ad-free for Plus and Premium.

export const MIN_WIDTH = 1280;
export const MAX_TILES = 10;
export const TCG_SEARCH = "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product?view=grid";

export interface MiniData {
  set: string;
  ebay: PickListing[];
  tcg: TcgPick[];
}

export type Tile = { key: string; href: string; image: string | null; name: string; price: string; cardId: string; cents: number };

/** The dock's and the in-page block's tiles, each tagged with where it shows (dock_us / inline_us, tcg_dock / tcg_inline). Pure. */
export function railTiles(data: MiniData, country: string, where: "inline" | "dock"): { ebay: Tile[]; tcg: Tile[] } {
  const ebay: Tile[] = selectPicks(data.ebay, country, MAX_TILES).map((l) => ({
    key: l.cardId,
    href: affiliateUrl(l.url, `${where}_${l.country.toLowerCase()}`, `/${where}-ads`),
    image: l.imageUrl ? ebayImg(l.imageUrl, 225) : null,
    name: l.cardName,
    price: formatMoney(l.priceCents, l.currency),
    cardId: l.cardId,
    cents: l.priceCents,
  }));
  const tcg: Tile[] = data.tcg.slice(0, MAX_TILES).map((p) => ({
    key: p.cardId,
    href: affiliateUrl(p.url, `tcg_${where}`, `/${where}-ads`),
    image: p.imageUrl,
    name: p.name,
    price: formatMoney(p.priceCents, "USD"),
    cardId: p.cardId,
    cents: p.priceCents,
  }));
  return { ebay, tcg };
}

export function PhoneDockAds() {
  const adFree = usePremium();
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MIN_WIDTH}px)`);
    const update = () => setNarrow(!mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  if (!narrow || adFree) return null;
  return (
    <DockGate minWidth={MIN_WIDTH}>
      <PhoneDock />
    </DockGate>
  );
}

/**
 * The phone dock (owner, 2026-11-06: the rails "on mobile … in the best way that doesn't interrupt user experience"): the rails'
 * tiles from the same /api/mini-picks answer, eBay and TCGplayer taking turns, in one bar along the foot of a narrow screen.
 * AdDock.tsx has the rules: it yields to every ad unit ([data-ad-placement]) and the rating card ([data-rate-prompt], the visit's
 * one prompt), never shows on a card page (its buy bar, .buybar) or for Plus/Premium; the corner buttons lift above it
 * (globals.css, html[data-ad-dock]). Tagged dock_<market> / tcg_dock, surface ad_dock.
 */
function PhoneDock() {
  const { country } = useCountry();
  const [data, setData] = useState<MiniData | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/mini-picks")
      .then((r) => (r.ok ? (r.json() as Promise<MiniData>) : null))
      .then((d) => live && d && setData(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!data) return null;
  const { ebay, tcg } = railTiles(data, country, "dock");
  const brandEbay = (
    <span className="font-extrabold tracking-tight" aria-label="eBay">
      <span className="text-[#e53238]">e</span>
      <span className="text-[#0064d2]">b</span>
      <span className="text-[#f5af02]">a</span>
      <span className="text-[#86b817]">y</span>
    </span>
  );
  const brandTcg = (
    <span className="font-black tracking-tight" aria-label="TCGplayer">
      <span className="text-white">TCG</span>
      <span className="text-[#4fa3ff]">player</span>
    </span>
  );
  const link = (t: Tile, retailer: string, brand: ReactNode) => (
    <OutboundLink key={t.key} href={t.href} retailer={retailer} country={country} cardId={t.cardId} cardName={t.name} price={t.cents / 100} pageType="dock-rail" surface="ad_dock" className={DOCK_LINK}>
      <DockTile img={t.image!} alt={t.name} brand={brand} title={t.name} price={t.price} cta="View" />
    </OutboundLink>
  );
  const sides: DockSide[] = [];
  const e = ebay.filter((t) => t.image);
  const g = tcg.filter((t) => t.image);
  if (e.length >= 2) sides.push({ key: "ebay", items: e.map((t) => link(t, "ebay_dock", brandEbay)) });
  if (g.length >= 2) sides.push({ key: "tcgplayer", items: g.map((t) => link(t, "tcgplayer_dock", brandTcg)) });
  if (sides.length === 0) return null;
  return <AdDock label="Sponsored: Riftbound cards on eBay and TCGplayer" sides={sides} placement="dock-rail" minWidth={MIN_WIDTH} yieldTo="[data-ad-placement], [data-rate-prompt]" buybar=".buybar" />;
}
