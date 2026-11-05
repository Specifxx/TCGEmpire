"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Country } from "@/lib/country";
import { useCountry } from "./CountryProvider";

// ONE SERVER-RENDERED BLOCK PER MARKET, THE VISITOR'S SHOWN (2026-11-05,
// DECISIONS.md "The set pages become one CDN copy per URL"). A page the CDN
// keeps as one copy per URL cannot read the visitor on the server, but some of
// its blocks are server components whose output depends on the market and
// cannot move to a client file (eBay search hrefs carry the campaign id the
// browser never sees; a pre-order table reads the sealed loader; the family
// block reads the sisters' feeds). The server draws such a block once for
// every live market and this picks the visitor's after hydration, the baseline
// market's in the HTML: the card page's "computed for all six markets" shape
// for a block, not a number. The blocks are small (a handful of links or
// tiles), so six copies cost less than a request.
//
// The pin: a page that carries `?market=` shows that market whatever the
// cookie says (MarketPinProvider, set by the page); without a provider the
// visitor's market is CountryProvider's, which on a per-request page is the
// server's own answer, so the HTML and the hydrated page agree.
interface MarketPin {
  baseline: Country;
  pinned: boolean;
}

const PinCtx = createContext<MarketPin | null>(null);

export function MarketPinProvider({ baseline, pinned, children }: MarketPin & { children: ReactNode }) {
  return <PinCtx.Provider value={{ baseline, pinned }}>{children}</PinCtx.Provider>;
}

export function MarketSlots({ slots }: { slots: Partial<Record<Country, ReactNode>> }) {
  const { country: visitor } = useCountry();
  const pin = useContext(PinCtx);
  const country = pin?.pinned ? pin.baseline : visitor;
  const fallback = pin?.baseline;
  return <>{slots[country] ?? (fallback ? slots[fallback] : null) ?? null}</>;
}
