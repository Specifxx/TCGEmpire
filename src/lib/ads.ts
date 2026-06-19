// Ad-network configuration.
//
// Google AdSense has been removed — the site now monetises via HilltopAds. These
// values are PUBLIC by design (they ship in the page HTML).

// ── HilltopAds (display banner only) ────────────────────────────────────────────
// HilltopAds zone loader URLs, loaded site-wide (see HilltopAdsLoader). We keep ONLY
// the low-key display banner: the popunder and mobile pop zones were removed because
// pop/popunder ads bounce first-time visitors and erode trust, which costs more in
// lost organic growth than the low CPM earns on a site this size. The clean,
// on-topic TCGplayer/eBay affiliate banners cover the rest of display monetisation.
//
// NOTE: the remaining "MultiTag" zone can still serve a popup unless that format is
// turned OFF for this zone in the HilltopAds dashboard — disable it there for a
// fully banner-only experience (it can't be controlled from code).
export const HILLTOPADS_ZONES: string[] = [
  // Banner / MultiTag (display).
  "//deliciouslip.com/buX.VwsIdaGXlC0MYuWRcH/oeTm/9BuOZSUoldkqPPT/cgxZNiD/EHzdN/zjMWtNNEziEi0GMkTPMT3gN-wh",
];

// True when at least one zone is configured. Guards the loader.
export const HILLTOPADS_ENABLED = HILLTOPADS_ZONES.length > 0;
