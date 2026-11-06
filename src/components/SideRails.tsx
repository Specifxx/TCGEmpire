"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { OutboundLink } from "./OutboundLink";
import { usePremium } from "./PremiumProvider";
import { useCountry } from "./CountryProvider";
import { formatMoney } from "@/lib/format";
import { affiliateUrl, ebaySearchUrl } from "@/lib/affiliate";
import { ebayImg } from "@/lib/ebay";
import { selectPicks, type PickListing } from "./EbayPicksLive";
import type { TcgPick } from "./TcgplayerPicksLive";
import { AdDock, DockGate, DockTile, DOCK_LINK, type DockSide } from "./AdDock";

// The two side rails (owner, 2026-11-06: the DexCompare / MTG Compare layout, "the actual site is a little thinner and then you
// have the two ad banners, one for eBay, one for TCGplayer, on the sides … on the home page … and when you go to other pages"):
// the chase cards of MiniPicks (/api/mini-picks, the same CDN-held answer), eBay's cheapest live listing in the visitor's market
// down the left beside the navigation rail, TCGplayer's market price down the right, ten tiles each that scroll.
//
//   • Browser only, from 1280px wide (every regular 16:9 and 16:10 screen) and a window tall enough for one whole tile. Nothing is
//     in the server HTML (no SEO change); the room beside the column is CSS (globals.css "The side rails"), so CLS is 0.
//   • Ad-free for Plus and Premium, like every ad: no rails, and the column keeps its full width (:root[data-adfree]).
//   • Labelled "Ad", every link an affiliate link through OutboundLink, surface `side_rails`.

export const MIN_WIDTH = 1280;
export const RAIL_W = 136;
const GUTTER = 12;
/** container-app's widest (1400px): from there the rails sit just outside the column instead of at the window's edges. */
const COLUMN_MAX = 1400;
const HDR = 64;
const HEAD = 30;
const NOTE = 34;
const PAD = 16;
export const TILE_H = 6 + Math.round(((RAIL_W - PAD - 12) * 7) / 5) + 4 + 18 + 20 + 6;
export const MAX_TILES = 10;
const TCG_SEARCH = "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product?view=grid";

/** Whether a window this tall holds a rail with one whole tile in view. Pure, for the tests. */
export function railFits(innerHeight: number): boolean {
  return innerHeight - HDR - 2 * GUTTER - HEAD - NOTE - PAD >= TILE_H;
}

interface MiniData {
  set: string;
  ebay: PickListing[];
  tcg: TcgPick[];
}

type Tile = { key: string; href: string; image: string | null; name: string; price: string; cardId: string; cents: number };

/** The rails' (or the phone dock's) tiles, each tagged with where it shows (side_us / dock_us, tcg_side / tcg_dock). Pure. */
export function railTiles(data: MiniData, country: string, where: "side" | "dock"): { ebay: Tile[]; tcg: Tile[] } {
  const ebay: Tile[] = selectPicks(data.ebay, country, MAX_TILES).map((l) => ({
    key: l.cardId,
    href: affiliateUrl(l.url, `${where}_${l.country.toLowerCase()}`, `/${where}-rail`),
    image: l.imageUrl ? ebayImg(l.imageUrl, 225) : null,
    name: l.cardName,
    price: formatMoney(l.priceCents, l.currency),
    cardId: l.cardId,
    cents: l.priceCents,
  }));
  const tcg: Tile[] = data.tcg.slice(0, MAX_TILES).map((p) => ({
    key: p.cardId,
    href: affiliateUrl(p.url, `tcg_${where}`, `/${where}-rail`),
    image: p.imageUrl,
    name: p.name,
    price: formatMoney(p.priceCents, "USD"),
    cardId: p.cardId,
    cents: p.priceCents,
  }));
  return { ebay, tcg };
}

export function SideRails() {
  const adFree = usePremium();
  const { country } = useCountry();
  const [fit, setFit] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [data, setData] = useState<MiniData | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MIN_WIDTH}px)`);
    const update = () => {
      setFit(mq.matches && railFits(window.innerHeight));
      setNarrow(!mq.matches);
    };
    update();
    mq.addEventListener("change", update);
    window.addEventListener("resize", update, { passive: true });
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  useEffect(() => {
    if (!fit || adFree || data) return;
    let live = true;
    fetch("/api/mini-picks")
      .then((r) => (r.ok ? (r.json() as Promise<MiniData>) : null))
      .then((d) => live && d && setData(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [fit, adFree, data]);
  // Too narrow for the rails (phones, tablets, a small window): the same tiles in the phone dock (AdDock.tsx), asked for only once
  // the visitor scrolls.
  if (narrow && !adFree)
    return (
      <DockGate minWidth={MIN_WIDTH}>
        <PhoneDock />
      </DockGate>
    );
  if (!fit || adFree || !data) return null;
  const { ebay, tcg } = railTiles(data, country, "side");
  return (
    <>
      {ebay.length >= 2 && (
        <Rail
          side="left"
          label="Sponsored: Riftbound cards on eBay"
          brand={
            <span className="text-lg font-extrabold tracking-tight" aria-label="eBay">
              <span className="text-[#e53238]">e</span>
              <span className="text-[#0064d2]">b</span>
              <span className="text-[#f5af02]">a</span>
              <span className="text-[#86b817]">y</span>
            </span>
          }
          accent="#4f9cf0"
          tiles={ebay}
          retailer="ebay_side"
          country={country}
          allHref={ebaySearchUrl(country, "Riftbound", "side")}
          allLabel="All on eBay →"
          note="Ad · we may earn"
        />
      )}
      {tcg.length >= 2 && (
        <Rail
          side="right"
          label="Sponsored: Riftbound cards on TCGplayer"
          brand={
            <span className="text-[15px] font-black tracking-tight" aria-label="TCGplayer">
              <span className="text-white">TCG</span>
              <span className="text-[#4fa3ff]">player</span>
            </span>
          }
          accent="#4fa3ff"
          tiles={tcg}
          retailer="tcgplayer_side"
          country={country}
          allHref={affiliateUrl(TCG_SEARCH, "tcg_side", "/side-rail")}
          allLabel="All on TCGplayer →"
          note={country !== "US" ? "Ad · prices in US$" : "Ad · we may earn"}
        />
      )}
    </>
  );
}

const RAIL = "side-rail fixed z-30 hidden flex-col rounded-2xl border border-ink-700/70 bg-ink-900 p-2 min-[1280px]:flex";
const LIST = "rail-scroll grid min-h-0 flex-1 grid-cols-1 content-start gap-2 overflow-y-auto overscroll-contain";
const TILE = "group flex flex-col rounded-xl border border-ink-700 bg-ink-950/40 p-1.5 transition-colors hover:border-[var(--ad-accent)]";

const railStyle = (side: "left" | "right", accent: string): CSSProperties => ({
  top: HDR + GUTTER,
  bottom: GUTTER,
  width: RAIL_W,
  // GUTTER outside the column, never closer than GUTTER to the navigation rail or the window's edge. 100% is the window's width
  // without its scrollbar (a fixed element's containing block), as the column's is.
  [side]: `calc(${side === "left" ? "var(--sidenav-w) + " : ""}max(${GUTTER}px, (100% - var(--sidenav-w)) / 2 - ${COLUMN_MAX / 2 + GUTTER + RAIL_W}px))`,
  ["--ad-accent" as string]: accent,
});

function Rail(props: { side: "left" | "right"; label: string; brand: ReactNode; accent: string; tiles: Tile[]; retailer: string; country: string; allHref: string; allLabel: string; note: string }) {
  const { side, label, brand, accent, tiles, retailer, country, allHref, allLabel, note } = props;
  return (
    <aside data-ad-placement="side-rail" aria-label={label} className={RAIL} style={railStyle(side, accent)}>
      <div className="mb-2 flex h-[22px] shrink-0 items-center justify-between px-1">
        {brand}
        <span className="rounded bg-ink-950/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ad</span>
      </div>
      <ul role="list" className={LIST}>
        {tiles.map((t) => (
          <li key={t.key}>
            <OutboundLink href={t.href} retailer={retailer} country={country} cardId={t.cardId} cardName={t.name} price={t.cents / 100} pageType="side-rail" surface="side_rails" className={TILE}>
              <span className="relative block aspect-[5/7] w-full overflow-hidden rounded-md bg-ink-950" title={`${t.name} · ${t.price}`}>
                {t.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.image} alt={t.name} width={112} height={157} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                )}
              </span>
              <span className="mt-1 block h-[18px] truncate text-xs font-semibold leading-[18px] text-slate-200 group-hover:text-[var(--ad-accent)]">{t.name}</span>
              <span className="num block h-5 truncate text-[15px] font-bold leading-5 text-white">{t.price}</span>
            </OutboundLink>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex h-[26px] shrink-0 flex-col justify-center px-1 text-[10px] leading-[13px] text-slate-400">
        <OutboundLink href={allHref} retailer={retailer} country={country} pageType="side-rail" surface="side_rails" className="truncate font-bold">
          <span style={{ color: accent }}>{allLabel}</span>
        </OutboundLink>
        <span className="truncate">{note}</span>
      </p>
    </aside>
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
