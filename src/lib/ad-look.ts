// The ad-look A/B (owner, 2026-11-18: "all the banner ads … can look more attractive … more decorated and more highlighted so
// people can actually click on them"). Half of the visitors see the sponsored units (the inline eBay / TCGplayer block, the phone
// dock and the leave nudge) in look "b": each brand's own colours, a filled button, a gentle shine on it, a lift on hover; the
// other half keep today's look ("a"). The arm lives in localStorage; storage failure is "a". `<html data-adlook>` carries it for
// the CSS (globals.css, "The ad-look A/B"), and buy_click carries `ad_look` so the read on 2 Dec compares paid clicks per visitor.
// Nothing about a unit's content, placement, timing, label or rules changes: only how it is drawn.
export const AD_LOOK_KEY = "ad-look";

export function adLook(): "a" | "b" {
  try {
    const v = localStorage.getItem(AD_LOOK_KEY);
    if (v === "a" || v === "b") return v;
    const n = Math.random() < 0.5 ? "b" : "a";
    localStorage.setItem(AD_LOOK_KEY, n);
    return n;
  } catch {
    return "a";
  }
}

/** Sets `<html data-adlook>` once a sponsored unit mounts (browser only). */
export function applyAdLook(): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-adlook", adLook());
}

/** The arm for buy_click: "" before any unit has assigned one. */
export function adLookNow(): string {
  try {
    return localStorage.getItem(AD_LOOK_KEY) ?? "";
  } catch {
    return "";
  }
}
