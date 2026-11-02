// RiftCompare's side of the Compare Empire network (lib/family-network.ts, DECISIONS.md "Sites that grow
// each other", 2026-11-02).
//
// OUT: scripts/family-feed.ts writes data/public/family/family-feed.json from the morning's public sealed
//   snapshot (data/public/sealed-listings.json, no database read), so the sisters can show our best deals
//   and the next set's pre-orders. familyItemsFromRows is pure (tests/family.test.ts).
// IN: the card sisters' feeds, read from GitHub through ONE unstable_cache entry held six hours (the floor
//   for pages buyers act on; 24 hours for the monthly report), so a force-dynamic set page never fetches
//   per request. Plain fetches inside it (no nested cache), and nothing else is called from inside it.
import { unstable_cache } from "next/cache";
import { ALL_FALLBACK_RETAILERS, SETS } from "./constants";
import {
  clusterIds,
  fetchFamilyFeeds,
  pickTiles,
  type FamilyFeed,
  type FamilyItem,
  type FamilyRegion,
  type FamilyTile,
} from "./family-network";

const SITE = "https://riftcompare.com";
const CURRENCY: Record<string, string> = { US: "USD", AU: "AUD", UK: "GBP", EU: "EUR", CA: "CAD", SG: "SGD" };

export interface SealedRow {
  groupKey: string;
  title: string;
  productType: string;
  setCode: string | null;
  retailer: string;
  retailerName: string;
  priceCents: number;
  imageUrl: string | null;
  inStock: boolean;
  country: string;
}

const MARKETPLACE = new Set(ALL_FALLBACK_RETAILERS);
const isStore = (r: SealedRow) => !r.retailer.startsWith("ebay") && !r.retailer.startsWith("tcgplayer") && !MARKETPLACE.has(r.retailer);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Deals (cheapest in-stock store at least 10% under the median of 3+ stores, the /black-friday bar) and the next set's box pre-orders, per market. */
export function familyItemsFromRows(rows: readonly SealedRow[], today: string): FamilyItem[] {
  const groups = new Map<string, SealedRow[]>();
  for (const r of rows) {
    if (!isStore(r) || !r.inStock || !CURRENCY[r.country] || r.priceCents <= 0) continue;
    const k = `${r.groupKey}|${r.country}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const upcoming = new Map(SETS.filter((s) => s.releasedOn && s.releasedOn > today).map((s) => [s.code, s]));
  const named = (r: SealedRow) => {
    const set = SETS.find((s) => s.code === r.setCode);
    if (!set || !r.productType) return r.title;
    return set.name.toLowerCase().includes(r.productType.toLowerCase()) ? `Riftbound ${set.name}` : `Riftbound ${set.name} ${r.productType}`;
  };
  const out: FamilyItem[] = [];
  for (const list of groups.values()) {
    const best = list.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
    const region = best.country as FamilyRegion;
    const set = best.setCode ? upcoming.get(best.setCode) : undefined;
    const base = { cluster: "cards" as const, region, title: named(best), image: best.imageUrl, cents: best.priceCents, currency: CURRENCY[best.country], store: best.retailerName };
    if (set) {
      if (!/booster box/i.test(best.productType)) continue;
      out.push({ ...base, kind: "preorder", url: `${SITE}/${set.slug}-preorders`, releaseDate: set.releasedOn ?? null });
      continue;
    }
    const stores = new Set(list.map((r) => r.retailer));
    if (stores.size < 3) continue;
    const mid = median([...stores].map((s) => Math.min(...list.filter((r) => r.retailer === s).map((r) => r.priceCents))));
    const pct = Math.round((1 - best.priceCents / mid) * 100);
    if (pct < 10 || pct > 50) continue;
    out.push({ ...base, kind: "deal", url: `${SITE}/sealed?q=${encodeURIComponent(named(best))}`, refCents: mid, refLabel: "median store price" });
  }
  return out;
}

export function familyLinks(): FamilyFeed["links"] {
  const next = SETS.filter((s) => s.releasedOn && s.releasedOn > new Date().toISOString().slice(0, 10)).sort((a, b) => (a.releasedOn ?? "").localeCompare(b.releasedOn ?? ""))[0];
  return Object.fromEntries(
    Object.keys(CURRENCY).map((c) => [c, { deals: `${SITE}/black-friday`, ...(next ? { preorders: `${SITE}/${next.slug}-preorders` } : {}) }]),
  );
}

const plain = async (url: string) => {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};

const SIX_HOURS = 21600;
const DAY = 86400;
// Two entries by TTL, never nested: the report page is held a day and must not be dragged down to six hours.
const feeds6h = unstable_cache(() => fetchFamilyFeeds(clusterIds("rift"), plain), ["family-feeds-v1", "6h"], { revalidate: SIX_HOURS });
const feeds1d = unstable_cache(() => fetchFamilyFeeds(clusterIds("rift"), plain), ["family-feeds-v1", "1d"], { revalidate: DAY });

/** The card sisters' feeds (validated, fresh). Empty on any failure: the block then renders nothing. */
export async function getFamilyFeeds(ttl: "6h" | "1d" = "6h"): Promise<FamilyFeed[]> {
  try {
    return await (ttl === "1d" ? feeds1d() : feeds6h());
  } catch {
    return [];
  }
}

export async function getFamilyTiles(kind: "deal" | "preorder", country: string): Promise<FamilyTile[]> {
  return pickTiles(await getFamilyFeeds("6h"), { self: "rift", cluster: "cards", kind, region: country as FamilyRegion, max: 6 });
}
