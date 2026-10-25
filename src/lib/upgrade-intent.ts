// UPGRADE-INTENT EVENTS (2026-10-22, owner). DECISIONS.md, "Upgrade-intent events".
//
// Two Vercel Analytics custom events (and GA4, through trackEvent), no
// first-party click table (that stays off):
//   upgrade_dialog_open  the Premium dialog opened, or an inline paywall prompt
//                        (a gate:/limit: PremiumButton, Best Basket's spent
//                        allowance) was shown — once per surface per tab session,
//                        so a page that re-renders cannot flood the event quota
//   upgrade_cta_click    a click through to checkout (the dialog, the /premium
//                        plan cards, the signed-out start link)
// Properties: feature, tier_required, market, signed_in (+ plan, billing_period
// on the click). Never an email, user id or anything else personal.
//
// `feature` comes from the surface vocabulary (lib/premium-surface.ts). The last
// opened feature is remembered for the tab, so a click on /premium after a gate
// sent the visitor there still names that gate's feature.
import { trackEvent } from "./analytics";

export const UPGRADE_FEATURES = [
  "best_basket",
  "bulk_pricer",
  "target_alerts",
  "deal_finder",
  "rising",
  "watchlist_limit",
  "portfolio_limit",
  "set_checklist",
  "sealed_watch",
  "deck_watch",
  "demand_finder",
  "price_history",
  "auction_alerts",
  "other",
] as const;
export type UpgradeFeature = (typeof UPGRADE_FEATURES)[number];

const BY_SURFACE: Record<string, UpgradeFeature> = {
  "limit:basket": "best_basket",
  "tip:basket": "best_basket",
  "gate:best-basket": "best_basket",
  "gate:replacement-plan": "best_basket",
  "limit:bulk": "bulk_pricer",
  "gate:target-limit": "target_alerts",
  "gate:target-alert": "target_alerts",
  "gate:deal-finder": "deal_finder",
  "gate:home-deals": "deal_finder",
  "gate:rising": "rising",
  "gate:home-rising": "rising",
  "limit:watchlist": "watchlist_limit",
  "nudge:watchlist": "watchlist_limit",
  "limit:portfolio": "portfolio_limit",
  "gate:portfolio": "portfolio_limit",
  "nudge:portfolio": "portfolio_limit",
  checklist: "set_checklist",
  "gate:set-checklist": "set_checklist",
  "gate:sealed-watch": "sealed_watch",
  "tip:sealed": "sealed_watch",
  "gate:deck-watch": "deck_watch",
  "gate:demand": "demand_finder",
  "gate:price-history": "price_history",
  "gate:graded-history": "price_history",
  "gate:auction-alerts": "auction_alerts",
};

/** The feature a surface sells, "other" for anything else (nav links, the slide-in…). */
export function featureForSurface(surface: string | null | undefined): UpgradeFeature {
  return (surface && BY_SURFACE[surface]) || "other";
}

/** The lowest tier that unlocks a feature (TIER_COMPARISON's rows). */
export function tierRequiredFor(feature: UpgradeFeature): "plus" | "premium" {
  switch (feature) {
    case "deal_finder":
    case "rising":
    case "target_alerts":
    case "watchlist_limit":
    case "portfolio_limit":
    case "set_checklist":
    case "sealed_watch":
    case "price_history":
      return "plus";
    default:
      return "premium";
  }
}

export interface UpgradeContext {
  feature: UpgradeFeature;
  tier_required: "plus" | "premium";
  market: string;
  signed_in: boolean;
}

export function upgradeContext(surface: string | null | undefined, market: string | null | undefined, signedIn: boolean): UpgradeContext {
  const feature = featureForSurface(surface);
  return { feature, tier_required: tierRequiredFor(feature), market: (market || "unknown").toUpperCase(), signed_in: signedIn };
}

const LAST_KEY = "rc_upgrade_feature";
const SEEN_KEY = "rc_upgrade_seen";

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The dialog opened (always fires) or an inline prompt was shown (`inline`: once per surface per tab). */
export function trackUpgradeOpen(ctx: UpgradeContext, opts: { inline?: boolean; surface?: string } = {}): void {
  const s = session();
  if (opts.inline && s) {
    const key = opts.surface ?? ctx.feature;
    const seen = (s.getItem(SEEN_KEY) ?? "").split(",");
    if (seen.includes(key)) return;
    try {
      s.setItem(SEEN_KEY, [...seen.filter(Boolean), key].slice(-40).join(","));
    } catch {
      /* full or blocked: the event still fires */
    }
  }
  if (!opts.inline && s && ctx.feature !== "other") {
    try {
      s.setItem(LAST_KEY, ctx.feature);
    } catch {
      /* ignore */
    }
  }
  trackEvent("upgrade_dialog_open", { ...ctx });
}

/** The feature this tab last opened an upgrade for, else "other". */
export function lastUpgradeFeature(): UpgradeFeature {
  const v = session()?.getItem(LAST_KEY);
  return (UPGRADE_FEATURES as readonly string[]).includes(v ?? "") ? (v as UpgradeFeature) : "other";
}

/** A click through to checkout. */
export function trackUpgradeCta(ctx: UpgradeContext, plan: "plus" | "premium", billingPeriod: "monthly" | "annual"): void {
  trackEvent("upgrade_cta_click", { ...ctx, plan, billing_period: billingPeriod });
}

/** Read the market cookie (CountryProvider writes it) for components without the context. */
export function marketFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)country=([A-Za-z]{2})/);
  return m ? m[1].toUpperCase() : null;
}
