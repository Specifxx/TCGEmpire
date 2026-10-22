import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CREATORS } from "@/lib/content/creators";
import { creatorFromCookie, looksLikeBot, utcDay } from "@/lib/creator-payout";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// A buy click by a visitor a creator sent (rc_creator cookie). Only those visitors
// call it (lib/analytics.ts), so it stays low volume.
export async function POST(req: Request) {
  const done = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  const slug = creatorFromCookie(req.headers.get("cookie"));
  if (!slug || !CREATORS.some((c) => c.slug === slug) || looksLikeBot(req.headers.get("user-agent"))) return done;
  if (!rateLimit(`creator-buy:${clientIp(req)}`, 30, 60 * 60 * 1000).ok) return done;
  await prisma.creatorDailyStat
    .upsert({
      where: { slug_day: { slug, day: utcDay() } },
      create: { slug, day: utcDay(), buyClicks: 1 },
      update: { buyClicks: { increment: 1 } },
    })
    .catch(() => null);
  return done;
}
