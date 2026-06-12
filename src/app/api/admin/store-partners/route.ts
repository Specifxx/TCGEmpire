import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// Admin-only management of B2B repricer partners. POST creates a partner and
// returns the capability URL to send the store; GET lists partners (with links).
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const partners = await prisma.storePartner.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    partners: partners.map((p) => ({ ...p, reportUrl: `${SITE_URL}/stores/report?token=${p.token}` })),
  });
}

const schema = z.object({
  retailer: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "retailer + name required" }, { status: 400 });

  // Sanity: the retailer key should actually exist in the price data.
  const rows = await prisma.retailerPrice.count({ where: { retailer: parsed.data.retailer } });
  if (rows === 0) {
    return NextResponse.json({ error: `No price rows found for retailer key "${parsed.data.retailer}"` }, { status: 400 });
  }

  const partner = await prisma.storePartner.create({
    data: { ...parsed.data, token: randomBytes(24).toString("base64url") },
  });
  return NextResponse.json({ ok: true, reportUrl: `${SITE_URL}/stores/report?token=${partner.token}` });
}
