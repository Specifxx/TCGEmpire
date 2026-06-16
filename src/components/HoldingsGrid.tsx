import Link from "next/link";
import { formatMoney } from "@/lib/format";
import type { Holding } from "@/lib/premium";

// Visual showcase of a collection: the actual card art, big, in a responsive grid,
// with quantity, live value and profit/loss read straight off each card. Dearest
// first (holdings already arrive sorted), so a collection leads with its best cards.
export function HoldingsGrid({ holdings, currency }: { holdings: Holding[]; currency: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {holdings.map((h, i) => {
        const pl = h.plCents;
        return (
          <Link
            key={`${h.cardId}-${h.condition}-${h.isFoil}-${i}`}
            href={`/card/${h.slug ?? h.cardId}`}
            className="group relative overflow-hidden rounded-xl border border-ink-700 bg-ink-900 transition-all hover:-translate-y-1 hover:border-brand-500 hover:shadow-glow"
          >
            <div className="relative aspect-[5/7]">
              {h.imageThumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.imageThumbUrl} alt={h.name} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-ink-850 text-3xl">🃏</div>
              )}

              {/* quantity + foil badges */}
              {h.quantity > 1 && (
                <span className="absolute right-1.5 top-1.5 rounded-md bg-ink-950/85 px-1.5 py-0.5 text-xs font-extrabold text-white shadow">
                  ×{h.quantity}
                </span>
              )}
              {h.isFoil && (
                <span className="absolute left-1.5 top-1.5 rounded-md bg-gold/85 px-1.5 py-0.5 text-[10px] font-bold text-ink-950 shadow">✦</span>
              )}

              {/* gradient footer with name + value + P&L */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 via-ink-950/85 to-transparent px-2 pb-2 pt-7">
                <div className="truncate text-[11px] font-semibold text-white" title={h.name}>{h.name}</div>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <span className="text-sm font-extrabold text-accent">
                    {h.valueCents > 0 ? formatMoney(h.valueCents, currency) : "—"}
                  </span>
                  {pl != null && (
                    <span className={`rounded px-1 text-[10px] font-bold ${pl >= 0 ? "bg-brand-500/20 text-brand-300" : "bg-rose-500/20 text-rose-300"}`}>
                      {pl >= 0 ? "+" : "−"}{formatMoney(Math.abs(pl), currency)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[9px] text-slate-500">
                  <span>{h.setCode} · {h.collectorNumber}</span>
                  <span>{h.condition}</span>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
