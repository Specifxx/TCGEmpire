import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CURRENCY_BY_COUNTRY, MARKETPLACE_COUNTRIES, isLaunchCountry } from "@/lib/marketplace";
import { isPremium } from "@/lib/premium";

export const dynamic = "force-dynamic";

// The current verified seller's storefront profile (shop identity + shipping).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const profile = await prisma.sellerProfile.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ profile, isVerifiedSeller: user.isVerifiedSeller, isPremium: isPremium(user) });
}

const schema = z.object({
  shopName: z.string().trim().min(2).max(60),
  bio: z.string().trim().max(400).optional().nullable(),
  country: z.enum(MARKETPLACE_COUNTRIES),
  shippingFlatCents: z.number().int().min(0).max(100_00),
  freeOverCents: z.number().int().min(0).max(100_000_00),
  shippingNote: z.string().trim().max(120).optional().nullable(),
  handlingDays: z.number().int().min(0).max(30),
  // "Ships from" postcode — improves the buyer-facing shipping estimate (see
  // lib/shipping.ts); optional, no format validation here since it's informational
  // to the estimator only, not itself a shipping destination.
  postcode: z.string().trim().max(20).optional().nullable(),
  // Explicit consent to /marketplace/terms — required until termsAcceptedAt is
  // stamped, ignored (already agreed) afterwards.
  agreeTerms: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (!user.isVerifiedSeller) {
    return NextResponse.json({ error: "Verified sellers only" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;
  if (!isLaunchCountry(d.country)) {
    return NextResponse.json({ error: "RiftCompare Marketplace is AU, UK and US only for now" }, { status: 400 });
  }
  const existing = await prisma.sellerProfile.findUnique({ where: { userId: user.id }, select: { termsAcceptedAt: true } });
  const needsAgreement = !existing?.termsAcceptedAt;
  if (needsAgreement && d.agreeTerms !== true) {
    return NextResponse.json({ error: "Please agree to the marketplace seller terms" }, { status: 400 });
  }
  const data = {
    shopName: d.shopName,
    bio: d.bio ?? null,
    country: d.country,
    currency: CURRENCY_BY_COUNTRY[d.country],
    shippingFlatCents: d.shippingFlatCents,
    freeOverCents: d.freeOverCents,
    shippingNote: d.shippingNote ?? null,
    handlingDays: d.handlingDays,
    postcode: d.postcode ?? null,
    ...(needsAgreement ? { termsAcceptedAt: new Date() } : {}),
  };
  const profile = await prisma.sellerProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true, profile });
}
