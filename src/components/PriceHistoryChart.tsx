import { getPriceHistory } from "@/lib/price-history";
import { PriceChart } from "./PriceChart";

// Price-history chart on the card page — free for everyone. Data comes from the
// daily PriceHistory snapshots (AU market, lowest price).
export async function PriceHistoryChart({ cardId }: { cardId: string }) {
  const points = await getPriceHistory(cardId);

  return (
    <section className="card-surface mt-6 p-5">
      <h2 className="flex items-center gap-2 font-bold text-white">
        Price history <span className="text-xs font-normal text-slate-500">(AU · lowest price)</span>
      </h2>
      <div className="mt-3">
        <PriceChart points={points} currency="AUD" />
      </div>
    </section>
  );
}
