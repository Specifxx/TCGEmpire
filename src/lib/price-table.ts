// "Riftbound card prices today" — the price-list table under each market
// homepage's hero (/, /au, /uk, /ca, /sg, /eu). DECISIONS.md, "Growth pass:
// rank for 'riftbound card prices'", 2026-09-24.
//
// WHY A TABLE: the four results above us for "riftbound card prices" are all
// price LISTS (riftbound.gg/prices, TCGplayer's price guide, PriceCharting,
// magicalmeta). Our homepage answered the query with a search box and a
// carousel of tiles, so the one thing the searcher came for — a list of cards
// with prices on it — was not in the server HTML.
//
// EVERY NUMBER IS THE DATABASE'S: the market's cheapest in-stock price column,
// the in-stock store count (the same definition CardTile shows, via
// storeCountsByCountry), and the 7-day change from the weekly GLOBAL
// PriceHistory series. Nothing is estimated; a card with no two history points
// shows no change rather than 0%.
//
// COST (src/lib/db.ts rules): one capped card read (take 50, narrow select),
// one grouped count over those 50 ids, one history read over those 50 ids for
// 21 days (≈3 weekly rows each). Cached per market for an hour — the same
// cadence as the homepages' own `revalidate` (rule 5), never lower. The loaders
// it could have reused (getPopularCards, getPriceMovers) are NOT called from
// inside this cache (rule 6); it runs its own bounded queries. Fails open: any
// error returns an empty table and the section does not render.
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { priceField, type Country } from "./country";
import { storeCountsByCountry } from "./cards";
import { GLOBAL_HISTORY_COUNTRY, STALE_HISTORY_MS } from "./price-history";
import { CONTENT_TAG } from "./revalidate-content";
import { cardDisplayName } from "./card-name";

// 15, down from 50 (2026-09-24): a 50-row table under the hero was a long
// scroll between a first-time visitor and everything else on the page. The
// rest sit one "See all" click away on /browse. Fewer rows is also a smaller
// read (db.ts rule 3).
export const PRICE_TABLE_SIZE = 15;

export interface PriceTableRow {
  id: string;
  slug: string | null;
  name: string;
  setName: string;
  collectorNumber: string;
  /** Grid-size card image for the row thumbnail (lib/card-image-url.ts resolves it). */
  imageThumbUrl: string | null;
  imageUrl: string | null;
  /** Cheapest in-stock price in the market's own currency, in cents. */
  priceCents: number;
  /** Stores with this card in stock in the market (tracked stores, not eBay fallbacks). */
  stores: number;
  /** Change vs the snapshot closest to 7 days earlier, in percent; null when unknown. */
  change7d: number | null;
}

const SEVEN_DAYS = 7 * 86400_000;
const HISTORY_WINDOW_DAYS = 21;
// Same outlier guard as lib/price-history.ts's movers: a swing this large is a
// mismatched listing far more often than a real move, so it is not shown.
const OUTLIER_DROP = 80;
const OUTLIER_SPIKE = 300;

/** Pure: the 7-day change for one card's weekly series (oldest first). */
export function sevenDayChange(points: { t: number; v: number }[], now = Date.now()): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  if (now - last.t > STALE_HISTORY_MS) return null;
  const target = last.t - SEVEN_DAYS;
  let ref = points[0];
  for (const p of points.slice(0, -1)) if (Math.abs(p.t - target) < Math.abs(ref.t - target)) ref = p;
  if (ref === last || ref.v <= 0) return null;
  const pct = ((last.v - ref.v) / ref.v) * 100;
  if (pct >= OUTLIER_SPIKE || pct <= -OUTLIER_DROP) return null;
  return Math.round(pct * 10) / 10;
}

async function computePriceTable(country: Country): Promise<PriceTableRow[]> {
  try {
    const field = priceField(country);
    type Row = {
      id: string; slug: string | null; name: string; setName: string; collectorNumber: string;
      rarity: string; variant: string | null; isPromo: boolean;
      imageThumbUrl: string | null; imageUrl: string | null;
    } & Record<string, unknown>;
    const cards = (await prisma.card.findMany({
      where: { [field]: { not: null } } as Prisma.CardWhereInput,
      // Demand first: searches, then page views — the same signal the "most
      // popular" carousel ranked by. Price desc breaks ties so a dead heat of
      // zero-demand cards still lists the ones a buyer is likelier to look up.
      orderBy: [
        { searchCount: "desc" },
        { viewCount: "desc" },
        { [field]: { sort: "desc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput,
      ],
      take: PRICE_TABLE_SIZE,
      select: {
        id: true, slug: true, name: true, setName: true, collectorNumber: true,
        rarity: true, variant: true, isPromo: true, imageThumbUrl: true, imageUrl: true, [field]: true,
      } as Prisma.CardSelect,
    })) as unknown as Row[];
    if (!cards.length) return [];
    const ids = cards.map((c) => c.id);

    const [counts, history] = await Promise.all([
      storeCountsByCountry(ids),
      dbHistory.priceHistory
        .findMany({
          where: { cardId: { in: ids }, country: GLOBAL_HISTORY_COUNTRY, day: { gte: new Date(Date.now() - HISTORY_WINDOW_DAYS * 86400_000) } },
          orderBy: { day: "asc" },
          select: { cardId: true, day: true, lowestPriceCents: true },
        })
        .catch(() => []),
    ]);
    const series = new Map<string, { t: number; v: number }[]>();
    for (const r of history) {
      const arr = series.get(r.cardId) ?? [];
      arr.push({ t: r.day.getTime(), v: r.lowestPriceCents });
      series.set(r.cardId, arr);
    }

    return cards.map((c) => {
      return {
        id: c.id,
        slug: c.slug,
        // The credentialed name ("Jinx (Showcase)"), so two printings of one card
        // in the same table can be told apart.
        name: cardDisplayName(c.name, c),
        setName: c.setName,
        collectorNumber: c.collectorNumber,
        imageThumbUrl: c.imageThumbUrl,
        imageUrl: c.imageUrl,
        priceCents: c[field] as number,
        stores: counts.get(c.id)?.[country] ?? 0,
        change7d: sevenDayChange(series.get(c.id) ?? []),
      };
    });
  } catch {
    return [];
  }
}

export function getPriceTable(country: Country): Promise<PriceTableRow[]> {
  return unstable_cache(() => computePriceTable(country), ["home-price-table-v2", country], {
    revalidate: 3600,
    tags: [CONTENT_TAG],
  })().catch(() => []);
}
