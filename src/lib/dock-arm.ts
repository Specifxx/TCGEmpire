// The dock A/B (owner, 2026-11-18: "right above the nav bar, we should have those ads show up … very, very visible for mobile phone
// users"). Since the phone bottom nav arrived (18 Nov) the eBay/TCGplayer dock and the nav took turns: the dock showed only while the
// visitor scrolled down. In the "on" arm (localStorage `dock-arm`, 50/50) the dock stays up, stacked just above the nav, whenever it
// would show; the "off" arm keeps the old turn-taking. Every buy_click carries `dock_arm`. Read 2 Dec; roll back by making dockArm()
// return "off" (or "on" to keep it). Storage that fails counts as "off".
export const DOCK_ARM_KEY = "dock-arm";

export function dockArm(): "on" | "off" {
  // Ended 2026-11-19 (owner: "I want it for all the sites, so people have an ad on their phone right there"): every visitor gets the
  // "on" arm, the dock stacked above the bottom nav. The key is still written so buy_click's `dock_arm` keeps meaning the same.
  try {
    localStorage.setItem(DOCK_ARM_KEY, "on");
  } catch {
    /* storage refused: still on */
  }
  return "on";
}

/** The arm already given (never assigns one), for analytics. */
export function dockArmNow(): string {
  try {
    return localStorage.getItem(DOCK_ARM_KEY) ?? "";
  } catch {
    return "";
  }
}
