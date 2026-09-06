"use client";

// WHERE THE BUY IS, AND WHETHER IT HAS HAPPENED YET.
//
// buy_click is the event every affiliate dollar depends on, and the signup popup
// is the only thing on the site that can cover it up. This module is the shared
// signal between the two so the popup can stay off the buy path without either
// component hardcoding a list of "pages with buy links" — a list that would rot
// the first time a new surface rendered an OutboundLink.
//
// Two facts, both cheap:
//
//   registerBuyLink()  OutboundLink calls this on mount/unmount, so
//                      buyLinksOnPage() answers "can this visitor buy something
//                      right now?" for whatever page they are on, forever, with
//                      no path list to maintain.
//
//   markBuyClick()     OutboundLink calls this when a buy link is actually
//                      clicked. Buy links open in a NEW TAB (target="_blank"),
//                      so the visitor is still here afterwards, having got
//                      exactly what they came for — which is the best moment on
//                      the site to ask for a signup, and the only one that
//                      cannot cost a buy_click, because the click already
//                      happened.
//
// The flag is per SESSION, matching the popup's own SEEN_KEY: someone who bought
// something this session has cleared the bar for the rest of it.

const BOUGHT_KEY = "rc_bought_this_session";
export const BUY_CLICK_EVENT = "rc:buy_click";

let liveBuyLinks = 0;

/** OutboundLink mount/unmount. Returns the unregister function. */
export function registerBuyLink(): () => void {
  liveBuyLinks += 1;
  return () => {
    liveBuyLinks = Math.max(0, liveBuyLinks - 1);
  };
}

/** Is there anything on this page the visitor could click through and buy? */
export function buyLinksOnPage(): boolean {
  return liveBuyLinks > 0;
}

/** Has this visitor already clicked out to a store this session? */
export function hasBoughtThisSession(): boolean {
  try {
    return sessionStorage.getItem(BOUGHT_KEY) === "1";
  } catch {
    // Private mode: fail to FALSE. The popup treats "unknown" as "not yet
    // bought", which keeps it off the buy path — the safe direction for the
    // metric this whole module exists to protect.
    return false;
  }
}

/** Called from OutboundLink's click handler, after the buy_click event. */
export function markBuyClick(): void {
  try {
    sessionStorage.setItem(BOUGHT_KEY, "1");
  } catch {
    /* private mode — the event below still fires, so the popup still re-arms */
  }
  try {
    window.dispatchEvent(new CustomEvent(BUY_CLICK_EVENT));
  } catch {
    /* non-browser / very old engine — the session flag above still carries it */
  }
}
