// The price the Radiance pre-order CTA quotes: the cheapest OPEN Booster Box
// pre-order in each market. DECISIONS.md, "Routing Radiance search traffic to
// /radiance-preorders", 2026-09-24.
//
// Every market at once, because the pages carrying the CTA are ISR pages with
// no per-visitor market on the server (blog posts); the client picks the
// visitor's. Six reads of getPreorderGroups(), each already cached per market
// by getAllSealedGroups — and deliberately NOT wrapped in another
// unstable_cache (CLAUDE.md: never nest a self-caching loader).
//
// From release day the boxes are no longer pre-orders, so the same read comes
// from getSealedGroups() (the shipped side, same per-market cache): the pull
// tracker's box cost keeps working for Radiance after 23 Oct 2026.
import { getPreorderGroups, getSealedGroups } from "./sealed-import";
import { COUNTRY_LIST, type Country } from "./country";
import { isPreorderSetCode } from "./constants";

export type RadianceBoxPrices = Partial<Record<Country, number>>;

export async function getRadianceBoxPrices(): Promise<RadianceBoxPrices> {
  return getSetBoxPrices("RAD");
}

/**
 * The same read for any set: the cheapest OPEN Booster Box per market, from the
 * pre-order side while the set is still a pre-order, the shipped side after.
 * Legacy's pre-order banner (components/LegacyPreorderCta.tsx, 2026-11-01)
 * reads it for LGC.
 */
export async function getSetBoxPrices(setCode: string): Promise<RadianceBoxPrices> {
  const out: RadianceBoxPrices = {};
  const preorder = isPreorderSetCode(setCode);
  await Promise.all(
    COUNTRY_LIST.map(async ({ code }) => {
      const groups = await (preorder ? getPreorderGroups(code) : getSealedGroups(code)).catch(() => []);
      // lowestPriceCents is already the cheapest OPEN offer (lib/sealed-offers.ts):
      // a sold-out store can never be the number this CTA advertises.
      const box = groups.find((g) => g.setCode === setCode && g.productType === "Booster Box");
      if (box?.lowestPriceCents != null) out[code] = box.lowestPriceCents;
    }),
  );
  return out;
}
