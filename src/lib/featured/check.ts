import { prisma } from "../db";
import { getEbayItem, isEbayRateLimited } from "../ebay";
import { isPremium } from "../premium";
import { FEATURE_CHECKS_PER_SWEEP, FEATURE_HOSTS, judgeItem } from "./core";

// MEMBER-FEATURED LISTINGS, the check (script side: scripts/import-ebay-auctions.ts,
// every four hours in refresh-auctions.yml, after the sweep has primed the eBay
// budget). One getItem per row, pending first, then live rows least recently
// checked; at most FEATURE_CHECKS_PER_SWEEP calls. A row whose member is no
// longer on Premium is taken down without a call. lib/featured/core.ts decides.
export async function checkFeaturedSubmissions(now = Date.now()): Promise<{ checked: number; live: number; changed: number }> {
  const rows = await prisma.featuredSubmission.findMany({
    where: { status: { in: ["pending", "live"] } },
    orderBy: [{ checkedAt: { sort: "asc", nulls: "first" } }],
    take: FEATURE_CHECKS_PER_SWEEP,
    select: { id: true, userId: true, itemId: true, host: true, status: true, createdAt: true },
  });
  if (rows.length === 0) return { checked: 0, live: 0, changed: 0 };
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
    select: { id: true, isAdmin: true, premiumUntil: true, premiumTier: true, premiumTierFloor: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  let checked = 0;
  let live = 0;
  let changed = 0;
  for (const r of rows) {
    if (!isPremium(byId.get(r.userId), "premium")) {
      await prisma.featuredSubmission.update({ where: { id: r.id }, data: { status: "removed", reason: "Your Premium has ended.", checkedAt: new Date(now) } });
      changed++;
      continue;
    }
    if (isEbayRateLimited()) break;
    const { ok, item } = await getEbayItem(r.itemId, FEATURE_HOSTS[r.host] ?? "EBAY_US");
    if (!ok) continue; // no answer: leave the row exactly as it was
    checked++;
    const v = judgeItem(item, now, r.createdAt.getTime());
    const f = v.facts;
    await prisma.featuredSubmission.update({
      where: { id: r.id },
      data: {
        status: v.status,
        reason: v.status === "live" ? null : v.reason,
        checkedAt: new Date(now),
        ...(f
          ? {
              title: f.title,
              priceCents: f.priceCents,
              currency: f.currency,
              imageUrl: f.imageUrl,
              format: f.format,
              bids: f.bids,
              endsAt: f.endsAt ? new Date(f.endsAt) : null,
              seller: f.seller,
              location: f.location,
              condition: f.condition,
            }
          : {}),
      },
    });
    if (v.status === "live") live++;
    if (v.status !== r.status) changed++;
  }
  return { checked, live, changed };
}
