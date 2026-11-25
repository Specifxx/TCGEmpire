// The eBay-button A/B (owner, 2026-11-19: "we want to get more eBay clicks … positioning, … making them visible"). eBay buy clicks
// per visitor fell 31-60% across Dex, Rift and OP in the week after 12 Nov, when the calmer palette (DECISIONS.md 2026-11-12) gave
// the pinned eBay row the same filled button as the best store, while TCGplayer's row kept its own colour and its clicks rose.
// The calm-palette entry said: if the pinned eBay row's clicks fall, strengthen its button before bringing any outline back.
// So, 50/50 in the browser (localStorage `ebay-btn`): arm "b" draws every eBay link that wears the site's filled button
// (`a[data-ebay].btn-primary`) in eBay's own blue with white ink (globals.css, "The eBay-button A/B"); arm "a" keeps today's.
// Nothing else changes: no outline, no tint, no position, no label, the cheapest keeps its mark. `<html data-ebaybtn>` carries the
// arm for the CSS, buy_click carries `ebay_btn`. Read 3 Dec: eBay buy clicks per arm (the split is 50/50, so the arms' totals
// compare directly; total buy clicks per arm is the check that the split is even). Keep it: make ebayBtn() return "b"; drop it: "a".
export const EBAY_BTN_KEY = "ebay-btn";

export function ebayBtn(): "a" | "b" {
  // Ended 2026-11-19, the same day (owner: "our eBay clicks have still stagnated … I really need to increase it"): every visitor gets
  // arm "b", eBay's own blue, as every other site's eBay button now does. The key is still written so `ebay_btn` keeps its meaning.
  try {
    localStorage.setItem(EBAY_BTN_KEY, "b");
  } catch {
    /* storage refused: still b */
  }
  return "b";
}

/** Sets `<html data-ebaybtn>` (browser only). */
export function applyEbayBtn(): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-ebaybtn", ebayBtn());
}

/** The arm for buy_click: "" before one was assigned. */
export function ebayBtnNow(): string {
  try {
    return localStorage.getItem(EBAY_BTN_KEY) ?? "";
  } catch {
    return "";
  }
}
