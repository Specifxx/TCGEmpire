import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { NOT_SEED_WHERE, EARLY_PREMIUM_LIMIT, EARLY_PREMIUM_DAYS, earlyPremiumPromoActive } from "@/lib/premium";
import { sydneyDayKey } from "@/lib/market-index";
import { CONTENT_TAG } from "@/lib/revalidate-content";

// Real (non-seed) user count, day-cached. It must never be a live COUNT(*) on
// every page load (that's exactly the per-request DB-read pattern that blew the
// history-DB budget earlier — see lib/market-index.ts's day-cache notes).
// Recomputes once per Sydney day, shared across every visitor.
//
// THE COUNT NEVER LEAVES THE SERVER. It decides `active` and nothing else.
// This response is public and cacheable, so anything in it is effectively
// published: returning `remaining`/`limit` meant the exact number of signups was
// readable by anyone hitting this URL directly, whatever the popup chose to
// render. Changing only the popup's copy would have left that intact.
const getRealUserCount = () =>
  unstable_cache(() => prisma.user.count({ where: NOT_SEED_WHERE }), ["rc-promo-user-count", sydneyDayKey()], {
    revalidate: 172800,
    tags: [CONTENT_TAG],
  })();

export async function GET() {
  if (!earlyPremiumPromoActive()) {
    return NextResponse.json(
      { active: false, days: 0 },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  }
  const total = await getRealUserCount().catch(() => EARLY_PREMIUM_LIMIT); // fail closed: promo reads as full, never over-promises
  const remaining = Math.max(0, EARLY_PREMIUM_LIMIT - total);
  // `active` and `days` only — `days` is already stated in the popup's own copy
  // ("we'll comp N days of Premium"), so it is not a disclosure. `remaining` and
  // `limit` are deliberately absent, not zeroed: an explicit 0 would be read as
  // "promo full" by any client still expecting the old shape.
  return NextResponse.json(
    { active: remaining > 0, days: EARLY_PREMIUM_DAYS },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
