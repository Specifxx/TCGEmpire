// The phone bottom nav's decisions (components/BottomNav.tsx draws it). Pure, so the tests run them without React.

export type BottomNavMode = "off" | "optin" | "on";

export interface BottomNavState {
  narrow: boolean;
  scrollY: number;
  /** The scroll direction as last settled: "up", "down", or "" before the visitor has moved. */
  dir: "up" | "down" | "";
  zoomed: boolean;
  typing: boolean;
  modal: boolean;
  buybar: boolean;
  /** An Add to cart button is inside the strip the bar would cover. */
  covers: boolean;
  enabled: boolean;
}

/** The scroll distance below which the bar always shows (the top of a page). */
export const NAV_TOP = 80;
/** The least a scroll must move, in px, to flip the direction (finger jitter and iOS rubber-banding never flip it). Down is slower to
 *  decide than up: showing the bar on the first real upward flick is what makes it feel immediate. */
export const NAV_DELTA = 10;
export const NAV_DELTA_UP = 4;
/** The bar's height above the safe area. */
export const NAV_H = 56;
/** The localStorage key that keeps a visitor's ?bn= choice. */
export const OPT_KEY = "bn";

/** Whether the bar shows. Pure, for the tests. */
export function bottomNavShows(s: BottomNavState): boolean {
  if (!s.enabled || !s.narrow || s.zoomed || s.typing || s.modal || s.buybar || s.covers) return false;
  if (s.scrollY < NAV_TOP) return true;
  return s.dir === "up";
}

/** The next scroll direction given the last settled one, where the scroll was, and where it is now. Pure, for the tests. */
export function nextDir(dir: "up" | "down" | "", anchor: number, y: number): { dir: "up" | "down" | ""; anchor: number } {
  // The anchor is the scroll position the direction was last decided at: it follows the page while the direction holds and stays
  // put until the page has moved NAV_DELTA the other way.
  if (y > anchor + NAV_DELTA) return { dir: "down", anchor: y };
  if (y < anchor - NAV_DELTA_UP) return { dir: "up", anchor: y };
  if (dir === "down" && y > anchor) return { dir, anchor: y };
  if (dir === "up" && y < anchor) return { dir, anchor: y };
  return { dir, anchor };
}

/** Whether the visitor has the bar: the site's mode, then `?bn=` (1 keeps it, 0 clears it), then what they kept. */
export function bottomNavEnabled(mode: BottomNavMode, search: string, stored: string | null): { enabled: boolean; store: "1" | "0" | null } {
  if (mode === "off") return { enabled: false, store: null };
  const q = new URLSearchParams(search).get("bn");
  if (q === "1") return { enabled: true, store: "1" };
  if (q === "0") return { enabled: false, store: "0" };
  if (mode === "on") return { enabled: stored !== "0", store: null };
  return { enabled: stored === "1", store: null };
}

/** Whether a tab is the page the visitor is on: its own path or one under it, or one of its `also` paths. */
export function isActivePath(pathname: string, href: string, also: string[] = []): boolean {
  const under = (p: string) => pathname === p || (p !== "/" && pathname.startsWith(p + "/"));
  return under(href) || also.some(under);
}
