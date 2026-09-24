// Rows for a set page's "#price-guide" table (2026-09-24). Pure, so the sort
// and the naming are testable without a database: the page hands in the rows
// it already read for its intro (see app/sets/[set]/page.tsx).
import { cardDisplayName } from "./card-name";
import { displayRarity } from "./constants";

export interface SetPriceGuideRow {
  id: string;
  slug: string | null;
  /** Credentialed name, so two printings of one card can be told apart. */
  name: string;
  rarity: string;
  collectorNumber: string;
  /** Cheapest in-stock price in the page's market, cents; null = no live price. */
  priceCents: number | null;
  /** In-stock tracked stores in that market. */
  stores: number;
}

/** Every card, dearest first; cards with no live price last, by collector number. */
export function setPriceGuideRows(members: Record<string, unknown>[], field: string): SetPriceGuideRow[] {
  const rows = members
    .filter((m) => typeof m.id === "string")
    .map((m) => {
      const name = String(m.name);
      const collectorNumber = String(m.collectorNumber ?? "");
      const rarity = String(m.rarity ?? "");
      return {
        id: m.id as string,
        slug: (m.slug as string | null) ?? null,
        name: cardDisplayName(name, {
          rarity,
          collectorNumber,
          variant: (m.variant as string | null) ?? null,
          isPromo: (m.isPromo as boolean | null) ?? false,
        }),
        rarity: displayRarity({ setCode: String(m.setCode ?? ""), collectorNumber, rarity }),
        collectorNumber,
        priceCents: typeof m[field] === "number" ? (m[field] as number) : null,
        stores: typeof m.stores === "number" ? m.stores : 0,
      };
    });
  return rows.sort((a, b) => {
    if (a.priceCents != null && b.priceCents != null) return b.priceCents - a.priceCents || a.name.localeCompare(b.name);
    if (a.priceCents != null) return -1;
    if (b.priceCents != null) return 1;
    return a.collectorNumber.localeCompare(b.collectorNumber, "en", { numeric: true });
  });
}
