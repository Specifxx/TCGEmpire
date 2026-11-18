// No imports on purpose: the boards are client code (tests/card-isr.test.ts).
/**
 * The "Best price" row treatment (owner, 2026-11-18). The row that carries the cheapest mark is drawn loudly (green edge,
 * green chip) ONLY when it is one of our paid rows: eBay, TCGplayer, or a partner / affiliate link. When it is a plain
 * non-affiliate store it gets a small neutral "Best price" tag, its price stays fully visible, and a one-line note says that
 * prices and stock change and names the marketplace rows that really are on the list. Display only: never a sort, a
 * filter, a badge on a deal, JSON-LD, a feed or an alert, and never a claim that another row is cheaper.
 */

/** A row we are paid for: eBay, TCGplayer, or any affiliate/partner link (`paid`: lib/affiliate `isPaidLink`). */
export function isAffiliateRow(r: { ebay?: boolean; source?: string; paid?: boolean }): boolean {
  return Boolean(r.ebay || r.paid || (r.source ?? "").startsWith("tcgplayer"));
}

/** The loud treatment: a cheapest row that is an affiliate row. */
export const BEST_LOUD = {
  edge: "shadow-[inset_3px_0_0_#16a34a]",
} as const;

export const BEST_TAG_CLASS = {
  /** What an affiliate cheapest row has always worn. */
  loud: "rounded bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300",
  /** A non-affiliate cheapest row: small, neutral, no fill, no green. */
  plain: "rounded border border-ink-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-400",
} as const;

/** The note under a plain "Best price" tag, naming only the rows that exist; null when neither exists. */
export function bestPriceHint(has: { ebay: boolean; tcgplayer: boolean }): string | null {
  const names = [has.ebay ? "eBay" : null, has.tcgplayer ? "TCGplayer" : null].filter(Boolean);
  if (!names.length) return null;
  return `Prices and stock change: also check ${names.join(" and ")}`;
}

/** What a row's cheapest mark looks like: "loud" (affiliate), "plain" (non-affiliate store) or null (not the cheapest). */
export function bestTreatment(isCheapest: boolean, row: { ebay?: boolean; source?: string; paid?: boolean }): "loud" | "plain" | null {
  if (!isCheapest) return null;
  return isAffiliateRow(row) ? "loud" : "plain";
}
