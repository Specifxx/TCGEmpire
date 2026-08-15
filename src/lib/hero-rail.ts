import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { getChaseCards } from "./cheapest-cards";
import { DEFAULT_COUNTRY, type Country } from "./country";
import { CONTENT_TAG } from "./revalidate-content";
import { affiliateUrl } from "./affiliate";

// Data for the hero's two affiliate rails (components/home/HeroAdRail).
//
// WHY THIS RE-ADDS A HOMEPAGE QUERY. The chase-card showcase these rails
// replaced was killed partly because it cost a serial DB read on an ISR page,
// and the 2026-08-14 egress work existed to remove exactly that shape. The
// difference is that read was decorative and this one is revenue-bearing: a
// house banner with no listing in it converts far worse than a real photo of
// the actual thing being sold at its actual price, which is the whole reason
// the rails exist. So it earns its keep — but it is held to the same standard
// as EbayPicks, which serves the identical rows on five high-traffic pages:
//
//   * ONE unstable_cache entry for the whole site, not per-request and not
//     per-visitor. Card SELECTION uses the baseline market so every visitor
//     shares that entry; only the per-country LISTING rows differ, and they all
//     come back in the same single query.
//   * Tagged CONTENT_TAG, which the daily price import clears, so new listings
//     appear when the data actually changes rather than on a timer.
//   * Two bounded findMany calls with narrow selects. No _count aggregate, no
//     per-card fan-out, no N+1.
//
// EVERY FIELD IS REAL. The image is the seller's own photo for eBay and the
// official card art for TCGplayer; the price is that listing's live price in
// its own currency; the URL is the affiliate-tagged one captured at import.
// Nothing is synthesised, and a rail with no usable row renders nothing at all
// rather than a placeholder — see HeroAdRail.

export type RailListing = {
  partner: "ebay" | "tcgplayer";
  cardName: string;
  setLine: string;
  imageUrl: string;
  priceCents: number;
  currency: string;
  url: string;
};

export type HeroRailData = {
  // Up to two DIFFERENT cards per market. AU and NZ show eBay on both rails
  // (TCGplayer is US-centric), and two identical panels would look broken, so
  // the second entry is what the left rail uses there.
  ebay: Partial<Record<Country, RailListing[]>>;
  tcgplayer: RailListing | null;
};

const EMPTY: HeroRailData = { ebay: {}, tcgplayer: null };

// Matches EbayPicks' freshness window: a listing older than this may well be
// sold, and sending a buyer to a dead listing is worse than showing nothing.
const MAX_AGE_HOURS = 72;
// Enough chase cards that most markets find two with a live listing, without
// widening the queries. getChaseCards is already cached upstream.
const CANDIDATES = 10;

function setLine(setCode: string, collectorNumber: string): string {
  return `${setCode} · ${collectorNumber}`;
}

async function load(): Promise<HeroRailData> {
  try {
    const cards = await getChaseCards(CANDIDATES, DEFAULT_COUNTRY);
    if (!cards.length) return EMPTY;
    const byId = new Map(cards.map((c) => [c.id, c]));
    const ids = cards.map((c) => c.id);
    const fresh = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000);

    const [adRows, tcgRows] = await Promise.all([
      prisma.ebayAdListing.findMany({
        where: { cardId: { in: ids }, rank: 0, updatedAt: { gte: fresh } },
        select: {
          cardId: true,
          country: true,
          priceCents: true,
          currency: true,
          url: true,
          imageUrl: true,
        },
        // Bounded: at most one rank-0 row per (card, market).
        take: CANDIDATES * 6,
      }),
      prisma.retailerPrice.findMany({
        where: { cardId: { in: ids }, retailer: "tcgplayer", inStock: true },
        select: { cardId: true, priceCents: true, currency: true, url: true },
        // Dearest first: these are chase cards, and the rail is more compelling
        // showing the headline card than the cheapest one in the set.
        orderBy: { priceCents: "desc" },
        take: CANDIDATES,
      }),
    ]);

    // ── eBay, grouped per market, at most two DIFFERENT cards each ──────────
    const ebay: Partial<Record<Country, RailListing[]>> = {};
    for (const r of adRows) {
      if (!r.imageUrl) continue; // a photo is the entire point of this unit
      const card = byId.get(r.cardId);
      if (!card) continue;
      const market = r.country as Country;
      const list = (ebay[market] ??= []);
      if (list.length >= 2) continue;
      if (list.some((x) => x.cardName === card.name)) continue; // no duplicates
      list.push({
        partner: "ebay",
        cardName: card.name,
        setLine: setLine(card.setCode, card.collectorNumber),
        imageUrl: r.imageUrl,
        priceCents: r.priceCents,
        currency: r.currency,
        // Stored already-tagged by the importer (schema: "url // affiliate-tagged").
        url: r.url,
      });
    }

    // ── Markets the importer never captures, mapped to where their buyers
    //    actually shop ────────────────────────────────────────────────────────
    // Measured against production: EbayAdListing only ever holds AU, SG, UK and
    // US rows — NZ and CA are never imported. Left alone, those two markets fall
    // through to the text-only house creative, and NZ is one of the two markets
    // that is supposed to show eBay on BOTH rails, so the dual-eBay rule would
    // have been dead exactly where it matters most.
    //
    // The mapping mirrors the routing affiliate.ts ALREADY applies, so nobody is
    // sent somewhere they would not otherwise have gone:
    //   NZ → AU. ebaySearchUrl("NZ", …) resolves to www.ebay.com.au on the AU
    //            rotation (705-53470-19255-0); there is no eBay New Zealand.
    //            An NZ buyer is on the Australian marketplace either way, so an
    //            AU listing at its real AUD price is what they would actually
    //            pay, and the stored URL carries the matching AU tagging.
    //   CA → US. Same principle as the existing Singapore reroute. Canada has
    //            its own ebay.ca rotation, but with no ca rows to show, a real
    //            ebay.com listing beats a text banner. NOTE: those clicks report
    //            under the US sub-id, because an ebay.com URL must carry the US
    //            mkrid — tagging it with CA's would break the credit entirely.
    if (!ebay.NZ?.length && ebay.AU?.length) ebay.NZ = ebay.AU;
    if (!ebay.CA?.length && ebay.US?.length) ebay.CA = ebay.US;

    // ── TCGplayer: official card art + its real TCGplayer price ─────────────
    // No listing photo exists for these rows, and that is fine: TCGplayer sells
    // by product, not by individual photographed item, so the official art IS
    // the honest illustration of what is being bought.
    let tcgplayer: RailListing | null = null;
    for (const r of tcgRows) {
      const card = byId.get(r.cardId);
      const art = card?.imageUrl ?? card?.imageThumbUrl;
      if (!card || !art) continue;
      tcgplayer = {
        partner: "tcgplayer",
        cardName: card.name,
        setLine: setLine(card.setCode, card.collectorNumber),
        imageUrl: art,
        priceCents: r.priceCents,
        currency: r.currency,
        // Rewritten through the Impact deep link here rather than trusting the
        // stored value: RetailerPrice.url is the raw merchant URL for most
        // stores, and an untagged TCGplayer link earns nothing while looking
        // perfectly normal.
        url: affiliateUrl(r.url, "tcgplayer_hero_rail", "/"),
      };
      break;
    }

    return { ebay, tcgplayer };
  } catch {
    // A rail is an enhancement; the homepage must never fail to render because
    // an ad query did.
    return EMPTY;
  }
}

export const getHeroRailData = unstable_cache(load, ["hero-rail-listings-v1"], {
  revalidate: 86400,
  tags: [CONTENT_TAG],
});
