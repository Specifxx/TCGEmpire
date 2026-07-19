import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { estimateShippingCents, validatePostcode } from "@/lib/shipping";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { estimateDeliveryWindow } from "@/lib/delivery-estimate";

export const dynamic = "force-dynamic";

const schema = z.object({
  sellerId: z.string().min(1),
  postcode: z.string().trim().min(1).max(20),
  itemCents: z.number().int().min(0).max(100_000_00),
});

// Live shipping-cost preview for the checkout address step. Uses the exact same
// estimateShippingCents() the real checkout charges with (see
// api/marketplace/stripe/checkout/route.ts), so what a buyer is shown here is
// always what they're actually charged — no gap between preview and charge.
export async function POST(req: Request) {
  const rl = rateLimit(`ship-estimate:${clientIp(req)}`, 60, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { sellerId, postcode, itemCents } = parsed.data;

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: sellerId },
    select: { country: true, shippingFlatCents: true, freeOverCents: true, postcode: true, handlingDays: true },
  });
  if (!profile) return NextResponse.json({ error: "Seller not found" }, { status: 404 });

  if (!validatePostcode(profile.country, postcode)) {
    return NextResponse.json({ error: `That doesn't look like a valid ${profile.country} postcode` }, { status: 400 });
  }

  const result = estimateShippingCents({
    country: profile.country,
    sellerPostcode: profile.postcode,
    buyerPostcode: postcode,
    baseCents: profile.shippingFlatCents,
    freeOverCents: profile.freeOverCents,
    itemCents,
  });
  // Preview-only estimate, anchored on "paid today" since the order doesn't exist
  // yet — the real per-order eta (api/marketplace/orders) anchors on the actual
  // paidAt/shippedAt once it does.
  const eta = estimateDeliveryWindow({ paidAt: new Date(), shippedAt: null, handlingDays: profile.handlingDays, country: profile.country });
  return NextResponse.json({ ...result, eta });
}
