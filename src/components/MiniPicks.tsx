"use client";

import { useEffect, useState } from "react";
import { OutboundLink } from "./OutboundLink";
import { usePremium } from "./PremiumProvider";
import { useCountry } from "./CountryProvider";
import { formatMoney } from "@/lib/format";
import { affiliateUrl, ebaySearchUrl } from "@/lib/affiliate";
import { ebayImg } from "@/lib/ebay";
import { selectPicks, type PickListing } from "./EbayPicksLive";
import type { TcgPick } from "./TcgplayerPicksLive";

interface MiniData {
  set: string;
  ebay: PickListing[];
  tcg: TcgPick[];
}

const TCG_SEARCH = "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product?view=grid";
// One fetch per set per page view, shared by every MiniPicks on the page.
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

type Tile = { key: string; href: string; image: string | null; name: string; price: string; cardId: string; cents: number };

function Row({ brand, accent, all, tiles, retailer, pageType, country }: { brand: React.ReactNode; accent: string; all: string; tiles: Tile[]; retailer: string; pageType: string; country: string }) {
  return (
    <div className="flex items-stretch gap-2">
      <OutboundLink href={all} retailer={retailer} country={country} pageType={pageType} surface="mini_picks" className="flex w-12 shrink-0 flex-col items-center justify-center gap-1 text-center">
        {brand}
        <span className="text-[10px] font-bold" style={{ color: accent }}>All →</span>
      </OutboundLink>
      <div className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto pb-1">
        {tiles.map((t) => (
          <OutboundLink
            key={t.key}
            href={t.href}
            retailer={retailer}
            country={country}
            cardId={t.cardId}
            cardName={t.name}
            price={t.cents / 100}
            pageType={pageType}
            surface="mini_picks"
            className="flex w-[56px] shrink-0 snap-start flex-col overflow-hidden rounded-md border border-ink-700 bg-ink-900 transition-colors hover:border-slate-400"
          >
            <span className="relative block aspect-[5/7] overflow-hidden bg-ink-950" title={`${t.name} · ${t.price}`}>
              {t.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.image} alt={t.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              )}
            </span>
            <span className="num truncate px-0.5 py-0.5 text-center text-[10px] font-black text-white" style={{ background: accent }}>
              {t.price}
            </span>
          </OutboundLink>
        ))}
      </div>
    </div>
  );
}

/**
 * The small eBay + TCGplayer pair (owner, 2026-10-29: "much smaller … near the
 * top … not intrusive", on card pages, the quick views and every other page).
 * A set's chase cards as 56px tiles in one slim box: an eBay row (the cheapest
 * live listing in the visitor's market) and a TCGplayer row (US market price).
 * Fetched after hydration from /api/mini-picks, so no host page gains a server
 * read; renders nothing until it has tiles. Ad-free for Plus and Pro, like
 * every ad. Clicks report as surface `mini_picks`.
 */
export function MiniPicks({ setCode = "", pageType, className = "" }: { setCode?: string; pageType: string; className?: string }) {
  const { country } = useCountry();
  const adFree = usePremium();
  const [data, setData] = useState<MiniData | null>(null);
  useEffect(() => {
    if (adFree) return;
    let live = true;
    load(setCode).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [setCode, adFree]);
  if (adFree || !data) return null;
  const ebay: Tile[] = selectPicks(data.ebay, country, 10).map((l) => ({
    key: l.cardId,
    href: affiliateUrl(l.url, `mini_${l.country.toLowerCase()}`, `/${pageType}`),
    image: l.imageUrl ? ebayImg(l.imageUrl, 225) : null,
    name: l.cardName,
    price: formatMoney(l.priceCents, l.currency),
    cardId: l.cardId,
    cents: l.priceCents,
  }));
  const tcg: Tile[] = data.tcg.slice(0, 10).map((p) => ({
    key: p.cardId,
    href: affiliateUrl(p.url, "tcg_mini", `/${pageType}`),
    image: p.imageUrl,
    name: p.name,
    price: formatMoney(p.priceCents, "USD"),
    cardId: p.cardId,
    cents: p.priceCents,
  }));
  const showEbay = ebay.length >= 3;
  const showTcg = tcg.length >= 3;
  if (!showEbay && !showTcg) return null;
  const ebayAll = ebaySearchUrl(country, "Riftbound", "mini");
  return (
    <aside data-ad-placement="" aria-label="Sponsored: chase cards on eBay and TCGplayer" className={`grid gap-2 rounded-lg border border-ink-700 bg-ink-900/60 p-2 lg:grid-cols-2 ${className}`}>
      {showEbay && (
        <Row
          brand={
            <span className="text-base font-extrabold tracking-tight" aria-label="eBay">
              <span className="text-[#e53238]">e</span>
              <span className="text-[#0064d2]">b</span>
              <span className="text-[#f5af02]">a</span>
              <span className="text-[#86b817]">y</span>
            </span>
          }
          accent="#0064d2"
          all={ebayAll}
          tiles={ebay}
          retailer="ebay_mini"
          pageType={pageType}
          country={country}
        />
      )}
      {showTcg && (
        <Row
          brand={
            <span className="text-[11px] font-black tracking-tight" aria-label="TCGplayer">
              <span className="text-white">TCG</span>
              <span className="text-[#4fa3ff]">player</span>
            </span>
          }
          accent="#1f6fe5"
          all={affiliateUrl(TCG_SEARCH, "tcg_mini", `/${pageType}`)}
          tiles={tcg}
          retailer="tcgplayer_mini"
          pageType={pageType}
          country={country}
        />
      )}
      <p className="flex items-center gap-2 text-[10px] leading-tight text-slate-400 lg:col-span-2">
        <span className="rounded bg-ink-950/70 px-1.5 py-0.5 font-semibold uppercase tracking-wide">Ad</span>
        <span>Affiliate links: RiftCompare earns a commission from qualifying eBay and TCGplayer purchases, at no extra cost to you.{showTcg && country !== "US" ? " TCGplayer prices in US$." : ""}</span>
      </p>
    </aside>
  );
}
