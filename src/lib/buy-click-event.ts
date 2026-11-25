// The window event OutboundLink fires after a buy click that names a card, so an in-page
// component (BuyFollowUp on the card page) can follow up without any server read.
export const BUY_CLICK_EVENT = "rc:buy-click";
export interface BuyClickDetail {
  cardId: string;
}
export function announceBuyClick(cardId: string | undefined): void {
  if (!cardId || typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent<BuyClickDetail>(BUY_CLICK_EVENT, { detail: { cardId } }));
  } catch {
    /* best effort */
  }
}
