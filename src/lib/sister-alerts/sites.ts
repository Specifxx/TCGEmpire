// THE SITES THE SHARED ALERT SERVICE WORKS FOR (2026-11-02, owner: "Yes, one
// shared service"). Each one shows an "Email me when it drops below" form that
// posts here, and publishes its own lowest prices as a static file,
// `<url>/alert-feed.json` (format in ./feed.ts), built by the site from the
// same loaders its pages read. The daily check fetches that file from the
// site's CDN: no sister database, repo token or data branch is read.
//
// Not here, on purpose: RiftCompare itself and OP Compare (their own account
// alerts), CamCompare and Compare Empire (their own alert tables), KaeYoung (left out, owner
// 2026-11-02, unless the owner asks).

export type SisterAlertSiteKey = "dex" | "mtg" | "gundam" | "lorcana" | "ygo" | "cyberpunk" | "bandai" | "wargame" | "figure";
export type SisterGroup = "cards" | "hobby";

export interface SisterAlertSite {
  key: SisterAlertSiteKey;
  name: string;
  /** Canonical origin, no trailing slash. */
  url: string;
  /** Which sites' deals an alert email may end with: one of the same group. */
  group: SisterGroup;
  /** Brand colour for the email's buttons. */
  color: string;
}

export const SISTER_ALERT_SITES: SisterAlertSite[] = [
  { key: "dex", name: "DexCompare", url: "https://dexcompare.app", group: "cards", color: "#e3350d" },
  { key: "mtg", name: "MTG Compare", url: "https://mtgcompare.app", group: "cards", color: "#7c3aed" },
  { key: "gundam", name: "Gundam Compare", url: "https://gundamcompare.com", group: "cards", color: "#1d4ed8" },
  { key: "lorcana", name: "Lorcana Compare", url: "https://lorcanacompare.com", group: "cards", color: "#6d28d9" },
  { key: "ygo", name: "YGO Compare", url: "https://ygocompare.com", group: "cards", color: "#b45309" },
  { key: "cyberpunk", name: "Cyberpunk Compare", url: "https://cyberpunkcompare.com", group: "cards", color: "#0891b2" },
  { key: "bandai", name: "BandaiCompare", url: "https://bandaicompare.com", group: "cards", color: "#ff6a00" },
  { key: "wargame", name: "WargameCompare", url: "https://wargamecompare.com", group: "hobby", color: "#b91c1c" },
  { key: "figure", name: "FigureCompare", url: "https://figurecompare.com", group: "hobby", color: "#dc2626" },
];

export const SISTER_ALERT_KEYS = SISTER_ALERT_SITES.map((s) => s.key) as [SisterAlertSiteKey, ...SisterAlertSiteKey[]];

export function sisterSite(key: string): SisterAlertSite | null {
  return SISTER_ALERT_SITES.find((s) => s.key === key) ?? null;
}

/** Every region any sister site prices in; the feed decides which a product has. */
export const SISTER_REGIONS = ["US", "UK", "CA", "AU", "NZ", "EU", "SG"] as const;
export type SisterRegion = (typeof SISTER_REGIONS)[number];

export const REGION_CURRENCY: Record<SisterRegion, string> = { US: "USD", UK: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD", EU: "EUR", SG: "SGD" };

/**
 * The origins allowed to call the signup API from a browser: each site's
 * canonical origin and its www/apex twin, nothing else (no wildcard, no
 * preview hosts: previews are off on every site).
 */
export function allowedOrigin(origin: string | null): SisterAlertSite | null {
  if (!origin) return null;
  let host: string;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" || u.port) return null;
    host = u.hostname.toLowerCase();
  } catch {
    return null;
  }
  const bare = host.replace(/^www\./, "");
  return SISTER_ALERT_SITES.find((s) => new URL(s.url).hostname.replace(/^www\./, "") === bare) ?? null;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const site = allowedOrigin(origin);
  if (!site || !origin) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
