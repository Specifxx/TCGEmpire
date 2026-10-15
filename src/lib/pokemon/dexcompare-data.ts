// The DexCompare join table's loader (lib/pokemon/dexcompare.ts has the why).
// NO DATABASE: one fetch of DexCompare's public, CDN-cached browse index per
// market per cache miss, parsed into a join table of ~10-95 KB (US the
// largest), cached under the section's tag and TTL like getPokemonCatalog.
//
// Self-cached (tests/nested-cache.test.ts lists it): call it from a page or a
// route, never from inside another unstable_cache callback, where Next would
// skip this cache and fetch DexCompare on every outer miss.
//
// FAIL-SOFT: any failure (DexCompare down, slow, or a new index format) is
// thrown inside the cache, so nothing is cached and the last good entry keeps
// serving while there is one, and caught here, so a page renders without the
// stores line rather than failing. A page rendered in that window shows no
// stores line until its next refresh.

import { cache } from "react";
import { cachedOrDirect } from "../price-history";
import type { Country } from "../country";
import { POKEMON_TAG, POKEMON_TTL } from "./cache-keys";
import { DEX_ORIGIN, DEX_REGION, parseDexIndex, type DexMarket } from "./dexcompare";

const TIMEOUT_MS = 4000;

async function fetchDexMarket(market: Country): Promise<DexMarket> {
  // no-store: the unstable_cache entry around this is the cache (Next runs the
  // callback under force-no-store anyway), and the body is ~45-400 KB.
  const res = await fetch(`${DEX_ORIGIN}/api/browse/${DEX_REGION[market]}`, {
    cache: "no-store",
    headers: { accept: "application/json", "user-agent": "RiftCompare-Pokemon/1 (+https://riftcompare.com/pokemon)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`DexCompare index ${market}: HTTP ${res.status}`);
  return parseDexIndex(await res.json(), market);
}

/** One market's DexCompare join table, or null when it cannot be read. Deduped per request. */
export const getDexMarket = cache(async (market: Country): Promise<DexMarket | null> => {
  try {
    return await cachedOrDirect(() => fetchDexMarket(market), ["pokemon-dex-v1", market], {
      revalidate: POKEMON_TTL,
      tags: [POKEMON_TAG],
    });
  } catch (e) {
    console.error(`[pokemon] DexCompare index for ${market} unavailable; stores line left out`, e);
    return null;
  }
});

/** Every market's table, for the product page and the quick view, which ship all six boards. */
export async function getDexMarkets(markets: readonly Country[]): Promise<Partial<Record<Country, DexMarket | null>>> {
  const tables = await Promise.all(markets.map((m) => getDexMarket(m)));
  return Object.fromEntries(markets.map((m, i) => [m, tables[i]]));
}
