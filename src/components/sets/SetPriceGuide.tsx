import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { rarityInfo } from "@/lib/constants";
import type { SetPriceGuideRow } from "@/lib/set-price-guide";

// Server-rendered price list for every card in a set, dearest first, under
// the H2 "Riftbound {Set} price guide" (#price-guide). See lib/set-price-guide.ts.
export function SetPriceGuide({
  setName,
  rows,
  currency,
  adjective,
}: {
  setName: string;
  rows: SetPriceGuideRow[];
  currency: string;
  adjective: string;
}) {
  if (!rows.length) return null;
  const priced = rows.filter((r) => r.priceCents != null).length;
  return (
    <section id="price-guide" aria-labelledby="price-guide-h" className="card-surface scroll-mt-header overflow-hidden">
      <div className="p-4 sm:p-5">
        <h2 id="price-guide-h" className="text-xl font-extrabold text-white">
          Riftbound {setName} price guide
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          All {rows.length} {setName} cards, most expensive first — the cheapest in-stock price across {adjective} stores in{" "}
          {currency} ({priced} with a live price today). Updated daily.
        </p>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <thead className="sticky top-0 border-y border-ink-800 bg-ink-900 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">Card</th>
              <th scope="col" className="px-3 py-2 font-semibold">Rarity</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Cheapest</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">Stores</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-1.5">
                  <Link href={cardHref(r)} className="text-slate-100 hover:text-brand-300 hover:underline">
                    {r.name}
                  </Link>{" "}
                  <span className="num text-xs text-slate-500">{r.collectorNumber}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5" style={{ color: rarityInfo(r.rarity).color }}>
                  {rarityInfo(r.rarity).label}
                </td>
                <td className="num whitespace-nowrap px-3 py-1.5 text-right font-semibold text-white">
                  {r.priceCents != null ? formatMoney(r.priceCents, currency) : <span className="font-normal text-slate-600">—</span>}
                </td>
                <td className="num px-4 py-1.5 text-right text-slate-300">{r.stores || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
