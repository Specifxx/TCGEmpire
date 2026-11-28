// THE SITES THE SHARED ALERT SERVICE WORKS FOR (2026-11-02, owner: "Yes, one
// shared service"). Each one shows an "Email me when it drops below" form that
// posts here, and publishes its own lowest prices as a static file,
// `<url>/alert-feed.json` (format in ./feed.ts), built by the site from the
// same loaders its pages read. The daily check fetches that file from the
// site's CDN: no sister database, repo token or data branch is read.
//
// TCG Prices (tcgprices.app) joined on 2026-11-16 (owner: urgent, so its alerts need no wait).
// Not here, on purpose: RiftCompare itself and OP Compare (their own account
// alerts), CamCompare and Compare Empire (their own alert tables). KaeYoung, left out on
// 2026-11-02, joined with ScentCompare on 2026-11-19 when the owner asked for accounts everywhere.

export type SisterAlertSiteKey = "dex" | "mtg" | "gundam" | "lorcana" | "ygo" | "cyberpunk" | "bandai" | "tcgprices" | "wax" | "wargame" | "figure" | "scent" | "kaeyoung" | "brick";
/** "scent", "kbeauty", "sports" and "hobby" are groups of one: their emails never end with another site's deal (KaeYoung carries no
 *  sister links, and the two sides of the network never link each other: owner, 2026-11-17). */
export type SisterGroup = "cards" | "hobby" | "scent" | "kbeauty" | "sports" | "brick";

export interface SisterAlertSite {
  key: SisterAlertSiteKey;
  name: string;
  /** Canonical origin, no trailing slash. */
  url: string;
  /** Which sites' deals an alert email may end with: one of the same group. */
  group: SisterGroup;
  /** Brand colour for the email's buttons. */
  color: string;
  /** Hosts the site answered on before (a form already open there still posts from them); allowed as origins, never linked. */
  oldHosts?: string[];
  /** Emails never name RiftCompare (the beauty sites, owner 2026-11-19: no Compare branding on KaeYoung, other side of the network for both). */
  quiet?: boolean;
}

export const SISTER_ALERT_SITES: SisterAlertSite[] = [
  { key: "dex", name: "DexCompare", url: "https://dexcompare.io", group: "cards", color: "#e3350d", oldHosts: ["dexcompare.app"] },
  { key: "mtg", name: "MTG Compare", url: "https://mtgcompare.app", group: "cards", color: "#7c3aed" },
  { key: "gundam", name: "Gundam Compare", url: "https://gundamcompare.com", group: "cards", color: "#1d4ed8" },
  { key: "lorcana", name: "Lorcana Compare", url: "https://lorcanacompare.com", group: "cards", color: "#6d28d9" },
  { key: "ygo", name: "YGO Compare", url: "https://ygocompare.com", group: "cards", color: "#b45309" },
  { key: "cyberpunk", name: "Cyberpunk Compare", url: "https://cyberpunkcompare.com", group: "cards", color: "#0891b2" },
  { key: "bandai", name: "BandaiCompare", url: "https://bandaicompare.com", group: "cards", color: "#ff6a00" },
  { key: "tcgprices", name: "TCG Prices", url: "https://tcgprices.app", group: "cards", color: "#2457d6" },
  // SportsCardCompare, WargameCompare and FigureCompare regrouped 2026-11-19 (the two sides of the network, owner 2026-11-17):
  // Sports cards and Figure are on the other side from RiftCompare, so they are quiet and alone; Wargame is on the cards side.
  { key: "wax", name: "SportsCardCompare", url: "https://sportscardcompare.com", group: "sports", color: "#1d4ed8", quiet: true },
  { key: "wargame", name: "WargameCompare", url: "https://wargamecompare.com", group: "cards", color: "#b91c1c" },
  { key: "figure", name: "FigureCompare", url: "https://figurecompare.com", group: "hobby", color: "#dc2626", quiet: true },
  // ScentCompare and KaeYoung (2026-11-19, owner: "accounts for every single one of our compare sites", Premium with deals and alerts).
  { key: "scent", name: "ScentCompare", url: "https://scentcompare.app", group: "scent", color: "#1d4ed8", quiet: true },
  { key: "kaeyoung", name: "KaeYoung", url: "https://kaeyoung.com", group: "kbeauty", color: "#e11d6b", quiet: true },
  // BrickCompare (2026-11-28, owner: sealed LEGO, "reuse the existing alert engine, do not build a second one"). Not a card site,
  // so a group of one and quiet (its emails never name RiftCompare). Its domain is not bought yet: the canonical URL is the
  // recommended brickcompare.app, and brickcompare.vercel.app is accepted as an origin so sign-in and alerts can be tried there first.
  { key: "brick", name: "BrickCompare", url: "https://brickcompare.app", group: "brick", color: "#d9480f", quiet: true, oldHosts: ["brickcompare.vercel.app"] },
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
  return SISTER_ALERT_SITES.find((s) => new URL(s.url).hostname.replace(/^www\./, "") === bare || (s.oldHosts ?? []).includes(bare)) ?? null;
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
