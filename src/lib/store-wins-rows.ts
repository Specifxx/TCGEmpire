// The snapshot rows the cheapest-store record counts (lib/store-wins.ts), passed through the SAME guards the sealed
// pages apply before a shopper sees a row (lib/sealed-import.ts, the sealed groups): the legacy product type brought
// up to date, a store that charges in another currency dropped, and a price implausibly low for its type (a $1
// "Booster Case") dropped. Each row's title becomes the product's own name as the site shows it ("Radiance Booster
// Box"), not the first store's listing title. So a badge never claims a win the site itself would not have shown.
import type { Country } from "./country";
import { sealedFloorCents } from "./ebay";
import { offerCurrencyOk } from "./offer-currency";
import { joinOverlapping, typeLabel } from "./price-report";
import { SET_NAMES, canonicalSealedRow } from "./sealed-import";
import type { WinsRow } from "./store-wins";

export interface SnapshotSealedRow extends WinsRow {
  setCode: string | null;
}

export function winsRows(rows: readonly SnapshotSealedRow[]): WinsRow[] {
  const out: WinsRow[] = [];
  for (const raw of rows) {
    const r = canonicalSealedRow(raw);
    if (!offerCurrencyOk(r.retailer, r.country as Country)) continue;
    if (r.priceCents < sealedFloorCents(r.productType)) continue;
    const setName = r.setCode ? SET_NAMES[r.setCode] ?? r.setCode : null;
    out.push({ ...r, title: setName ? joinOverlapping(setName, typeLabel(r.setCode, r.productType)) : r.title });
  }
  return out;
}
