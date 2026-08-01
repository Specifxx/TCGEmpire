import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { priceField, type Country } from "@/lib/country";
import { CONTENT_TAG } from "@/lib/revalidate-content";

// The median price across every priced card in a market — the comparison point
// that lets a collection page say "this group runs 40% above the market" instead
// of just quoting its own numbers in isolation.
//
// Cached for a day and tagged with CONTENT_TAG, so it costs one query per market
// per day no matter how many hub pages regenerate. Returns null on any failure:
// every caller treats a null as "skip that sentence", so a database problem
// costs one paragraph rather than the page.
async function computeSiteMedian(country: Country): Promise<number | null> {
  try {
    const field = priceField(country);
    const rows = await prisma.card.findMany({
      where: { [field]: { not: null } } as Record<string, unknown>,
      select: { [field]: true } as Record<string, boolean>,
    });
    const values = (rows as unknown as Record<string, number>[])
      .map((r) => r[field])
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => a - b);
    if (!values.length) return null;
    return values[Math.floor(values.length / 2)];
  } catch {
    return null;
  }
}

export function getSiteMedianCents(country: Country): Promise<number | null> {
  return unstable_cache(() => computeSiteMedian(country), ["rc-site-median", country], {
    revalidate: 86400,
    tags: [CONTENT_TAG],
  })();
}
