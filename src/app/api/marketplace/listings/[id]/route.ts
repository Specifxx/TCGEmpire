import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { importMarketplaceListings, MARKETPLACE_COUNTRIES, CURRENCY_BY_COUNTRY } from "@/lib/marketplace";
import { revalidateCardPage } from "@/lib/revalidate-card";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  priceCents: z.number().int().min(1).max(100_000_00).optional(),
  quantity: z.number().int().min(0).max(999).optional(),
  country: z.enum(MARKETPLACE_COUNTRIES).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
});

async function ownListing(userId: string, id: string) {
  const l = await prisma.marketplaceListing.findUnique({ where: { id } });
  return l && l.sellerId === userId ? l : null;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const rl = rateLimit(`mp-listing:${clientIp(req)}:${user.id}`, 20, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const listing = await ownListing(user.id, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  // Quantity 0 -> SOLD_OUT and, the reverse a seller actually hits often,
  // restocking (quantity 0 -> positive) auto-relists a SOLD_OUT listing back
  // to ACTIVE — previously this fell through to `listing.status`, which was
  // still SOLD_OUT, so bumping the quantity alone never brought it back.
  const status =
    d.status ??
    (d.quantity === 0
      ? "SOLD_OUT"
      : d.quantity != null && d.quantity > 0 && listing.status === "SOLD_OUT"
        ? "ACTIVE"
        : listing.status);
  const updated = await prisma.marketplaceListing.update({
    where: { id: listing.id },
    data: {
      ...(d.priceCents != null ? { priceCents: d.priceCents } : {}),
      ...(d.quantity != null ? { quantity: d.quantity } : {}),
      ...(d.country ? { country: d.country, currency: CURRENCY_BY_COUNTRY[d.country] } : {}),
      status,
    },
  });
  await importMarketplaceListings().catch(() => {});
  await revalidateCardPage(listing.cardId).catch(() => {});
  return NextResponse.json({ ok: true, listing: updated });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const rl = rateLimit(`mp-listing:${clientIp(req)}:${user.id}`, 20, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const listing = await ownListing(user.id, params.id);
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.marketplaceListing.update({ where: { id: listing.id }, data: { status: "REMOVED" } });
  await importMarketplaceListings().catch(() => {});
  await revalidateCardPage(listing.cardId).catch(() => {});
  return NextResponse.json({ ok: true });
}
