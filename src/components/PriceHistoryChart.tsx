import { getPriceHistory } from "@/lib/price-history";
import { DEFAULT_COUNTRY } from "@/lib/country";
import type { MarketRow } from "@/lib/market-rows";
import { LocalizedPriceHistory } from "./LocalizedPriceHistory";

// Price-history chart on the card page — free for everyone. Real per-market history
// exists (AU/US/UK/SG/CA/EU), but this /card route is cookie-free ISR, so we SSR the
// DEFAULT_COUNTRY series (a real series for crawlers) and let LocalizedPriceHistory
// client-fetch the VISITOR's own market and re-fetch on country switches. A
// getCountry() read here would opt the route back into per-request rendering and kill
// its ISR cache (the regression behind the "Discovered – not indexed" backlog).
export async function PriceHistoryChart({ cardId, rows }: { cardId: string; rows?: MarketRow[] }) {
  const points = await getPriceHistory(cardId, DEFAULT_COUNTRY);
  return <LocalizedPriceHistory cardId={cardId} initialPoints={points} initialCountry={DEFAULT_COUNTRY} rows={rows} />;
}
