import { getPriceHistory } from "@/lib/price-history";
import { currencyOf, DEFAULT_COUNTRY } from "@/lib/country";
import { PriceChart } from "./PriceChart";

// Price-history chart on the card page — free for everyone, on the AU baseline
// market (the series is collected there). MUST stay cookie-free: a getCountry()
// read here would opt the whole /card/[id] route back into per-request rendering
// and kill its ISR cache — the exact regression behind the "Discovered – currently
// not indexed" backlog. The chart is honestly labelled with its market.
export async function PriceHistoryChart({ cardId }: { cardId: string }) {
  const country = DEFAULT_COUNTRY;
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
