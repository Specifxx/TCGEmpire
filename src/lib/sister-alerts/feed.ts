// THE ALERT FEED: what each sister site publishes at `<url>/alert-feed.json`
// (a static file its build writes from its own loaders) and the daily check
// reads. Version 1:
//
//   {
//     "v": 1,
//     "site": "mtg",                       // must match the site it came from
//     "generatedAt": "2026-11-02T07:00:00Z",
//     "items": {                           // every product with a price
//       "<productId>": {
//         "n": "Foundations Play Booster Box",
//         "u": "/{r}/p/foundations-play-booster-box",  // path on the site;
//                                         // "{r}" = the alert's region, lowercase
//         "p": { "US": 13999, "UK": 11999 }  // lowest IN-STOCK STORE price per
//       }                                    // region, in that region's own
//     },                                     // currency's cents (never eBay,
//     "deals": [                             // Amazon or a conversion)
//       { "n": "…", "u": "/…", "r": "US", "p": 4999, "ref": 6999, "refLabel": "TCGplayer market" }
//     ]
//   }
//
// `deals` are the site's own real deals (a store price under the site's own
// reference), at most a few per region; an alert email from another site of
// the same group may end with one. `ref` is shown only with its label.
import { SISTER_REGIONS, type SisterAlertSite, type SisterRegion } from "./sites";

export interface FeedItem {
  n: string;
  u: string;
  p: Partial<Record<SisterRegion, number>>;
}
export interface FeedDeal {
  n: string;
  u: string;
  r: SisterRegion;
  p: number;
  ref?: number;
  refLabel?: string;
}
export interface AlertFeed {
  v: 1;
  site: string;
  generatedAt: string;
  items: Record<string, FeedItem>;
  deals: FeedDeal[];
}

export const FEED_PATH = "/alert-feed.json";
/** A feed bigger than this is refused rather than parsed. */
export const FEED_MAX_BYTES = 40 * 1024 * 1024;
/** A feed older than this is not trusted to fire an alert (the site stopped building). */
export const FEED_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;

const REGIONS = new Set<string>(SISTER_REGIONS);

/** A feed path for one region: "{r}" becomes the region's code, lowercase ("/us/p/box"). */
export function resolvePath(u: string, region: string): string {
  return u.split("{r}").join(region.toLowerCase());
}
const isCents = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x > 0 && x < 1e9;
const isPath = (x: unknown): x is string => typeof x === "string" && x.startsWith("/") && !x.startsWith("//") && x.length <= 300 && !/[\s<>"']/.test(x);
const isName = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= 300;

/**
 * Validates a parsed feed for `site`. Throws on a wrong site, version or shape;
 * individual malformed items or deals are dropped, never guessed.
 */
export function parseFeed(raw: unknown, site: Pick<SisterAlertSite, "key">): AlertFeed {
  if (!raw || typeof raw !== "object") throw new Error("feed is not an object");
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) throw new Error(`unknown feed version ${String(r.v)}`);
  if (r.site !== site.key) throw new Error(`feed is for "${String(r.site)}", not "${site.key}"`);
  if (typeof r.generatedAt !== "string" || Number.isNaN(Date.parse(r.generatedAt))) throw new Error("feed has no generatedAt");
  if (!r.items || typeof r.items !== "object") throw new Error("feed has no items");
  const items: Record<string, FeedItem> = {};
  for (const [id, v] of Object.entries(r.items as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const it = v as Record<string, unknown>;
    if (!isName(it.n) || !isPath(it.u) || !it.p || typeof it.p !== "object") continue;
    const p: Partial<Record<SisterRegion, number>> = {};
    for (const [reg, c] of Object.entries(it.p as Record<string, unknown>)) if (REGIONS.has(reg) && isCents(c)) p[reg as SisterRegion] = c;
    items[id] = { n: it.n.trim(), u: it.u, p };
  }
  const deals: FeedDeal[] = [];
  for (const v of Array.isArray(r.deals) ? r.deals : []) {
    if (!v || typeof v !== "object") continue;
    const d = v as Record<string, unknown>;
    if (!isName(d.n) || !isPath(d.u) || typeof d.r !== "string" || !REGIONS.has(d.r) || !isCents(d.p)) continue;
    const withRef = isCents(d.ref) && d.ref > d.p && isName(d.refLabel);
    deals.push({ n: d.n.trim(), u: d.u, r: d.r as SisterRegion, p: d.p, ...(withRef ? { ref: d.ref as number, refLabel: (d.refLabel as string).trim() } : {}) });
  }
  return { v: 1, site: site.key, generatedAt: r.generatedAt, items, deals };
}

export function feedIsFresh(feed: Pick<AlertFeed, "generatedAt">, now: Date): boolean {
  const t = Date.parse(feed.generatedAt);
  return Number.isFinite(t) && now.getTime() - t <= FEED_MAX_AGE_MS;
}

/** Fetches and validates one site's feed from its CDN. Throws on any failure. */
export async function fetchFeed(site: SisterAlertSite, fetcher: typeof fetch = fetch): Promise<AlertFeed> {
  const res = await fetcher(`${site.url}${FEED_PATH}`, { headers: { Accept: "application/json", "User-Agent": "RiftCompare-alerts/1 (+https://riftcompare.com)" }, cache: "no-store" });
  if (!res.ok) throw new Error(`${site.name} feed: HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len > FEED_MAX_BYTES) throw new Error(`${site.name} feed: ${len} bytes, over the limit`);
  const text = await res.text();
  if (text.length > FEED_MAX_BYTES) throw new Error(`${site.name} feed: over the size limit`);
  return parseFeed(JSON.parse(text), site);
}
