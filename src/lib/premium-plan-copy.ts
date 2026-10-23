// What each plan card on /premium says (2026-10-22, owner). DECISIONS.md,
// "/premium shows each plan's real limits".
//
// Every number is a constant the code enforces (lib/alert-limits.ts,
// lib/basket-meter.ts), never typed here. The ORDER follows the market
// (getCountry(), no new geo lookup): US buyers mostly buy singles from big
// marketplaces, so the page leads with what watches prices for them (target
// alerts, the deck price watch, sealed restock/RRP alerts, graded tracking);
// AU/UK/EU/SG/CA buyers split an order over small stores with real postage, so
// it leads with Best Basket's postage-aware cheapest delivered order.
import { PLUS_TARGET_ALERT_LIMIT, SEALED_RRP_MARKETS } from "./alert-limits";
import { FREE_PLANS_PER_MONTH } from "./basket-meter";
import { PLUS_ON_SALE } from "./site";

export const isUsMarket = (market: string | null | undefined) => (market ?? "").toUpperCase() === "US";

// THE ONE-PLAN PITCH (2026-10-23, owner: "make premium more appealing … a
// complete rebrand"). DECISIONS.md, "Premium, rebranded around never overpaying".
// Research (MTGStocks, PriceCharting, MTGGoldfish, Card Ladder): paid tiers that
// sell lead with OUTCOMES (alerts and deals that save money), not a feature list,
// and our own funnel agrees (the sealed-watch gate is the most-clicked paywall).
export const PREMIUM_PROMISE = "Never overpay for Riftbound again";

export function planTagline(tier: "plus" | "premium", _market?: string | null): string {
  if (tier === "plus") return "Watches prices for you, with no ads";
  return PLUS_ON_SALE ? "Everything in Plus, plus the cheapest delivered order" : PREMIUM_PROMISE;
}

export function planBullets(tier: "plus" | "premium", market: string | null | undefined): string[] {
  const us = isUsMarket(market);
  if (tier === "plus") {
    const alerts = `Target-price alerts on up to ${PLUS_TARGET_ALERT_LIMIT} cards`;
    const rest = ["No ads", "Unlimited watchlist and portfolio", "Full Deal Finder and Rising Cards"];
    return us ? [alerts, ...rest] : [...rest, alerts];
  }
  if (!PLUS_ON_SALE) {
    // One plan: the outcomes first, in the order the market buys.
    const alerts = "An email the moment a card or sealed box hits your price";
    const basket = "The cheapest delivered order for any deck or list, every time";
    const deals = "Every deal below market, not just the top 3";
    const collection = "Unlimited watchlist and collection, with full price history";
    const ads = "No ads, anywhere on the site";
    return us ? [alerts, deals, collection, basket, ads] : [basket, alerts, deals, collection, ads];
  }
  const plan = "Store-by-store buying plan, postage included, as often as you like";
  const deck = "Deck price watch: an email when a deck's delivered total drops";
  const unlimited = "Unlimited target alerts and sealed watches";
  const extras = "eBay auction alerts and Demand Finder";
  return us ? [deck, unlimited, extras, plan] : [plan, deck, unlimited, extras];
}

/** The hero subline under /premium's headline, by market. */
export function premiumHeroLine(market: string | null | undefined, plusLive: boolean): string {
  if (isUsMarket(market)) {
    return `Comparing prices is free. ${plusLive ? "Plus and Premium" : "Premium"} watch prices for you: your own target price on a card, sealed restocks and at-RRP alerts (${SEALED_RRP_MARKETS}), graded prices, and with Premium a whole deck's price.`;
  }
  return `Comparing prices is free. Premium works out the cheapest delivered order for your list, store by store with each store's real postage counted. A free account gets ${FREE_PLANS_PER_MONTH} of those plans a month.`;
}
