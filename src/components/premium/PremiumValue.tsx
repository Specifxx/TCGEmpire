import Link from "next/link";
import { formatMoney } from "@/lib/format";
import type { Deal } from "@/lib/top-deals";
import { FREE_PLANS_PER_MONTH } from "@/lib/basket-meter";
import { FREE_HISTORY_DAYS } from "@/lib/history-access";

import { SEALED_RRP_MARKETS } from "@/lib/alert-limits";

// /premium's value section (2026-10-23, owner: "make premium more appealing …
// a complete rebrand"). DECISIONS.md, "Premium, rebranded around never
// overpaying".
//
// WHAT THE RESEARCH SAID, AND WHAT THIS DOES WITH IT. Paid tiers that sell at
// MTGStocks, PriceCharting and MTGGoldfish lead with outcomes that save money
// (alerts, deals) and prove it with live numbers; our own funnel showed ~480
// Premium clicks in eight weeks reaching checkout ~8% of the time, so the page,
// not the traffic, was the leak. So: four outcomes, each with a LIVE example
// from today's data, and a proof strip of real counts.
//
// EVERY NUMBER IS REAL AND LIVE: store and listing counts from getHomeStats(),
// deals and their summed gap from getCachedTopDeals() (both already cached for
// the homepage; nothing new reads the database). A figure that is zero or
// missing is left out, never shown as 0 or rounded up. No testimonials, member
// counts or savings claims that aren't on the board right now.

export interface PremiumProof {
  stores: number | null;
  listings: number | null;
  dealsBelowMarket: number;
  dealsGapCents: number;
  topDeal: Deal | null;
  currency: string;
}

export function PremiumProofStrip({ proof }: { proof: PremiumProof }) {
  const items = [
    proof.stores ? `${proof.stores.toLocaleString()} stores watched` : null,
    proof.listings ? `${proof.listings.toLocaleString()} live listings` : null,
    "Prices refreshed twice a day",
    proof.dealsBelowMarket > 0 ? `${proof.dealsBelowMarket} cards below market right now` : null,
  ].filter(Boolean) as string[];
  return (
    <ul className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[12px] font-semibold text-slate-300 sm:text-sm" data-premium-proof>
      {items.map((t) => (
        <li key={t} className="flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-up" />
          {t}
        </li>
      ))}
    </ul>
  );
}

type Benefit = { icon: string; title: string; body: string; example?: React.ReactNode; free: string };

export function PremiumBenefits({ proof, us }: { proof: PremiumProof; us: boolean }) {
  const deal = proof.topDeal;
  const fmt = (c: number) => formatMoney(c, proof.currency);
  const alerts: Benefit = {
    icon: "🔔",
    title: "Get told the moment it's cheaper",
    body: `Set the price you'd pay on any card. Watch a sealed box for restocks and at-RRP drops (${SEALED_RRP_MARKETS}). Follow eBay auctions ending on cards you want. We email you as soon as it happens.`,
    free: "Free: 1 card and 1 sealed product",
  };
  const basket: Benefit = {
    icon: "🧺",
    title: "Buy the whole deck for less",
    body: "Paste a deck or a list and get the cheapest delivered order across every store, with each store's real postage counted, plus the best one-store and two-store options.",
    free: `Free: ${FREE_PLANS_PER_MONTH} plans a month`,
  };
  const deals: Benefit = {
    icon: "🏷️",
    title: "See every deal, not just three",
    body: "Every card listed below its market price, the cards rising fastest, and what players are searching for, filtered to the cards you watch or own.",
    example:
      deal && deal.pctLabel ? (
        <p className="mt-2 rounded-lg border border-up/30 bg-up/10 px-2.5 py-1.5 text-xs text-slate-200" data-premium-live-deal>
          <span className="font-bold text-up">Live now:</span> {deal.title} at {fmt(deal.priceCents)}, {deal.pctLabel}% below market
          {proof.dealsBelowMarket > 1 ? ` — one of ${proof.dealsBelowMarket} on the board` : ""}.
        </p>
      ) : null,
    free: "Free: the top 3",
  };
  const collection: Benefit = {
    icon: "📈",
    title: "Track everything you own",
    body: "An unlimited watchlist and collection, every day of price history with CSV export, graded prices, and a set checklist that fits whole sets. No ads anywhere.",
    free: `Free: unlimited watchlist and portfolio, ${FREE_HISTORY_DAYS} days of history`,
  };
  const order = us ? [alerts, deals, collection, basket] : [basket, alerts, deals, collection];
  return (
    <section aria-labelledby="premium-benefits" className="mx-auto mt-10 max-w-4xl">
      <h2 id="premium-benefits" className="text-center font-display text-xl font-extrabold text-white sm:text-2xl">
        What Pro does for you
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {order.map((b) => (
          <div key={b.title} className="card-surface rounded-2xl border border-ink-700 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-xl">{b.icon}</span>
              <h3 className="text-base font-extrabold text-white">{b.title}</h3>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{b.body}</p>
            {b.example}
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{b.free}</p>
          </div>
        ))}
      </div>
      {proof.dealsGapCents > 0 && proof.dealsBelowMarket > 0 && (
        <p className="mt-4 text-center text-sm text-slate-300" data-premium-gap>
          Right now the {proof.dealsBelowMarket} below-market cards on the board add up to{" "}
          <strong className="text-white">{fmt(proof.dealsGapCents)}</strong> under their market prices.{" "}
          <Link href="/tools/deal-finder" className="text-brand-400 hover:underline">
            See the top 3 free →
          </Link>
        </p>
      )}
    </section>
  );
}
