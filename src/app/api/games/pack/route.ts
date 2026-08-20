import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, pickPrice, priceField, type PriceField } from "@/lib/country";
import { SETS } from "@/lib/constants";
import { PACK_SLOTS, PULL_RATES, EPIC_UPGRADE_PER_RARE_SLOT, FOIL_UPGRADE_CHANCE } from "@/lib/pack-composition";
import { poolOf } from "@/lib/box-ev";

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
      // NO `variant: null` FILTER. It used to be here, and it silently made three
      // of the four rates this page publishes impossible: scripts/fix-altart-
      // rarity.ts rewrites every `variant != null` row to rarity "Showcase", so
      // filtering them out removed every alt-art, and the over-numbered and
      // signature prints that survived were reclassified into a "Showcase"
      // bucket no fallback chain ever reached. The page listed alt-art,
      // over-numbered and signature rates that the simulator could never deal.
      //
      // Pools are now built with poolOf() from lib/box-ev, which classifies on
      // collectorNumber/variant/isPromo rather than the rarity column that
      // script overwrites — which is exactly why it can see them.
      where: { setCode, isPromo: false, imageThumbUrl: { not: null } },
      select: {
        id: true, slug: true, name: true, setCode: true, collectorNumber: true, rarity: true,
        variant: true, isOvernumbered: true, isPromo: true,
        type: true, // the rune slot needs to find actual Rune cards
        imageThumbUrl: true,
        lowestPriceCents: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true, lowestPriceCentsSg: true, lowestPriceCentsCa: true,
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
    const usable = (rows: { rarity: string; variant?: string | null; isPromo?: boolean; setCode?: string; collectorNumber?: string; isOvernumbered?: boolean }[]) => {
      const n = (r: string) => rows.filter((c) => c.rarity === r && c.variant == null).length;
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

    // Classify every row into its PACK SLOT pool. Runes are pulled out first:
    // they carry an ordinary rarity, so leaving them in would let the same rune
    // be dealt twice — once as a common, once in its own slot.
    // Every rune, so none of them leak into the base rarity pools…
    const allRunes = rows.filter((c) => c.type === "Rune");
    const runeIds = new Set(allRunes.map((c) => c.id));
    // …but the slot deals BASE runes only. Half of Origins' catalogued runes are
    // alt-arts, so drawing uniformly handed one out in half of all packs, against
    // Riot's "and very rarely, a special alt-art basic rune". They publish no
    // figure for "very rarely", so rather than invent one the alt-art rune is
    // simply not simulated — and the page says so.
    const runePool = allRunes.filter((c) => poolOf(c) != null && !["AltArt", "Overnumbered", "Signature"].includes(poolOf(c)!));

    const byPool = new Map<string, typeof rows>();
    for (const c of rows) {
      if (runeIds.has(c.id)) continue;
      const k = poolOf(c);
      if (!k) continue; // promos aren't pack pulls
      (byPool.get(k) ?? byPool.set(k, []).get(k)!).push(c);
    }
    const poolFor = (r: string) => byPool.get(r) ?? [];

    // Highest rarity available at or below a wishlist, so packs still work for
    // sets that don't print every tier.
    const fallback = (chain: string[]): typeof rows => {
      for (const r of chain) if (poolFor(r).length) return poolFor(r);
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
    // ── Dealing, with a GLOBAL no-repeat rule ────────────────────────────
    // sampleDistinct only dedupes WITHIN one pool, so the later single-card
    // draws (the Epic upgrade, the foil slot, the rune) could each hand back a
    // card already in the pack — a double-Epic pack could be the same Epic
    // twice, and the foil slot repeated one of the seven commons four times in
    // five. The page promises no card appears twice; now it is true.
    const slots: typeof rows = [];
    const used = new Set<string>();
    const take = (pool: typeof rows): void => {
      const fresh = pool.filter((c) => !used.has(c.id));
      const from = fresh.length ? fresh : pool;
      if (!from.length) return;
      const card = pick(from);
      used.add(card.id);
      slots.push(card);
    };
    const takeMany = (pool: typeof rows, k: number): void => {
      for (let i = 0; i < k; i++) take(pool);
    };

    takeMany(commons, slotCount("common"));
    takeMany(uncommons, slotCount("uncommon"));

    // Two rare-or-better slots, each independently upgrading to Epic. Riot says
    // an Epic REPLACES a card in the rare slot and that two Epics in one pack is
    // possible, so the upgrade is rolled per slot rather than once per pack.
    for (let i = 0; i < slotCount("rare"); i++) {
      take(Math.random() < EPIC_UPGRADE_PER_RARE_SLOT && epics.length ? epics : rares);
    }

    // ── The foil slot, and the chase tier that rides on it ───────────────────
    // This is where Riot's other three published rates actually happen. They are
    // rolled rarest-first off one uniform so the tiers cannot overlap, at the
    // published per-pack frequencies (PULL_RATES.onePerPacks, converted from
    // their per-box figures at 24 packs a box). Before this, alt-art,
    // over-numbered and signature were printed on the page as rates and were
    // literally unreachable in the code.
    const chaseRoll = Math.random();
    let chased = false;
    let cumulative = 0;
    for (const key of ["signature", "overnumbered", "altart"] as const) {
      const rate = PULL_RATES.find((r) => r.key === key);
      if (!rate?.onePerPacks) continue;
      cumulative += 1 / rate.onePerPacks;
      const pool = poolFor(key === "altart" ? "AltArt" : key === "overnumbered" ? "Overnumbered" : "Signature");
      if (chaseRoll < cumulative && pool.length) {
        take(pool);
        chased = true;
        break;
      }
    }
    if (!chased) {
      // No chase this pack: an ordinary foil. Usually a common or uncommon,
      // sometimes a Rare or Epic. FOIL_UPGRADE_CHANCE is our inference, not
      // Riot's — see lib/pack-composition.ts.
      take(Math.random() < FOIL_UPGRADE_CHANCE ? fallback(["Epic", "Rare"]) : fallback(["Uncommon", "Common"]));
    }

    // The token/rune slot. Runes are their own card type rather than a rarity,
    // so this only deals one when the set actually has them catalogued. The
    // response says which slots were dealt rather than letting a 13-card pack
    // quietly contradict the 14 the page promises.
    if (runePool.length) take(runePool);

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
      {
        currency: COUNTRIES[country].currency,
        setCode: chosen.code,
        setName: chosen.name,
        cards,
        // False when the set has no runes catalogued, so the pack is 13 rather
        // than the 14 Riot describes. The UI says so rather than staying quiet.
        runeSlotDealt: runePool.length > 0,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Couldn't open the pack — try again." }, { status: 503 });
  }
}
