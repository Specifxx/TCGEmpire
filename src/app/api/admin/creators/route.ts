import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/site";
import { CREATORS } from "@/lib/content/creators";
import { DEFAULT_SHARE_PCT } from "@/lib/creator-payout";
import { hashEditToken, newEditToken } from "@/lib/creator-edit-token";

export const dynamic = "force-dynamic";

// Makes (or replaces) a creator's private edit link. A new link revokes the old one.
async function isAdmin(req: Request): Promise<boolean> {
  const token = process.env.ADMIN_TOKEN;
  const key = new URL(req.url).searchParams.get("key");
  if (token && key === token) return true;
  return !!(await getCurrentUser())?.isAdmin;
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.action === "month") {
    const month = typeof body.month === "string" && /^\d{4}-\d{2}$/.test(body.month) ? body.month : "";
    const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
    const totalVisitors = Math.round(num(body.totalVisitors));
    const affiliateRevenueCents = Math.round(num(body.affiliateRevenue) * 100);
    const sharePct = Math.round(num(body.sharePct ?? DEFAULT_SHARE_PCT));
    const currency = typeof body.currency === "string" && /^[A-Z]{3}$/.test(body.currency) ? body.currency : "AUD";
    if (!month || !(totalVisitors >= 0) || !(affiliateRevenueCents >= 0) || !(sharePct >= 0 && sharePct <= 100)) {
      return NextResponse.json({ error: "Check the month, visitors, profit and share." }, { status: 400 });
    }
    const data = { totalVisitors, affiliateRevenueCents, sharePct, currency };
    await prisma.creatorPayoutMonth.upsert({ where: { month }, create: { month, ...data }, update: data });
    return NextResponse.json({ ok: true });
  }
  const slug = typeof body?.slug === "string" ? body.slug : "";
  if (!CREATORS.some((c) => c.slug === slug)) return NextResponse.json({ error: "No such creator." }, { status: 404 });
  const token = newEditToken();
  const editTokenHash = hashEditToken(token);
  await prisma.creatorProfileEdit.upsert({ where: { slug }, create: { slug, editTokenHash }, update: { editTokenHash } });
  return NextResponse.json({ ok: true, url: `${SITE_URL}/creators/edit/${token}` });
}
