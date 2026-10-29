import dynamic from "next/dynamic";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getChaseCards } from "@/lib/cheapest-cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { featuredSet, setByCode, TCGPLAYER_MARKET_RETAILER } from "@/lib/constants";
import type { TcgPick } from "./TcgplayerPicksLive";

const TcgplayerPicksLive = dynamic(() => import("./TcgplayerPicksLive").then((m) => m.TcgplayerPicksLive));

/**
 * Server half of the TCGplayer card strip (owner, 2026-10-29: "every site …
 * the TCGplayer banners as well as the eBay one", the Gundam Compare design):
 * the set's chase cards with their own card art and TCGplayer's US market
 * price, each linking to the card on TCGplayer. The TCGplayer twin of
 * EbayPicks, and it reads the same way: the same chase-card selection, one
 * small RetailerPrice read for those cards, cached a day and cleared by the
 * daily import (CONTENT_TAG). No cookies, so the pages hosting it stay cached.
 */
async function loadTcgPicks(setCode: string, limit: number): Promise<TcgPick[]> {
  const cards = await getChaseCards(limit, DEFAULT_COUNTRY, setCode);
  if (cards.length === 0) return [];
  const rows = await prisma.retailerPrice.findMany({
    where: { cardId: { in: cards.map((c) => c.id) }, retailer: { in: [TCGPLAYER_MARKET_RETAILER, "tcgplayer"] }, country: "US" },
    select: { cardId: true, retailer: true, isFoil: true, priceCents: true, url: true },
    take: cards.length * 4,
  });
  // Per card: the market-price row first (it is what the tile says), else the
  // buyable listing; non-foil before foil, as the card page's reference shows.
  const rank = (r: (typeof rows)[number]) => (r.retailer === TCGPLAYER_MARKET_RETAILER ? 0 : 2) + (r.isFoil ? 1 : 0);
  const best = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (r.priceCents <= 0 || !r.url) continue;
    const held = best.get(r.cardId);
    if (!held || rank(r) < rank(held)) best.set(r.cardId, r);
  }
  const out: TcgPick[] = [];
  for (const c of cards) {
    const r = best.get(c.id);
    const image = c.imageThumbUrl ?? c.imageUrl;
    if (!r || !image) continue;
    out.push({ cardId: c.id, name: c.name, imageUrl: image, priceCents: r.priceCents, url: r.url, market: r.retailer === TCGPLAYER_MARKET_RETAILER });
  }
  return out.sort((a, b) => b.priceCents - a.priceCents);
}

function defaultSet(): { code: string; name: string } {
  const s = featuredSet();
  return s ? { code: s.code, name: s.name } : { code: "VEN", name: "Vendetta" };
}

/** The cached picks for one set, shared with /api/mini-picks (MiniPicks). */
export function cachedTcgPicks(code: string, limit: number): Promise<TcgPick[]> {
  return unstable_cache(() => loadTcgPicks(code, limit), ["tcg-picks", code, String(limit)], {
    revalidate: 86400,
    tags: [CONTENT_TAG],
  })();
}

export async function TcgplayerPicks({
  setCode,
  limit = 12,
  heading,
  className,
  pageType,
}: {
  setCode?: string;
  limit?: number;
  heading?: string;
  className?: string;
  /** buy_click's page_type and the Impact sub-id's page ("homepage", "set_hub", "article", "card_detail"). */
  pageType: string;
}) {
  const code = setCode ?? defaultSet().code;
  const setName = setByCode(code)?.name ?? defaultSet().name;
  let picks: TcgPick[] = [];
  try {
    // 86400, like EbayPicks: it renders inside the 86400 article routes, and an
    // inner cache's revalidate pulls the whole route down to its own.
    picks = await cachedTcgPicks(code, limit);
  } catch {
    picks = [];
  }
  return (
    <TcgplayerPicksLive
      picks={picks}
      heading={heading ?? `Top ${setName} cards on TCGplayer`}
      searchName={setName}
      className={className}
      pageType={pageType}
    />
  );
}
