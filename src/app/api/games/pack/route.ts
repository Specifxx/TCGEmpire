import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, pickPrice, priceField, type PriceField } from "@/lib/country";
import { SETS } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Pack-opening simulator data. Builds ONE virtual Riftbound pack from the real
// card pool of a set, drawn by a realistic rarity structure — so, like a real
// pack, most of what you open is bulk and a good hit is the exception. Prices are
// live and public on the site already, so shipping them is fine (it's a toy, not
// a contest). Bulk cards with no listing come through with priceCents = null.

type PoolCard = {
  id: string;
  slug: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
  img: string;
  rarity: string;
  priceCents: number | null;
};

// The whole set's base-print, imaged cards grouped by rarity, cached per market.
const poolForSet = unstable_cache(
  async (setCode: string, field: PriceField) => {
    const rows = await prisma.card.findMany({
      where: { setCode, variant: null, isPromo: false, imageThumbUrl: { not: null } },
      select: {
        id: true, slug: true, name: true, setCode: true, collectorNumber: true, rarity: true,
        imageThumbUrl: true,
        lowestPriceCents: true, lowestPriceCentsNz: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true, lowestPriceCentsSg: true, lowestPriceCentsCa: true,
      },
      take: 2000,
    });
    void field; // price is picked per-request below; the cache key carries the market
    return rows;
  },
  ["pack-sim-pool"],
  { revalidate: 600 }
);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
// Sample k DISTINCT cards from a pool (a pack doesn't repeat a card); falls back
// to allowing repeats only if the pool is smaller than k.
function sampleDistinct<T>(pool: T[], k: number): T[] {
  if (pool.length <= k) return [...pool];
  const a = [...pool];
  for (let i = a.length - 1; i > a.length - 1 - k; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(a.length - k);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requested = (url.searchParams.get("set") ?? "").toUpperCase();
  const country = getCountry();
  const field = priceField(country);

  try {
    const released = SETS.filter((s) => !s.comingSoon);
    let chosen = released.find((s) => s.code === requested);

    // Resolve a set that actually has a usable pool.
    let rows = chosen ? await poolForSet(chosen.code, field) : [];
    if (!rows.length) {
      for (const s of released) {
        const r = await poolForSet(s.code, field);
        if (r.length >= 8) { chosen = s; rows = r; break; }
      }
    }
    if (!chosen || rows.length < 8) {
      return NextResponse.json({ error: "No pack data for this set yet." }, { status: 503 });
    }

    const byRarity = new Map<string, typeof rows>();
    for (const c of rows) (byRarity.get(c.rarity) ?? byRarity.set(c.rarity, []).get(c.rarity)!).push(c);
    const poolOf = (r: string) => byRarity.get(r) ?? [];

    // Highest rarity available at or below a wishlist, so packs still work for
    // sets that don't print every tier.
    const fallback = (chain: string[]): typeof rows => {
      for (const r of chain) if (poolOf(r).length) return poolOf(r);
      return rows; // last resort: anything
    };

    const commons = fallback(["Common", "Uncommon", "Rare"]);
    const uncommons = fallback(["Uncommon", "Common", "Rare"]);
    const rares = fallback(["Rare", "Uncommon", "Epic"]);

    // The "hit" slot: mostly a rare, sometimes an epic, rarely a showcase.
    const roll = Math.random();
    const hitPool = roll < 0.08 ? fallback(["Showcase", "Epic", "Rare"])
      : roll < 0.30 ? fallback(["Epic", "Showcase", "Rare"])
      : fallback(["Rare", "Epic", "Uncommon"]);

    const slots: typeof rows = [
      ...sampleDistinct(commons, 8),
      ...sampleDistinct(uncommons, 3),
      ...sampleDistinct(rares, 1),
      pick(hitPool),
    ];

    const cards: PoolCard[] = slots.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      setCode: c.setCode,
      collectorNumber: c.collectorNumber,
      img: c.imageThumbUrl!,
      rarity: c.rarity,
      priceCents: pickPrice(c, country),
    }));

    return NextResponse.json(
      { currency: COUNTRIES[country].currency, setCode: chosen.code, setName: chosen.name, cards },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Couldn't open the pack — try again." }, { status: 503 });
  }
}
