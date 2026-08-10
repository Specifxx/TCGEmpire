import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, pickPrice, priceField, type PriceField } from "@/lib/country";
import { SETS } from "@/lib/constants";
import { PACK_SLOTS, EPIC_UPGRADE_PER_RARE_SLOT, FOIL_UPGRADE_CHANCE } from "@/lib/pack-composition";

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
        type: true, // the rune slot needs to find actual Rune cards
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

/** How many of a given slot a pack carries, from the sourced composition. */
const slotCount = (key: string): number => PACK_SLOTS.find((s) => s.key === key)?.count ?? 0;

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
    // Newest first, matching the picker's order on the page — an unspecified or
    // unusable set should fall back to the CURRENT set, not to Origins.
    const released = SETS.filter((s) => !s.comingSoon)
      .slice()
      .sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? ""));

    // CAN THIS SET ACTUALLY FILL A PACK? The old guard was `rows.length >= 8`,
    // which counts cards without caring what they are. A set part-way through
    // import — a handful of chase prints catalogued and no base cards yet — sails
    // past it and produces a "pack" of thirteen Showcase cards, because every
    // rarity falls through fallback()'s last resort. That used to be a curiosity
    // on a set nobody picked; now that the simulator DEFAULTS to the newest set,
    // it would be the first thing a visitor sees during exactly the week a new
    // set is being imported.
    const usable = (rows: { rarity: string }[]) => {
      const n = (r: string) => rows.filter((c) => c.rarity === r).length;
      return n("Common") >= slotCount("common") && n("Uncommon") >= slotCount("uncommon") && n("Rare") >= slotCount("rare");
    };

    let chosen = released.find((s) => s.code === requested);
    let rows = chosen ? await poolForSet(chosen.code, field) : [];
    if (!chosen || !usable(rows)) {
      chosen = undefined;
      for (const s of released) {
        const r = await poolForSet(s.code, field);
        if (usable(r)) { chosen = s; rows = r; break; }
      }
    }
    if (!chosen || !usable(rows)) {
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
    const epics = fallback(["Epic", "Showcase", "Rare"]);

    // ── The real pack ────────────────────────────────────────────────────────
    // 7 common, 3 uncommon, 2 rare-or-better, 1 foil, 1 rune = 14 cards, per
    // Riot's own breakdown (see lib/pack-composition.ts for the citation).
    //
    // This deal used to be 8 commons, 3 uncommons, 1 rare and an invented "hit"
    // slot rolling 8/22/70 across Showcase/Epic/Rare — thirteen cards, three of
    // the five numbers wrong, and no foil or rune slot at all, on a page that
    // told visitors it used "the same odds by rarity as a physical pack".
    const slots: typeof rows = [
      ...sampleDistinct(commons, slotCount("common")),
      ...sampleDistinct(uncommons, slotCount("uncommon")),
    ];

    // Two rare-or-better slots, each independently upgrading to Epic. Riot says
    // an Epic REPLACES a card in the rare slot and that two Epics in one pack is
    // possible, so the upgrade is rolled per slot rather than once per pack.
    const rareSlots = slotCount("rare");
    const rareDraw = sampleDistinct(rares, rareSlots);
    for (let i = 0; i < rareSlots; i++) {
      const upgraded = Math.random() < EPIC_UPGRADE_PER_RARE_SLOT && epics.length > 0;
      slots.push(upgraded ? pick(epics) : rareDraw[i] ?? pick(rares));
    }

    // The foil slot: usually a common or uncommon, sometimes a Rare or Epic.
    // Rares and Epics are always foil in print, so an upgrade here is the only
    // way this slot differs from a base card in a simulation that cannot show
    // foiling. FOIL_UPGRADE_CHANCE is our inference, not Riot's — see the file.
    const foilPool = Math.random() < FOIL_UPGRADE_CHANCE ? fallback(["Epic", "Rare"]) : fallback(["Uncommon", "Common"]);
    slots.push(pick(foilPool));

    // The token/rune slot. Runes are their own card type rather than a rarity,
    // so this only deals one when the set actually has them catalogued —
    // otherwise the slot is dropped rather than filled with a pretend rune.
    const runes = rows.filter((c) => c.type === "Rune");
    if (runes.length) slots.push(pick(runes));

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
