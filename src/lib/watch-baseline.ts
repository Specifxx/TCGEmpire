import { currencyOf, type Country } from "./country";
import { formatMoney } from "./format";

// "WATCHING FROM" on /watching and in the drawer (components/Watchlist.tsx).
//
// The figure is PriceAlert.startPriceCents — the price when the watch was
// created, written once and never by the cron — in the WATCH'S OWN market
// currency (an AU watch reads A$ whatever market the viewer is browsing). Rows
// from before that column existed fall back to lastPriceCents, which the cron
// advances on every move; those are labelled as the last check rather than
// passed off as a start price (until 2026-09-25 every row read "watching from"
// today's price, and the delta sat near 0%).
//
// The %-change is shown only when the watch's market IS the viewer's market:
// `now` is the viewer's price, and comparing an A$ start with a US$ price is a
// number with no meaning. It is also null when either end is missing — a card
// with no current price shows the baseline alone rather than a fake 0%.
export function watchBaseline(
  it: { market: string; startPriceCents: number | null; lastPriceCents: number | null },
  viewerCountry: string,
  now: number | null,
): { label: string; text: string | null; delta: number | null } {
  const cents = it.startPriceCents ?? it.lastPriceCents;
  const label = it.startPriceCents != null ? "watching from" : "at the last check";
  const text = cents != null ? formatMoney(cents, currencyOf(it.market as Country)) : null;
  const delta =
    it.market === viewerCountry && cents != null && cents > 0 && now != null
      ? Math.round(((now - cents) / cents) * 100)
      : null;
  return { label, text, delta };
}
