import { DECK_LINE_CAP } from "./deck";

// What a Best Basket request may send, parsed the same way for every caller.
// Pure (no database), so the tier story can be tested behaviourally: nothing
// here looks at the account. Any signed-in account may send a pasted list, its
// watchlist or its binder, with "skip copies I own"; what the tier decides is
// only the ANSWER — the store-by-store plan needs Premium, everyone else gets
// their own total (app/api/basket/route.ts).

export type BasketSourceKind = "deck" | "watchlist" | "binder";

export interface PickedLine {
  cardId: string;
  qty: number;
}

export interface BasketRequest {
  source: BasketSourceKind;
  skipOwned: boolean;
  text: string;
  picked: PickedLine[];
}

// A pasted or picked quantity, clamped server-side whatever the client sends.
// The binder's own quantities are NOT clamped: they are the copies held,
// priced in full exactly as the portfolio's replacement panel prices them.
export const clampQty = (q: number) => Math.max(1, Math.min(99, Math.round(q)));

export function parseBasketRequest(raw: unknown): BasketRequest {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const source: BasketSourceKind = body.source === "watchlist" || body.source === "binder" ? body.source : "deck";
  // The binder source prices replacing what you hold, so "skip what you own"
  // would leave nothing — it is ignored there.
  const skipOwned = body.skipOwned === true && source !== "binder";
  const text = typeof body.text === "string" ? body.text.slice(0, 20_000) : "";
  const picked: PickedLine[] = Array.isArray(body.lines)
    ? body.lines
        .filter((l: unknown): l is PickedLine => !!l && typeof (l as PickedLine).cardId === "string" && Number.isFinite((l as PickedLine).qty))
        .slice(0, DECK_LINE_CAP)
    : [];
  return { source, skipOwned, text, picked };
}
