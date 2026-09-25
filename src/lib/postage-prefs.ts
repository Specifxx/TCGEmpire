// The buyer's postage choices — delivery region and "tracked postage only" —
// remembered in this browser so Best Basket and the portfolio's replacement
// cost price delivery the same way. localStorage can be missing or throw
// (private windows, blocked site data), so every access is guarded and a
// failure just means "not remembered": the region stays unknown, which prices
// every store at its HIGHEST regional rate (lib/shipping.ts).

export interface PostagePrefs {
  region: string | null; // a SHIPPING_REGIONS key for the market
  trackedOnly: boolean;
}

const regionKey = (market: string) => `rc:postage-region:${market}`;
const TRACKED_KEY = "rc:postage-tracked-only";

export function readPostagePrefs(market: string): PostagePrefs {
  try {
    const ls = window.localStorage;
    return { region: ls.getItem(regionKey(market)) || null, trackedOnly: ls.getItem(TRACKED_KEY) === "1" };
  } catch {
    return { region: null, trackedOnly: false };
  }
}

export function writePostagePrefs(market: string, prefs: PostagePrefs): void {
  try {
    const ls = window.localStorage;
    if (prefs.region) ls.setItem(regionKey(market), prefs.region);
    else ls.removeItem(regionKey(market));
    ls.setItem(TRACKED_KEY, prefs.trackedOnly ? "1" : "0");
  } catch {
    // Not remembered — harmless.
  }
}
