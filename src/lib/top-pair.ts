import { isPaidLink } from "./affiliate";
import { PAID_ALTERNATIVE_BAND, type PricedRow } from "./paid-alternative";

// The top-pair A/B (owner, 2026-11-19: Amazon clicks rose about tenfold once its row sat in the top three, "now we want to get more
// eBay clicks and … more TCGplayer clicks. And positioning is really important"). On a phone the card page's first screen holds ONE
// buy action: the cheapest listing's (CardTopBuy). When that listing pays nothing, arm "line" keeps today's muted text line naming the
// cheapest paid row within 20% (lib/paid-alternative.ts); arm "pair" shows eBay's and TCGplayer's own cheapest rows instead, as two
// real buttons with their real prices, each within 20% like the line. Same rows as the comparison below, same finish, the
// cheapest keeps "Best price" and its own Buy button, nothing is re-ranked or hidden. localStorage `top-arm`, 50/50; storage that
// fails is "line". buy_click carries `top_arm`; `top_seen` fires once a visit where either arm had something to show, so the read
// (3 Dec) is paid top clicks per visitor who saw one. Roll back: make topArm() return "line"; keep it: return "pair".
export const TOP_ARM_KEY = "top-arm";
export type TopArm = "pair" | "line";

export function topArm(): TopArm {
  try {
    const v = localStorage.getItem(TOP_ARM_KEY);
    if (v === "pair" || v === "line") return v;
    const n: TopArm = Math.random() < 0.5 ? "pair" : "line";
    localStorage.setItem(TOP_ARM_KEY, n);
    return n;
  } catch {
    return "line";
  }
}

/** The arm already given (never assigns one), for buy_click: "" before the card page assigned one. */
export function topArmNow(): string {
  try {
    return localStorage.getItem(TOP_ARM_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * eBay's and TCGplayer's cheapest rows next to an unpaid cheapest row, each within PAID_ALTERNATIVE_BAND of it and of the same
 * finish. `prices` cheapest first (computeMarket). Null when the cheapest already pays or neither marketplace has such a row. Pure.
 */
export function paidPair<T extends PricedRow & { retailer: string }>(
  prices: T[],
  isPaid: (href: string) => boolean = isPaidLink,
): { ebay: T | null; tcg: T | null } | null {
  const best = prices[0];
  if (!best || isPaid(best.buyHref)) return null;
  const ok = (p: T) =>
    isPaid(p.buyHref) && (p.isFoil == null || best.isFoil == null || p.isFoil === best.isFoil) && p.priceCents <= best.priceCents * PAID_ALTERNATIVE_BAND;
  const ebay = prices.find((p) => p.retailer.startsWith("ebay") && ok(p)) ?? null;
  const tcg = prices.find((p) => p.retailer.startsWith("tcgplayer") && ok(p)) ?? null;
  return ebay || tcg ? { ebay, tcg } : null;
}

/** "+5%" beside a pair button; "" when it is the same price. */
export function pctMore(cents: number, bestCents: number): string {
  if (bestCents <= 0 || cents <= bestCents) return "";
  return `+${Math.round(((cents - bestCents) / bestCents) * 100)}%`;
}
