import type { PremiumTierKey } from "./site";

// The member dashboard's tool list (app/dashboard/page.tsx). A lib module, not
// a const in the page, so tests/premium-tiers.test.ts can run it — a Next.js
// page file may only export its route fields.
//
// `tier` is the MINIMUM tier that opens the WHOLE tool ("free" = every
// account), and it must match the tool's own gate exactly — Best Basket's
// per-store plan and Demand Finder are isPremium(user, "premium"); the full Deal Finder and
// Rising Cards lists are any paid tier. The test checks the pairing against
// TIER_COMPARISON.
//
// `freeTaste` is what an account BELOW that tier can already use (2026-09-25):
// the top 3 of each list, Best Basket's own-list total, and Demand Finder's
// top 10 most searched this week (the /movers strip). Those render as
// OPEN links labelled with exactly that, never as locks — a lock on a tool a
// free account can use hid the free taste the whole funnel depends on. The
// 2026-09-25 lineup dropped the Bulk Pricer, Value Finder, Rising Sealed and
// Condition Calculator entries (each 301s to a free page); Demand Finder left
// with them and came back the same day as a Premium tool.
export type DashTool = { title: string; desc: string; href: string; tier: PremiumTierKey | "free"; freeTaste?: string };

export const DASHBOARD_TOOLS: DashTool[] = [
  {
    title: "Deal Finder",
    desc: "Every card cheaper than TCGplayer market at a real store — narrow it to the cards you watch or own.",
    href: "/tools/deal-finder",
    tier: "plus",
    freeTaste: "Top 3 free",
  },
  {
    title: "Rising Cards",
    desc: "Cards with high or rising demand whose price hasn't moved up yet, each with the reason it ranks.",
    href: "/tools/rising",
    tier: "plus",
    freeTaste: "Top 3 free",
  },
  {
    title: "Best Basket",
    desc: "The cheapest delivered order for a whole list across your country's stores, skipping cards you own.",
    href: "/tools/best-basket",
    tier: "premium",
    freeTaste: "See your total free",
  },
  {
    title: "Demand Finder",
    desc: "The cards players are searching for and opening most, over the last 7 or 30 days.",
    href: "/tools/demand",
    tier: "premium",
    freeTaste: "Top 10 free",
  },
  {
    title: "Watchlist & target alerts",
    desc: "A weekly new-low email for every card you watch. On Plus and Premium, set your own target price.",
    href: "/watching",
    tier: "free",
  },
  {
    title: "Portfolio",
    desc: "Your collection's value, P&L, CSV export and delivered replacement cost.",
    href: "/portfolio",
    tier: "free",
  },
];

/** Does this viewer's tier open the WHOLE tool? Pure. */
export function dashboardToolOpens(toolTier: DashTool["tier"], viewerTier: PremiumTierKey | null): boolean {
  if (toolTier === "free") return true;
  if (toolTier === "plus") return viewerTier != null;
  return viewerTier === "premium";
}
