// The price the Radiance pre-order CTA quotes: the cheapest OPEN Booster Box
// pre-order in each market. DECISIONS.md, "Routing Radiance search traffic to
// /radiance-preorders", 2026-09-24.
//
// Every market at once, because the pages carrying the CTA are ISR pages with
// no per-visitor market on the server (blog posts); the client picks the
// visitor's. Six reads of getPreorderGroups(), each already cached per market
// by getAllSealedGroups — and deliberately NOT wrapped in another
// unstable_cache (CLAUDE.md: never nest a self-caching loader).
import { getPreorderGroups } from "./sealed-import";
import { COUNTRY_LIST, type Country } from "./country";

export type RadianceBoxPrices = Partial<Record<Country, number>>;

export async function getRadianceBoxPrices(): Promise<RadianceBoxPrices> {
  const out: RadianceBoxPrices = {};
  await Promise.all(
    COUNTRY_LIST.map(async ({ code }) => {
      const groups = await getPreorderGroups(code).catch(() => []);
      // lowestPriceCents is already the cheapest OPEN offer (lib/sealed-offers.ts):
      // a sold-out store can never be the number this CTA advertises.
      const box = groups.find((g) => g.setCode === "RAD" && g.productType === "Booster Box");
      if (box?.lowestPriceCents != null) out[code] = box.lowestPriceCents;
    }),
  );
  return out;
}
