// The eBay stand-out A/B (owner, 2026-11-19: "the eBay clicks fell … due to the color change … we can do something even more than
// just a color change … make it stand out even more"). Every visitor already gets eBay's blue button (lib/ebay-btn.ts). This test
// asks whether making the eBay row itself stand out wins more eBay clicks: 50/50 in the browser (localStorage `ebay-pop`).
//   "b"   today's look: eBay's blue button, the row like any other.
//   "pop" the same button made bolder and larger with a soft blue halo, and the list row that holds an eBay button tinted eBay blue
//         with a blue edge (globals.css, "The eBay stand-out A/B"). No new words, no new claim: the cheapest row keeps its mark,
//         and eBay is called the cheapest only when it is (ebayIsCheapest). No position change, no extra eBay API call.
// `<html data-ebaypop>` carries the arm for the CSS; buy_click carries `ebay_pop`. Read 3 Dec: eBay buy clicks per arm (50/50, so the
// totals compare directly; total buy clicks per arm checks the split and that the other rows did not just lose what eBay gained).
// Keep it: make ebayPop() return "pop"; drop it: "b".
export const EBAY_POP_KEY = "ebay-pop";

export function ebayPop(): "b" | "pop" {
  try {
    const had = localStorage.getItem(EBAY_POP_KEY);
    if (had === "b" || had === "pop") return had;
    const arm = Math.random() < 0.5 ? "b" : "pop";
    localStorage.setItem(EBAY_POP_KEY, arm);
    return arm;
  } catch {
    return "b";
  }
}

/** Sets `<html data-ebaypop>` (browser only). */
export function applyEbayPop(): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-ebaypop", ebayPop());
}

/** The arm for buy_click: "" before one was assigned. */
export function ebayPopNow(): string {
  try {
    return localStorage.getItem(EBAY_POP_KEY) ?? "";
  } catch {
    return "";
  }
}
