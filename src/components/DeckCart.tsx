import Link from "next/link";
import { buildDeckCart, type DeckCartLine } from "@/lib/deck-basket";
import { formatMoney } from "@/lib/format";
import { COUNTRIES, type Country } from "@/lib/country";
import { OutboundLink } from "@/components/OutboundLink";

// "Build this deck: cheapest whole cart" — the buy list. Runs the landed-cost
// optimiser over every in-stock store listing for the deck's cards and shows
// the cheapest consolidated cart, per store, with direct buy links. Free +
// public (affiliate-monetized). Renders nothing if no cards are buyable yet.
export async function DeckCart({ lines, country }: { lines: DeckCartLine[]; country: Country }) {
  const plan = await buildDeckCart(lines, country);
  if (!plan || plan.stores.length === 0) return null;

  const currency = COUNTRIES[country].currency;
  const fmt = (c: number) => formatMoney(c, currency);

  return (
    <section className="card-surface mt-6 overflow-hidden">
      <div className="border-b border-ink-700 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">Build this deck — cheapest cart</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {plan.matchedCards} cards priced, bought across {plan.storeCount}{" "}
              {plan.storeCount === 1 ? "store" : "stores"} to minimise total delivered cost.
            </p>
          </div>
          <div className="text-right">
            <div className="num text-2xl font-extrabold text-white">{fmt(plan.totalCents)}</div>
            <div className="text-[11px] text-slate-500">
              {fmt(plan.itemsCents)} cards + {fmt(plan.shippingCents)} postage
            </div>
          </div>
        </div>
        {plan.savedCents > 0 && (
          <p className="mt-2 inline-block rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
            Saves {fmt(plan.savedCents)} vs buying each card from its own cheapest store ({plan.naiveStoreCount} stores, more postage)
          </p>
        )}
      </div>

      <div className="divide-y divide-ink-800">
        {plan.stores.map((s) => (
          <div key={s.key} className="p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white">{s.name}</h3>
              <div className="text-right text-xs text-slate-500">
                <span className="num text-slate-300">{fmt(s.subtotalCents)}</span>
                {" + "}
                {s.freeShipping ? (
                  <span className="text-emerald-400">free postage</span>
                ) : (
                  <span className="num">{fmt(s.shippingCents)} postage</span>
                )}
              </div>
            </div>
            <ul className="space-y-1 text-sm">
              {s.lines.map((l, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <OutboundLink
                    href={l.url}
                    retailer={s.key}
                    country={country}
                    className="min-w-0 truncate text-slate-300 hover:text-brand-400"
                  >
                    {l.qty}× {l.name}
                  </OutboundLink>
                  <span className="num shrink-0 text-slate-500">{fmt(l.unitCents * l.qty)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {plan.unbuyable.length > 0 && (
        <div className="border-t border-ink-800 p-4 text-xs text-slate-500">
          Not in stock at a tracked store right now:{" "}
          {plan.unbuyable.map((u, i) => (
            <span key={i}>
              {i > 0 && ", "}
              {u.qty}× {u.name}
            </span>
          ))}
          . <Link href="/browse" className="text-brand-400 hover:underline">Search the database</Link> for other options.
        </div>
      )}
    </section>
  );
}
