import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { validateShippingAddress } from "@/lib/shipping";
import { MARKETPLACE_LAUNCH_COUNTRIES } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

// The signed-in user's saved default shipping address — prefills marketplace
// checkout, and is editable from /profile independent of any purchase.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { shipName: true, shipLine1: true, shipLine2: true, shipCity: true, shipRegion: true, shipPostcode: true, shipCountry: true, shipPhone: true },
  });
  const hasAddress = !!(row?.shipLine1 && row?.shipPostcode);
  return NextResponse.json({ address: hasAddress ? row : null });
}

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().min(1).max(100),
  postcode: z.string().trim().min(1).max(20),
  country: z.enum(MARKETPLACE_LAUNCH_COUNTRIES),
  phone: z.string().trim().max(30).optional().nullable(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  const d = parsed.data;

  const v = validateShippingAddress(d.country, d);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      shipName: v.address.name,
      shipLine1: v.address.line1,
      shipLine2: v.address.line2 ?? null,
      shipCity: v.address.city,
      shipRegion: v.address.region,
      shipPostcode: v.address.postcode,
      shipCountry: d.country,
      shipPhone: v.address.phone ?? null,
    },
  });
  return NextResponse.json({ ok: true });
}
