// The trade gremlin — a funny, protective verdict on a trade's fairness. Computed
// from the two sides' adjusted values; reacts live as the user tweaks the trade.
// Shared by the calculator (instant, free) and the optional LLM "roast" endpoint.
import { formatMoney } from "./format";

// Every currency the trade calculator can show, i.e. what /api/trade-roast must
// accept. It lives here rather than in the route because a Next route file may
// only export its handlers. The route's enum was ["AUD","NZD","USD","GBP"] until
// 2026-09-25, so a CA, SG or EU visitor (and a UK visitor shown EUR) got a 400
// and "Roast this trade" silently did nothing. tests/card-og-price.test.ts
// checks every COUNTRIES[*].currency is listed. NZD stays: retired markets'
// cookies can still send it, and formatMoney handles it via its "$" fallback.
export const TRADE_CURRENCIES = ["AUD", "USD", "GBP", "CAD", "EUR", "SGD", "NZD"] as const;

export type TradeTone = "donation" | "fair" | "robbed" | "winning";
export type TradeVerdict = { tone: TradeTone; line: string };

// `giveCents` = value you're handing over; `getCents` = value you're receiving.
export function tradeGremlin(giveCents: number, getCents: number, currency: string): TradeVerdict | null {
  const give = Math.max(0, Math.round(giveCents));
  const get = Math.max(0, Math.round(getCents));
  if (give <= 0 && get <= 0) return null;

  // One side empty = not really a trade.
  if (give <= 0 || get <= 0) {
    return {
      tone: "donation",
      line: "One side's empty — that's not a trade, that's a charity donation. Load up the other column, champ.",
    };
  }

  const gap = get - give; // positive = you're up
  const base = Math.max(give, get);
  const gapPct = base > 0 ? (Math.abs(gap) / base) * 100 : 0;
  const amt = formatMoney(Math.abs(gap), currency);

  if (gapPct < 7) {
    return {
      tone: "fair",
      line: `Basically even — only ${amt} apart. The gremlin smells no blood here. Fair trade, shake on it. 🤝`,
    };
  }

  if (gap < 0) {
    // You're giving more than you get — defend "my boy".
    return gapPct >= 20
      ? { tone: "robbed", line: `WHOA. Are they trying to scam my boy?? You're ${amt} in the hole on this one. Walk away, or make 'em sweeten the pot. 🚨` }
      : { tone: "robbed", line: `Hold up — you're handing over ${amt} more than you're getting back. Not quite a robbery, but the gremlin's raising an eyebrow. Push for a little extra.` };
  }

  // You're getting more than you give — gleeful.
  return gapPct >= 20
    ? { tone: "winning", line: `Highway robbery and the gremlin is THRIVING — you're ${amt} up. Shake hands before they find a calculator. 💰` }
    : { tone: "winning", line: `You're coming out ${amt} ahead. Tidy little edge — nod, smile, and don't make it weird.` };
}
