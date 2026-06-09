import { getPriceHistory } from "@/lib/price-history";
import { getCountry } from "@/lib/get-country";
import { currencyOf } from "@/lib/country";
import { PriceChart } from "./PriceChart";

// Price-history chart on the card page — free for everyone, in the viewer's market.
// Data comes from the daily per-market PriceHistory snapshots (lowest price).
export async function PriceHistoryChart({ cardId }: { cardId: string }) {
  const country = getCountry();
  const points = await getPriceHistory(cardId, country);

  return (
    <section className="card-surface mt-6 p-5">
      <h2 className="flex items-center gap-2 font-bold text-white">
        Price history <span className="text-xs font-normal text-slate-500">({country} · lowest price)</span>
      </h2>
      <div className="mt-3">
        <PriceChart points={points} currency={currencyOf(country)} />
      </div>
    </section>
  );
}
