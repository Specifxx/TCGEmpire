"use client";

import { useCountry } from "./CountryProvider";
import { OutboundLink } from "./OutboundLink";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { formatMoney } from "@/lib/format";
import { convertUsdCents } from "@/lib/fx";

// TCGplayer MARKET PRICE, converted into the visitor's currency — a reference anchor
// shown on every card that TCGplayer prices, ESPECIALLY the low-data ones with no
// local store listings yet. TCGplayer publishes a single USD "market price" (the
// English fair-market value); that USD figure is already serialized onto every card
// page (the US row in the market data), so this component just converts it to the
// active market's currency client-side and links to the product via our affiliate
// deep link. Works for Australia too: the market price is a REFERENCE, not a buyable
// AU listing, so it's shown even though TCGplayer doesn't ship here — hence the
// explicit caveat and the "check on TCGplayer" framing rather than "buy".
//
// Client component so it localizes after hydration (identical pattern to
// CardPriceMetrics) without reading cookies server-side — the card page stays ISR.
export function TcgMarketPrice({
  usdCents,
  usdCentsFoil,
  href,
  // Defaults ON — an affiliate link must never render without a visible
  // disclosure beside it. Pass false ONLY where a caller renders its own
  // adjacent disclosure covering this block (see CardMarketSection).
  disclosure = true,
}: {
  usdCents: number | null; // standard (non-foil) TCGplayer market price, USD cents
  usdCentsFoil: number | null; // foil market price, USD cents (if the card has a foil)
  href: string | null; // affiliate-wrapped TCGplayer product URL
  disclosure?: boolean;
}) {
  const { country, currency: cur } = useCountry();
  if (usdCents == null && usdCentsFoil == null) return null;

  // Convert the USD market price into the visitor's DISPLAY currency (EUR for a
  // European shopper browsing the UK market, otherwise the market's own currency);
  // keep the original USD alongside it for honesty. (The parent only renders this
  // block in markets where TCGplayer isn't natively listed — AU/NZ — so the
  // currency is never USD here.)
  const local = (usd: number | null) => (usd == null ? null : convertUsdCents(usd, cur));
  const std = local(usdCents);
  const foil = local(usdCentsFoil);

  return (
    <div className="card-surface mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">TCGplayer market price</span>
          <span className="chip bg-ink-800 text-[11px] text-slate-400">reference</span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {std != null && (
            <span className="num text-2xl font-extrabold text-accent">
              {formatMoney(std, cur)}
              {usdCents != null && (
                <span className="ml-1.5 align-middle text-xs font-medium text-slate-500">
                  ≈ {formatMoney(usdCents, "USD")}
                </span>
              )}
            </span>
          )}
          {foil != null && (
            <span className="num text-sm font-bold text-gold">
              ✦ Foil {formatMoney(foil, cur)}
              {usdCentsFoil != null && (
                <span className="ml-1 text-[11px] font-medium text-slate-500">≈ {formatMoney(usdCentsFoil, "USD")}</span>
              )}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          TCGplayer&apos;s US market price, converted to {cur} at an approximate rate. A reference value —
          TCGplayer may not ship to your country.
        </p>
        {href && disclosure && <AffiliateDisclosure partner="tcgplayer" tight />}
      </div>
      {href && (
        <OutboundLink
          href={href}
          retailer="tcgplayer"
          country={country}
          className="btn-primary shrink-0 text-sm"
        >
          Check on TCGplayer →
        </OutboundLink>
      )}
    </div>
  );
}
