"use client";

import { OutboundLink } from "./OutboundLink";
import { formatMoney } from "@/lib/format";

// Cardmarket reference price — the UK/EU counterpart to TcgMarketPrice.tsx. See
// lib/cardmarket.ts's header for the full sourcing story: this reads Cardmarket's
// own public price-guide "LOW" figure, which is a marketplace-wide aggregate
// across every seller of that exact print, not a single verified in-stock
// listing — so, like TCGplayer's market price, it is deliberately excluded from
// the buyable comparison table (ALL_FALLBACK_RETAILERS in lib/constants.ts) and
// shown here instead, clearly labelled as a reference.
//
// UNLIKE TcgMarketPrice, no currency conversion happens in this component: the
// UK row is already converted to GBP and the EU row is already native EUR at
// write time (see buildCardmarketRows in lib/cardmarket.ts), so this just
// formats whatever it's given.
export function CardmarketPrice({
  priceCents,
  currency,
  href,
  isEu,
}: {
  priceCents: number;
  currency: string;
  href: string | null;
  /** EU rows are Cardmarket's native price; UK rows are EUR converted to GBP. */
  isEu: boolean;
}) {
  return (
    <div className="card-surface mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">Cardmarket price</span>
          <span className="chip bg-ink-800 text-[11px] text-slate-400">reference</span>
        </div>
        <div className="mt-1">
          <span className="num text-2xl font-extrabold text-accent">{formatMoney(priceCents, currency)}</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          {isEu
            ? "Cardmarket's lowest listed EU marketplace price for this card."
            : "Cardmarket's lowest listed EU marketplace price, converted to GBP."}{" "}
          A reference value across every seller of this print — not a single verified listing.
        </p>
      </div>
      {href && (
        <OutboundLink
          href={href}
          retailer={isEu ? "cardmarket_eu" : "cardmarket"}
          country={isEu ? "EU" : "UK"}
          className="btn-primary shrink-0 text-sm"
        >
          Check on Cardmarket →
        </OutboundLink>
      )}
    </div>
  );
}
