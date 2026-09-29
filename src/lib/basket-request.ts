import { DECK_LINE_CAP } from "./deck";
import { parseMinCondition, type MinCondition } from "./basket-condition";
import { RARITY_KEYS } from "./constants";
import { parseScope, type SetScope } from "./set-scope";
import { parseCursor, type SetGapCursor } from "./set-gap";

// What a Best Basket request may send, parsed the same way for every caller.
// Pure (no database), so the tier story can be tested behaviourally: nothing
// here looks at the account. Any signed-in account may send a pasted list, its
// watchlist or its binder, with "skip copies I own"; what the tier decides is
// only the ANSWER — the store-by-store plan needs Premium, everyone else gets
// their own total (app/api/basket/route.ts).

// "set" (2026-09-29, "Finish this set"): the cards the account is MISSING from one
// set, from the set checklist's own catalogue minus what it owns.
export type BasketSourceKind = "deck" | "watchlist" | "binder" | "set";

export interface PickedLine {
  cardId: string;
  qty: number;
}

export interface BasketRequest {
  source: BasketSourceKind;
  skipOwned: boolean;
  text: string;
  picked: PickedLine[];
  // The minimum condition asked for (lib/basket-condition.ts), "any" when the
  // request says nothing so every existing caller prices what it always did.
  // Whether it is HONOURED is the route's call: it is Premium's.
  minCondition: MinCondition;
  // The member changed the switch: remember it (User.basketPrefs).
  saveMinCondition: boolean;
  // The "set" source's own inputs (ignored by every other source): the set's
  // code ("" = none or malformed; the route checks it is a known, released set),
  // which printings count, an optional rarity and per-card price ceiling, and
  // the cursor a later chunk starts strictly after (null = the cheapest end).
  setCode: string;
  scope: SetScope;
  rarity: string | null;
  maxPriceCents: number | null;
  after: SetGapCursor | null;
}

// A pasted or picked quantity, clamped server-side whatever the client sends.
// The binder's own quantities are NOT clamped: they are the copies held,
// priced in full exactly as the portfolio's replacement panel prices them.
export const clampQty = (q: number) => Math.max(1, Math.min(99, Math.round(q)));

export function parseBasketRequest(raw: unknown): BasketRequest {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const source: BasketSourceKind =
    body.source === "watchlist" || body.source === "binder" || body.source === "set" ? body.source : "deck";
  // The binder source prices replacing what you hold, so "skip what you own"
  // would leave nothing — it is ignored there. Finishing a set is the opposite:
  // it prices only what is missing, so skipping copies you own is locked ON.
  const skipOwned = source === "set" ? true : body.skipOwned === true && source !== "binder";
  const text = typeof body.text === "string" ? body.text.slice(0, 20_000) : "";
  const picked: PickedLine[] = Array.isArray(body.lines)
    ? body.lines
        .filter((l: unknown): l is PickedLine => !!l && typeof (l as PickedLine).cardId === "string" && Number.isFinite((l as PickedLine).qty))
        .slice(0, DECK_LINE_CAP)
    : [];
  const setCode = typeof body.set === "string" && /^[A-Za-z0-9]{2,8}$/.test(body.set) ? body.set.toUpperCase() : "";
  const rarity = typeof body.rarity === "string" && RARITY_KEYS.includes(body.rarity) ? body.rarity : null;
  const ceiling = typeof body.maxPriceCents === "number" && Number.isFinite(body.maxPriceCents) ? Math.floor(body.maxPriceCents) : 0;
  return {
    source,
    skipOwned,
    text,
    picked,
    minCondition: parseMinCondition(body.minCondition, "any"),
    saveMinCondition: body.saveMinCondition === true,
    setCode: source === "set" ? setCode : "",
    scope: parseScope(body.scope),
    rarity: source === "set" ? rarity : null,
    maxPriceCents: source === "set" && ceiling > 0 && ceiling <= 10_000_000 ? ceiling : null,
    after: source === "set" ? parseCursor(body.after) : null,
  };
}
