import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CREATORS } from "@/lib/content/creators";
import { CREATOR_COOKIE, CREATOR_COOKIE_MAX_AGE, creatorFromCookie, looksLikeBot, utcDay } from "@/lib/creator-payout";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// A creator's traffic link, riftcompare.com/c/<slug> (lib/creator-payout.ts). Counts
// one visitor per browser per 30 days (the rc_creator cookie, which also credits the
// visitor's buy clicks) and opens the homepage, or `?to=/a/path` on this site.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const url = new URL(req.url);
  const to = url.searchParams.get("to") ?? "/";
  const path = /^\/(?!\/)[^\s\\]*$/.test(to) ? to : "/";
  const res = NextResponse.redirect(`${SITE_URL}${path}`, 307);
  res.headers.set("Cache-Control", "private, no-store");
  const creator = CREATORS.find((c) => c.slug === params.slug.toLowerCase());
  if (!creator) return res;
  const already = creatorFromCookie(req.headers.get("cookie")) === creator.slug;
  if (!already && !looksLikeBot(req.headers.get("user-agent"))) {
    await prisma.creatorDailyStat
      .upsert({
        where: { slug_day: { slug: creator.slug, day: utcDay() } },
        create: { slug: creator.slug, day: utcDay(), visits: 1 },
        update: { visits: { increment: 1 } },
      })
      .catch(() => null);
  }
  res.cookies.set(CREATOR_COOKIE, creator.slug, { sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: CREATOR_COOKIE_MAX_AGE });
  return res;
}
