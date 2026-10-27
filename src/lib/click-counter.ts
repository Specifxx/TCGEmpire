import { prisma } from "./db";

// Outbound click counts per Sydney day (2026-10-27, "Click counts by day" in
// DECISIONS.md). One Counter row per day and network, incremented by
// /api/click: a single-row upsert per click and no read on the request path,
// unlike the per-click ClickEvent rows switched off for Neon transfer. Read
// only by /admin/growth. Counts can be inflated by anyone who posts to the
// route; they are a trend line, never a payout.

export const CLICK_GROUPS = ["ebay", "tcgplayer", "store"] as const;
export type ClickGroup = (typeof CLICK_GROUPS)[number];
export const CLICK_KEY_PREFIX = "click:";

/** Which network a link's `retailer` belongs to. Anything not eBay or TCGplayer is a store. */
export function clickGroup(retailer: string): ClickGroup | null {
  const r = retailer.trim().toLowerCase();
  if (!r || r.length > 64) return null;
  if (r.includes("ebay")) return "ebay";
  if (r.startsWith("tcgplayer")) return "tcgplayer";
  return "store";
}

export function sydneyDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

export const clickKey = (day: string, group: ClickGroup) => `${CLICK_KEY_PREFIX}${day}:${group}`;

export async function countClick(group: ClickGroup, now = Date.now()): Promise<void> {
  const key = clickKey(sydneyDay(now), group);
  await prisma.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
}

/** Counts for the days from `sinceDay` on: day -> group -> clicks. */
export async function readClickCounts(sinceDay: string): Promise<Map<string, Partial<Record<ClickGroup, number>>>> {
  const rows = await prisma.counter.findMany({
    where: { key: { gte: `${CLICK_KEY_PREFIX}${sinceDay}`, lt: `${CLICK_KEY_PREFIX}9` } },
    select: { key: true, value: true },
    take: 500,
  });
  const out = new Map<string, Partial<Record<ClickGroup, number>>>();
  for (const r of rows) {
    const [day, group] = r.key.slice(CLICK_KEY_PREFIX.length).split(":");
    if (!day || !(CLICK_GROUPS as readonly string[]).includes(group)) continue;
    out.set(day, { ...out.get(day), [group]: r.value });
  }
  return out;
}
