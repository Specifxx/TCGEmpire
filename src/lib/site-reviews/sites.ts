// THE SITES WHOSE RATINGS AND REVIEWS LIVE HERE (2026-11-03, owner: "the
// feedback pop up … on all of our other website too, and have the reviews
// public for each website … I want to approve them in the riftcompare admin
// dashboard for all sites"; star ratings count straight away, written reviews
// wait for approval). DECISIONS.md, "Every site's reviews, approved in one
// queue".
//
// Each sister site's rating card posts cross-origin to /api/site-reviews and
// draws its score and approved reviews from /api/site-reviews/<key>, a public
// JSON the CDN keeps six hours. The rows are Feedback rows with `site` set to
// the key below; RiftCompare's own rows keep "riftcompare".

export type SisterReviewSiteKey =
  | "op"
  | "dex"
  | "mtg"
  | "gundam"
  | "lorcana"
  | "ygo"
  | "cyberpunk"
  | "bandai"
  | "wargame"
  | "figure"
  | "kaeyoung"
  | "scentcompare"
  | "wax"
  | "cam"
  | "compareempire";

export interface SisterReviewSite {
  key: SisterReviewSiteKey;
  name: string;
  /** Canonical origin, no trailing slash. */
  url: string;
}

export const RIFT_SITE_KEY = "riftcompare";

export const SISTER_REVIEW_SITES: SisterReviewSite[] = [
  { key: "op", name: "OP Compare", url: "https://opcompare.app" },
  { key: "dex", name: "DexCompare", url: "https://dexcompare.app" },
  { key: "mtg", name: "MTG Compare", url: "https://mtgcompare.app" },
  { key: "gundam", name: "Gundam Compare", url: "https://gundamcompare.com" },
  { key: "lorcana", name: "Lorcana Compare", url: "https://lorcanacompare.com" },
  { key: "ygo", name: "YGO Compare", url: "https://ygocompare.com" },
  { key: "cyberpunk", name: "Cyberpunk Compare", url: "https://cyberpunkcompare.com" },
  { key: "bandai", name: "BandaiCompare", url: "https://bandaicompare.com" },
  { key: "wargame", name: "WargameCompare", url: "https://wargamecompare.com" },
  { key: "figure", name: "FigureCompare", url: "https://figurecompare.com" },
  { key: "kaeyoung", name: "KaeYoung", url: "https://kaeyoung.com" },
  { key: "scentcompare", name: "ScentCompare", url: "https://scentcompare.app" },
  { key: "wax", name: "SportsCardCompare", url: "https://sportscardcompare.com" },
  { key: "cam", name: "CamCompare", url: "https://www.camcompare.app" },
  { key: "compareempire", name: "Compare Empire", url: "https://compareempire.com" },
];

export const SISTER_REVIEW_KEYS = SISTER_REVIEW_SITES.map((s) => s.key) as [SisterReviewSiteKey, ...SisterReviewSiteKey[]];

export function reviewSite(key: string): SisterReviewSite | null {
  return SISTER_REVIEW_SITES.find((s) => s.key === key) ?? null;
}

/** "RiftCompare" for this site's own rows, the sister's name otherwise. */
export function reviewSiteName(key: string): string {
  if (key === RIFT_SITE_KEY) return "RiftCompare";
  return reviewSite(key)?.name ?? key;
}

/**
 * The site a browser request comes from: each site's canonical origin and its
 * www/apex twin, https only, nothing else (no wildcard, no preview hosts).
 */
export function reviewSiteForOrigin(origin: string | null): SisterReviewSite | null {
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
  return SISTER_REVIEW_SITES.find((s) => new URL(s.url).hostname.replace(/^www\./, "") === bare) ?? null;
}

export function reviewCorsHeaders(origin: string | null): Record<string, string> {
  const site = reviewSiteForOrigin(origin);
  if (!site || !origin) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
