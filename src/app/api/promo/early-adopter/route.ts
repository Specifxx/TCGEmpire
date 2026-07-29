import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { NOT_SEED_WHERE, EARLY_PREMIUM_LIMIT, EARLY_PREMIUM_DAYS, earlyPremiumPromoActive } from "@/lib/premium";
import { sydneyDayKey } from "@/lib/market-index";
import { CONTENT_TAG } from "@/lib/revalidate-content";

// Real (non-seed) user count, day-cached — this backs the signup-promo popup's
// "X spots left" line, so it must never be a live COUNT(*) on every page load
// (that's exactly the per-request DB-read pattern that blew the history-DB
// budget earlier — see lib/market-index.ts's day-cache notes). Recomputes once
// per Sydney day, shared across every visitor.
const getRealUserCount = () =>
  unstable_cache(() => prisma.user.count({ where: NOT_SEED_WHERE }), ["rc-promo-user-count", sydneyDayKey()], {
    revalidate: 172800,
    tags: [CONTENT_TAG],
  })();

export async function GET() {
  if (!earlyPremiumPromoActive()) {
    return NextResponse.json(
      { active: false, remaining: 0, days: 0, limit: EARLY_PREMIUM_LIMIT },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  }
  const total = await getRealUserCount().catch(() => EARLY_PREMIUM_LIMIT); // fail closed: promo reads as full, never over-promises
  const remaining = Math.max(0, EARLY_PREMIUM_LIMIT - total);
  return NextResponse.json(
    { active: remaining > 0, remaining, days: EARLY_PREMIUM_DAYS, limit: EARLY_PREMIUM_LIMIT },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
