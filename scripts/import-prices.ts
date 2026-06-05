/**
 * Import live Riftbound single prices from Australian retailers into RetailerPrice,
 * for the price-comparison feature.
 *
 * Most AU TCG stores run on Shopify, which exposes a public products.json feed.
 * We read that (public catalogue data only), match each product to a card in our
 * database, and store the cheapest available price per store.
 *
 * Usage: npx tsx scripts/import-prices.ts
 *
 * Note: this reads publicly available catalogue JSON. Outbound links are stored so
 * users click through to the retailer (the monetisation path). Review each store's
 * terms before commercial use, and prefer official affiliate programs where offered.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

interface Store {
  key: string;
  name: string;
  base: string; // origin, no trailing slash
  collections: string[]; // Shopify collection handles to read
}

// Add/adjust stores here. Each must be a Shopify storefront.
const STORES: Store[] = [
  { key: "cherry", name: "Cherry Collectables", base: "https://www.cherrycollectables.com.au", collections: ["riftbound-singles"] },
  { key: "ozzie", name: "Ozzie Collectables", base: "https://www.ozziecollectables.com", collections: ["riftbound-singles"] },
  { key: "finalboss", name: "The Final Boss Collectables", base: "https://thefinalbosscollectables.com.au", collections: ["riftbound-tcg-singles"] },
];

const SET_FROM_TITLE: [RegExp, string][] = [
  [/proving grounds/i, "OGS"],
  [/origins/i, "OGN"],
];

interface ShopifyVariant { title: string; price: string; available: boolean }
interface ShopifyProduct { title: string; handle: string; variants: ShopifyVariant[] }

// Normalise a collector-number segment to a comparable key: strip leading zeros
// and the "*" signature marker, keep any alt-art letter. "039a" -> "39a", "299*" -> "299".
function numKey(seg: string): string {
  const m = seg.match(/^0*(\d+)([a-z]*)/i);
  return m ? m[1] + m[2].toLowerCase() : seg.toLowerCase();
}
function nameKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchCollection(store: Store, handle: string): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    const url = `${store.base}/collections/${handle}/products.json?limit=250&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 RiftEmpireBot" } });
    } catch {
      break;
    }
    if (!res.ok) break;
    const data = (await res.json()) as { products: ShopifyProduct[] };
    if (!data.products?.length) break;
    all.push(...data.products);
    if (data.products.length < 250) break;
  }
  return all;
}

async function main() {
  const cards = await prisma.card.findMany({
    select: { id: true, name: true, setCode: true, collectorNumber: true, rarity: true, variant: true },
  });

  // Lookups for matching.
  const byNum = new Map<string, string[]>(); // `${set}|${numKey}` -> cardIds
  const byNumAny = new Map<string, string[]>(); // numKey -> cardIds (any set)
  const byName = new Map<string, typeof cards>(); // nameKey -> cards[]
  for (const c of cards) {
    const nk = numKey(c.collectorNumber.split("/")[0]);
    (byNum.get(`${c.setCode}|${nk}`) ?? byNum.set(`${c.setCode}|${nk}`, []).get(`${c.setCode}|${nk}`)!).push(c.id);
    (byNumAny.get(nk) ?? byNumAny.set(nk, []).get(nk)!).push(c.id);
    const nmk = nameKey(c.name);
    (byName.get(nmk) ?? byName.set(nmk, []).get(nmk)!).push(c);
  }

  function resolveCardId(p: ShopifyProduct): string | null {
    const t = p.title;
    const numMatch = t.match(/\((\d+)([a-z*]*)\/\d+\)/i);
    const nk = numMatch ? numMatch[1] + numMatch[2].replace(/\*/g, "").toLowerCase() : null;
    const setCode = SET_FROM_TITLE.find(([re]) => re.test(t))?.[1] ?? "OGN";
    const isShowcase = /showcase|signature|foil/i.test(t);

    // 1) name match (most reliable for the card identity), disambiguated by number/variant.
    const namePart = t.split("(")[0];
    const cand = byName.get(nameKey(namePart));
    if (cand && cand.length) {
      if (cand.length === 1) return cand[0].id;
      if (nk) {
        const exact = cand.find((c) => numKey(c.collectorNumber.split("/")[0]) === nk);
        if (exact) return exact.id;
      }
      const byVariant = cand.find((c) => (isShowcase ? c.variant || c.rarity === "Showcase" : !c.variant));
      if (byVariant) return byVariant.id;
      return cand[0].id;
    }

    // 2) fall back to number match.
    if (nk) {
      const setHit = byNum.get(`${setCode}|${nk}`);
      if (setHit?.length === 1) return setHit[0];
      const anyHit = byNumAny.get(nk);
      if (anyHit?.length === 1) return anyHit[0];
      if (setHit?.length) return setHit[0];
    }
    return null;
  }

  let totalMatched = 0;
  let totalUnmatched = 0;
  const touchedCardIds = new Set<string>();

  for (const store of STORES) {
    const products: ShopifyProduct[] = [];
    for (const handle of store.collections) {
      products.push(...(await fetchCollection(store, handle)));
    }
    if (!products.length) {
      console.log(`  ${store.name}: no products (store/collection unavailable) — skipped`);
      continue;
    }

    // refresh: clear this store's prices then re-insert.
    await prisma.retailerPrice.deleteMany({ where: { retailer: store.key } });

    const rows = new Map<string, any>(); // cardId -> chosen row (cheapest available)
    let matched = 0;
    let unmatched = 0;

    for (const p of products) {
      const cardId = resolveCardId(p);
      if (!cardId) { unmatched++; continue; }
      matched++;

      // choose cheapest available variant (fallback: cheapest overall, marked OOS).
      const variants = p.variants.filter((v) => parseFloat(v.price) > 0);
      if (!variants.length) continue;
      const avail = variants.filter((v) => v.available);
      const pool = avail.length ? avail : variants;
      const best = pool.reduce((a, b) => (parseFloat(a.price) <= parseFloat(b.price) ? a : b));
      const priceCents = Math.round(parseFloat(best.price) * 100);

      const prev = rows.get(cardId);
      if (prev && prev.priceCents <= priceCents) continue;
      rows.set(cardId, {
        cardId,
        retailer: store.key,
        retailerName: store.name,
        title: p.title,
        url: `${store.base}/products/${p.handle}`,
        condition: best.title && best.title !== "Default Title" ? best.title : null,
        isFoil: /foil/i.test(p.title),
        priceCents,
        currency: "AUD",
        inStock: avail.length > 0,
      });
      touchedCardIds.add(cardId);
    }

    await prisma.retailerPrice.createMany({ data: Array.from(rows.values()) });
    console.log(`  ${store.name}: ${products.length} products → ${rows.size} cards priced, ${matched} matched, ${unmatched} unmatched`);
    totalMatched += matched;
    totalUnmatched += unmatched;
  }

  // Recompute each card's lowest live price (prefer in-stock).
  console.log("Recomputing lowest prices…");
  const priced = await prisma.retailerPrice.groupBy({
    by: ["cardId"],
    _min: { priceCents: true },
  });
  await prisma.card.updateMany({ data: { lowestPriceCents: null } });
  for (const row of priced) {
    const inStockMin = await prisma.retailerPrice.aggregate({
      where: { cardId: row.cardId, inStock: true },
      _min: { priceCents: true },
    });
    const lowest = inStockMin._min.priceCents ?? row._min.priceCents ?? null;
    await prisma.card.update({ where: { id: row.cardId }, data: { lowestPriceCents: lowest } });
  }

  console.log(`Done. ${totalMatched} matched, ${totalUnmatched} unmatched across stores. ${priced.length} cards now have prices.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
