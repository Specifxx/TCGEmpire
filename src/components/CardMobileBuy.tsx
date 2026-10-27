"use client";

import { useEffect, useMemo, useState } from "react";
import { useCountry } from "./CountryProvider";
import { OutboundLink } from "./OutboundLink";
import { PriceWatchButton } from "./PriceWatchButton";
import { buyButtonClass } from "./CardMarketSection";
import { computeMarket, type MarketRow } from "@/lib/market-rows";
import { paidAlternative, paidAlternativeName } from "@/lib/paid-alternative";
import { PaidLinkTag } from "./AffiliateDisclosure";

// ─────────────────────────────────────────────────────────────────────────────
// The card page's phone buy path (2026-09-26). At 390px the price comparison
// started ~780px down, below the first screen. Below lg:
//   • CardTopBuy puts the cheapest in-stock listing IN THE VISITOR'S MARKET and
//     its Buy button directly under the card name;
//   • CardStickyBuyBar pins "US$X at {store} → Buy" + the watch heart to the
//     bottom of the screen once that block has scrolled away, and hides again
//     whenever the price comparison itself is on screen.
// Both read computeMarket() — the card page's own cheapest-price function — so
// they can never disagree with the comparison's #1 row.
// ─────────────────────────────────────────────────────────────────────────────

/** Where the sticky bar hides: the comparison list and the top buy block. */
export const PRICE_TABLE_ID = "price-comparison";
const TOP_BUY_ATTR = "data-mobile-price";

function useCheapest(rows: MarketRow[]) {
  const { country, fmt } = useCountry();
  const m = useMemo(() => computeMarket(rows, country), [rows, country]);
  return { country, fmt, best: m.prices[0] ?? null, prices: m.prices };
}

function shortStore(name: string): string {
  return name.length > 22 ? `${name.slice(0, 21)}…` : name;
}

export function CardTopBuy({ rows, displayName }: { rows: MarketRow[]; displayName: string }) {
  const { country, fmt, best, prices } = useCheapest(rows);
  const alt = useMemo(() => paidAlternative(prices), [prices]);
  if (!best) return null;
  return (
    <div {...{ [TOP_BUY_ATTR]: "" }} className="mt-3 rounded-lg border border-brand-500/30 bg-brand-500/[0.06] p-3 lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cheapest</div>
          <div className="num text-lg font-bold text-accent">{fmt(best.priceCents)}</div>
          <div className="truncate text-xs text-slate-400">
            at {best.retailerName}
            {best.ship == null ? " · + postage" : best.ship === 0 ? " · free postage" : ` · + ${fmt(best.ship)} postage`}
          </div>
        </div>
        <OutboundLink
          href={best.buyHref}
          retailer={best.retailer}
          country={country}
          cardName={displayName}
          price={best.priceCents / 100}
          positionInList={1}
          pageType="card_detail"
          inStock
          variant={best.isFoil ? "foil" : "nonfoil"}
          condition={best.condition}
          surface="card_top_buy"
          className={`${buyButtonClass(best.retailer)} shrink-0 justify-center`}
        >
          Buy →
        </OutboundLink>
      </div>
      {/* The cheapest paid marketplace within 20% when the cheapest row is a
          store that pays nothing (lib/paid-alternative.ts): a real row of the
          comparison below, its real price and how much more it is. */}
      {alt && (
        <div className="mt-2 flex items-center gap-2 border-t border-ink-700/60 pt-1 text-xs text-slate-400">
          <OutboundLink
            href={alt.row.buyHref}
            retailer={alt.row.retailer}
            country={country}
            cardName={displayName}
            price={alt.row.priceCents / 100}
            positionInList={prices.indexOf(alt.row) + 1}
            pageType="card_detail"
            inStock
            variant={alt.row.isFoil ? "foil" : "nonfoil"}
            condition={alt.row.condition}
            surface="card_top_alt"
            className="block min-w-0 flex-1 truncate py-2 font-semibold text-brand-300 hover:underline"
          >
            or <span className="num">{fmt(alt.row.priceCents)}</span> on {paidAlternativeName(alt.row.retailer, alt.row.retailerName)}
            {alt.pctMore > 0 ? ` (+${alt.pctMore}%)` : ""} →
          </OutboundLink>
          <PaidLinkTag className="shrink-0" />
        </div>
      )}
    </div>
  );
}

export function CardStickyBuyBar({
  rows,
  displayName,
  cardId,
}: {
  rows: MarketRow[];
  displayName: string;
  cardId: string;
}) {
  const { country, fmt, best } = useCheapest(rows);
  // Starts hidden: on first paint the top buy block is on screen.
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!best) return;
    const table = document.getElementById(PRICE_TABLE_ID);
    const top = document.querySelector(`[${TOP_BUY_ATTR}]`);
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target, e.isIntersecting);
      // Hidden while the comparison is on screen, and while the top block is.
      setShow(![...seen.values()].some(Boolean));
    });
    for (const el of [table, top]) if (el) io.observe(el);
    return () => io.disconnect();
  }, [best]);

  // Lift the corner launchers (.above-bottombar) clear of the bar while it shows.
  useEffect(() => {
    if (!show) return;
    document.body.setAttribute("data-rc-buybar", "");
    return () => document.body.removeAttribute("data-rc-buybar");
  }, [show]);

  if (!best) return null;
  return (
    <div
      aria-hidden={!show}
      className={`buybar fixed inset-x-0 z-40 border-t border-ink-700 bg-ink-950/95 px-4 py-2 backdrop-blur transition-transform duration-200 lg:hidden ${
        show ? "translate-y-0" : "pointer-events-none translate-y-[120%]"
      }`}
    >
      <div className="mx-auto flex max-w-xl items-center gap-2">
        <div className="min-w-0 flex-1 text-sm">
          <span className="num font-bold text-white">{fmt(best.priceCents)}</span>
          <span className="text-slate-400"> at {shortStore(best.retailerName)}</span>
        </div>
        <PriceWatchButton cardId={cardId} variant="icon" />
        <OutboundLink
          href={best.buyHref}
          retailer={best.retailer}
          country={country}
          cardName={displayName}
          price={best.priceCents / 100}
          positionInList={1}
          pageType="card_detail"
          inStock
          variant={best.isFoil ? "foil" : "nonfoil"}
          condition={best.condition}
          surface="sticky_buy_bar"
          className={`${buyButtonClass(best.retailer)} shrink-0 justify-center`}
        >
          Buy →
        </OutboundLink>
      </div>
    </div>
  );
}
