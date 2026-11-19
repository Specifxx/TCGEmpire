// The Black Friday strip's data for one sealed product, per market (server only: it reads the sealed price history files and the
// measured shipping snapshot, both bundled with the release, so the page adds no database read). See lib/bf-strip.ts for the
// rules and DECISIONS.md, "Black Friday strip on sealed pages" (2026-11-19).
import type { BlackFridayStripData } from "@/components/BlackFridayStrip";
import { bfStripOn, cueDate, lowCue, lowCueText } from "./bf-strip";
import { isPreorderSetCode, setByCode } from "./constants";
import { COUNTRIES, type Country } from "./country";
import { formatMoney } from "./format";
import { saleStrip } from "./holiday-strip";
import { sealedHistoryRows } from "./price-history-store";
import type { SealedGroup } from "./sealed-import";
import { headlineOffer } from "./sealed-offers";
import { shippingFor } from "./shipping";

export function bfStripByMarket(
  byMarket: Partial<Record<Country, SealedGroup>>,
  setCode: string | null,
  now: Date = new Date(),
): Partial<Record<Country, BlackFridayStripData>> {
  const today = now.toISOString().slice(0, 10);
  const sale = saleStrip(today);
  if (!sale || !bfStripOn(today)) return {};
  const set = setCode ? setByCode(setCode) : null;
  const preorder = isPreorderSetCode(setCode, now) && set?.releasedOn ? `Pre-order · out ${cueDate(set.releasedOn, today)}` : null;
  const since = new Date(now.getTime() - 91 * 86_400_000);
  let rows: ReturnType<typeof sealedHistoryRows> = [];
  try {
    rows = sealedHistoryRows({ since });
  } catch {
    rows = []; // no history: no cue, never an error page
  }
  const out: Partial<Record<Country, BlackFridayStripData>> = {};
  for (const [country, g] of Object.entries(byMarket) as [Country, SealedGroup][]) {
    const currency = COUNTRIES[country].currency;
    const fmt = (c: number) => formatMoney(c, currency);
    const best = headlineOffer(g.listings, now.getTime());
    let shipping: string | null = null;
    if (best) {
      // Only a MEASURED free order is said: the snapshot measured card-sized carts, so a paid rate is not quoted for a box.
      const q = shippingFor(best.retailer, { subtotalCents: best.priceCents, items: 1 }, { trackedOnly: true });
      if (q.basis === "measured" && q.free && !q.unavailable && !q.upTo) shipping = "Free shipping";
    }
    const days = rows
      .filter((r) => r.groupKey === g.groupKey && r.country === country)
      .map((r) => ({ day: r.day.toISOString().slice(0, 10), cents: r.lowestPriceCents }));
    const cue = lowCue(days, g.lowestPriceCents, today);
    out[country] = {
      label: sale.name,
      cheapest: best ? `${fmt(best.priceCents)} at ${best.retailerName}` : null,
      shipping,
      checked: best?.lastSeen ?? null,
      preorder,
      cue: cue ? { text: lowCueText(cue, fmt, today), lowest: cue.kind === "lowest" } : null,
    };
  }
  return out;
}
