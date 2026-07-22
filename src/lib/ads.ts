// Ad-network configuration.
//
// Google AdSense has been removed — the site now monetises via HilltopAds. These
// values are PUBLIC by design (they ship in the page HTML).

// ── HilltopAds (currently OFF) ───────────────────────────────────────────────────
// Turned off entirely: real community feedback flagged ads + the subscription
// pitch + a still-growing marketplace all showing up together as overwhelming/
// hard to trust for a new visitor. The remaining "MultiTag" zone was also
// documented as able to still serve a POPUP unless that format is turned off in
// the HilltopAds dashboard itself (not controllable from code, and not verified
// as actually disabled there) — an unacceptable trust risk on top of the
// feedback already received, so don't take the chance.
//
// Re-enable once (a) the dashboard's popup format is confirmed off, and (b) the
// site has enough of a real, established user base that ads next to it read as
// normal rather than a red flag — by restoring this zone URL to the array:
//   "//deliciouslip.com/buX.VwsIdaGXlC0MYuWRcH/oeTm/9BuOZSUoldkqPPT/cgxZNiD/EHzdN/zjMWtNNEziEi0GMkTPMT3gN-wh"
export const HILLTOPADS_ZONES: string[] = [];

// True when at least one zone is configured. Guards the loader.
export const HILLTOPADS_ENABLED = HILLTOPADS_ZONES.length > 0;
