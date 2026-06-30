import { formatMoney } from "@/lib/format";
import type { Holding } from "@/lib/premium";
import { CardQuickLink } from "./CardQuickLink";

// Visual showcase of a collection: the actual card art, big, in a responsive grid,
// with quantity, live value and profit/loss read straight off each card. Dearest
// first (holdings already arrive sorted), so a collection leads with its best cards.
export function HoldingsGrid({ holdings, currency }: { holdings: Holding[]; currency: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {holdings.map((h, i) => {
        const pl = h.plCents;
        return (
          <CardQuickLink
            key={`${h.cardId}-${h.condition}-${h.isFoil}-${i}`}
            card={h.card}
            className="group relative block overflow-hidden rounded-lg border border-ink-700 bg-ink-900 transition-colors hover:border-ink-600"
          >
            <div className="relative aspect-[5/7]">
              {h.imageThumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.imageThumbUrl} alt={h.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-ink-850 text-xs text-slate-600">No image</div>
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
                  <span className="num text-sm font-extrabold text-accent">
                    {h.valueCents > 0 ? formatMoney(h.valueCents, currency) : "—"}
                  </span>
                  {pl != null && (
                    <span className={`num rounded px-1 text-[10px] font-bold ${pl >= 0 ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
                      {pl >= 0 ? "+" : "−"}{formatMoney(Math.abs(pl), currency)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[9px] text-slate-500">
                  <span className="num">{h.setCode} · {h.collectorNumber}</span>
                  <span>{h.condition}</span>
                </div>
              </div>
            </div>
          </CardQuickLink>
        );
      })}
    </div>
  );
}
