"use client";

import { formatMoney } from "@/lib/format";
import type { SealedGroup } from "@/lib/sealed-import";
import { useSealedQuickView } from "./SealedQuickView";

// A single compact sealed-product tile for the /sealed grid — the RiftCompare twin
// of DexCompare's SealedTile. RiftCompare has no /sealed/<slug> detail page, so the
// tile is a button that opens the quick-view popup in place (no navigation). Images
// come from arbitrary store/eBay CDNs, so a plain lazy <img> is used rather than
// next/image (which would need every host allow-listed).
export function SealedTile({ group, currency }: { group: SealedGroup; currency: string }) {
  const g = group;
  const soldOut = g.lowestPriceCents == null;
  const { open } = useSealedQuickView();
  const fmt = (cents: number) => formatMoney(cents, currency);

  return (
    <button
      type="button"
      onClick={() => open(g, currency)}
      className="cv-auto group card-surface relative flex flex-col overflow-hidden text-left transition-colors hover:border-ink-600"
    >
      <div className="relative grid aspect-square w-full place-items-center overflow-hidden bg-ink-950 p-4">
        {g.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={g.imageUrl}
            alt={g.name}
            loading="lazy"
            decoding="async"
            className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="px-2 text-center text-sm font-bold text-slate-600">{g.productType}</span>
        )}
        <span className="absolute left-2 top-2 chip bg-ink-950/70 text-[10px] font-semibold text-slate-300">
          {g.productType}
        </span>
        {soldOut && (
          <span className="absolute right-2 top-2 chip bg-rose-500/15 text-[10px] font-semibold text-rose-300">
            Sold out
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 border-t border-ink-800 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white" title={g.name}>
          {g.name}
        </h3>
        {g.setCode && <p className="text-xs text-slate-500">{g.setCode}</p>}

        {/* Availability-at-MSRP signal (A4) — the buy signal Riftbound buyers scan for. */}
        {!soldOut && g.msrpCents != null && (
          g.atMsrp ? (
            <span className="chip w-fit bg-emerald-500/15 text-[10px] font-semibold text-emerald-400">✓ At MSRP</span>
          ) : g.overMsrpPct != null && g.overMsrpPct > 0 ? (
            <span className="chip w-fit bg-red-500/15 text-[10px] font-semibold text-red-400">
              {Math.round(g.overMsrpPct)}% over MSRP
            </span>
          ) : null
        )}

        <div className="mt-auto flex items-end justify-between pt-1">
          <div>
            {soldOut ? (
              <div className="text-sm font-medium text-slate-500">Currently unavailable</div>
            ) : (
              <>
                <div className="text-[11px] text-slate-500">from</div>
                <div className="num text-lg font-bold text-accent">{fmt(g.lowestPriceCents as number)}</div>
              </>
            )}
          </div>
          {g.storeCount > 0 && (
            <div className="text-right text-[11px] font-semibold text-brand-400">
              <span className="num">{g.storeCount}</span> {g.storeCount === 1 ? "store" : "stores"}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
