// The sealed page's phone buy bar test (Head of Conversion, 2026-11-27; strategy/marketplace-placement-2026-11-24.html). The card
// page has had a phone buy bar since 2026-09-26 (components/CardMobileBuy.tsx); a sealed product's page has none, so on a phone its
// buy rows scroll away. The question: does a bar on /sealed/<slug> win more paid clicks?
//   "none" today's page: no bar.
//   "bar"  once the price card and the board have scrolled away, "<price> at <store> · Buy →" pins to the foot of the screen
//          (SealedStickyBuyBar in components/SealedProductView.tsx), the market's cheapest in-stock listing, exactly the board's
//          own cheapest row and link, hidden again whenever the board or the price card is on screen.
// Sealed pages on a phone only, in the visitor's own market, never the quick view. 50/50 in the browser (localStorage `bar-test`),
// from BAR_TEST_START (the A/B freeze runs to 2 Dec; the card page's top-pair test is read 3 Dec). Counted through ONE event,
// `bar_test` {k}: "<arm>:seen" once a visit when a phone sealed page is drawn, then "<arm>:paid" / "<arm>:store" on that visit's
// first buy click of each kind on a sealed page (outside the quick view). Read 16 Dec: paid clickers per 100 seen visits, per arm.
// Keep the bar: make barArm() return "bar"; drop it: delete this file and its calls.
import { trackEvent } from "./analytics";

export const BAR_TEST_KEY = "bar-test";
export const BAR_TEST_START = Date.parse("2026-12-03T00:00:00Z");
const SEEN = "bar-test-seen";

export type BarArm = "none" | "bar";

/** This visitor's arm, tossing the coin on first sight. Null: before the start, on a desktop, no storage, or not in a browser. */
export function barArm(now: number = Date.now()): BarArm | null {
  try {
    if (typeof window === "undefined" || now < BAR_TEST_START) return null;
    if (window.matchMedia?.("(min-width: 1024px)").matches) return null;
    let arm = window.localStorage.getItem(BAR_TEST_KEY);
    if (arm !== "none" && arm !== "bar") {
      arm = Math.random() < 0.5 ? "none" : "bar";
      window.localStorage.setItem(BAR_TEST_KEY, arm);
      if (window.localStorage.getItem(BAR_TEST_KEY) !== arm) return null;
    }
    return arm as BarArm;
  } catch {
    return null;
  }
}

/** A phone sealed page was drawn: count the visit once, and return the arm. */
export function barTestSeen(): BarArm | null {
  const arm = barArm();
  if (!arm) return null;
  once(SEEN, () => trackEvent("bar_test", { k: `${arm}:seen` }));
  return arm;
}

/** A buy click (OutboundLink): the visit's first paid and first store click on a sealed page, never in the quick view. */
export function barTestClick(el: Element | null, paid: boolean): void {
  if (!el || el.closest('[role="dialog"]')) return;
  try {
    if (!location.pathname.startsWith("/sealed/") || !sessionStorage.getItem(SEEN)) return;
    const arm = localStorage.getItem(BAR_TEST_KEY);
    if (arm !== "none" && arm !== "bar") return;
    const kind = paid ? "paid" : "store";
    once(`${SEEN}-${kind}`, () => trackEvent("bar_test", { k: `${arm}:${kind}` }));
  } catch {
    return;
  }
}

function once(key: string, send: () => void): void {
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    return;
  }
  send();
}
