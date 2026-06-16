// ── HilltopAds (primary ad network) ────────────────────────────────────────────
// HilltopAds replaces Google AdSense as the primary ad source (AdSense rejected
// the site). This is the MultiTag "zone" loader URL — PUBLIC by design (it ships
// in the page HTML). The live zone is the code default so ads work with no env
// config; override per-deploy with NEXT_PUBLIC_HILLTOPADS_SRC, or set it to "" to
// turn HilltopAds off. Protocol-relative so it inherits the page's https.
export const HILLTOPADS_SRC =
  process.env.NEXT_PUBLIC_HILLTOPADS_SRC ||
  "//deliciouslip.com/buX.VwsIdaGXlC0MYuWRcH/oeTm/9BuOZSUoldkqPPT/cgxZNiD/EHzdN/zjMWtNNEziEi0GMkTPMT3gN-wh";

// Guards the loader so an empty/"" zone ships no script at all.
export const HILLTOPADS_ENABLED = HILLTOPADS_SRC.length > 0;
