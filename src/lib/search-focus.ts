// "Put the cursor in the card search box, wherever it currently is."
//
// One shared string and one helper, in their own module so the two sides can
// find each other without either importing the other's component:
//
//   SENDER    components/BottomTabBar.tsx — the phone's Search tab. It is in the
//             root layout, so it renders on every page; importing the 900-line
//             SearchBar just to get a constant would put the whole component in
//             its dependency graph for no reason.
//   RECEIVER  components/SearchBar.tsx — listens for the event and focuses
//             itself IF it is the instance currently on screen. There are 2-3
//             mounted at once (nav desktop, nav mobile, hero) and only one is
//             visible; that check lives there, next to the "/" shortcut which
//             has exactly the same problem to solve.
//
// WHY A WINDOW EVENT rather than a React context. The sender and the receiver
// sit in different branches of the layout tree with no common provider between
// them, and the receiver is whichever of several instances happens to be
// visible — which is a DOM question, not a state question. A context would have
// to hoist a ref registry to the root and keep it in sync with breakpoint
// changes; an event lets each mounted instance answer for itself.

/** The event both halves agree on. A typo in either would silently do nothing. */
export const SEARCH_FOCUS_EVENT = "rc:focus-search";

/**
 * Ask whichever SearchBar is currently on screen to take focus.
 *
 * No-ops during SSR, and no-ops harmlessly if no instance is visible — the
 * caller never needs to know which one answered, or whether one did.
 */
export function focusCardSearch(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SEARCH_FOCUS_EVENT));
}
