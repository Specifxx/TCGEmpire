import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureListingShare, shareUrlForListing, listingPostText } from "@/lib/share";
import { pickPrice, type Country } from "@/lib/country";
import { cardDisplayName } from "@/lib/card-name";
import { CONDITIONS } from "@/lib/constants";
import { cardTileSelect } from "@/lib/cards";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import type { CardTileData } from "@/components/CardTile";

export const dynamic = "force-dynamic";

/**
 * Mint (or fetch) a listing's share link and return the ready-made post text.
 *
 * POST rather than GET because the first call WRITES — it lazily assigns the
 * token. A GET that mutates is the kind of thing a link prefetcher or a
 * crawler fires by accident.
 *
 * OWNERSHIP IS CHECKED HERE, not in lib/share.ts. ensureListingShare mints a
 * capability token for whatever id it is handed, so the authorisation has to sit
 * at the edge that knows who is asking — and it must compare against sellerId,
 * not merely require a signed-in user. Without that, any account could mint a
 * shareable link to any other seller's listing.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`listing-share:${clientIp(req)}:${user.id}`, 60, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      sellerId: true,
      condition: true,
      isFoil: true,
      priceCents: true,
      quantity: true,
      currency: true,
      country: true,
      status: true,
      cardId: true,
    },
  });
  // Same 404 for "does not exist" and "is not yours": a distinct 403 would
  // confirm to any account that a given listing id is real.
  if (!listing || listing.sellerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (listing.status === "REMOVED") {
    return NextResponse.json({ error: "This listing has been removed" }, { status: 400 });
  }

  const token = await ensureListingShare(listing.id);
  if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = shareUrlForListing(token);

  const card = await prisma.card.findUnique({
    where: { id: listing.cardId },
    select: cardTileSelect(listing.country as Country),
  });
  const tile = card as unknown as CardTileData | null;

  const post = tile
    ? listingPostText({
        cardName: cardDisplayName(tile.name, tile),
        cardSetCode: tile.setCode,
        cardCollectorNumber: tile.collectorNumber,
        condition: CONDITIONS[listing.condition]?.full ?? listing.condition,
        isFoil: listing.isFoil,
        priceCents: listing.priceCents,
        quantity: listing.quantity,
        currency: listing.currency,
        marketCents: pickPrice(tile, listing.country as Country),
        url,
      })
    : url;

  return NextResponse.json({ url, post });
}
