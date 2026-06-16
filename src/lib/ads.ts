// Ad-network configuration.
//
// Google AdSense has been removed — the site now monetises via HilltopAds. These
// values are PUBLIC by design (they ship in the page HTML).

// ── HilltopAds (primary ad network) ────────────────────────────────────────────
// HilltopAds zone loader URLs, all loaded site-wide (see HilltopAdsLoader).
// HilltopAds does its own device/geo targeting and per-zone frequency capping, so
// every zone loads on every page and each fills only its eligible traffic (e.g. the
// mobile zone fills on phones). Protocol-relative so they inherit the page's https.
export const HILLTOPADS_ZONES: string[] = [
  // Banner / MultiTag (display + popup).
  "//deliciouslip.com/buX.VwsIdaGXlC0MYuWRcH/oeTm/9BuOZSUoldkqPPT/cgxZNiD/EHzdN/zjMWtNNEziEi0GMkTPMT3gN-wh",
  // Popunder.
  "//pleased-report.com/bs3iVi0CP.3bplvfbbm/V/JQZWDB0A3ZMpT/Qax/NCTDAw5fLuT/c-xwNBDtEI1VM/T/Mn",
  // Mobile.
  "//deliciouslip.com/bcXqVNs.d/G/l/0/YtWdcK/veymD9SuRZrUhl/kwPCTVcexXNjDRE/1hMCTYc-tiNdzMEW0/M/TwULy/MpQG",
];

// True when at least one zone is configured. Guards the loader.
export const HILLTOPADS_ENABLED = HILLTOPADS_ZONES.length > 0;
