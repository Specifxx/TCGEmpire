// Shared outbound-scraping HTTP helpers for the retailer importers
// (price-import.ts, sealed-import.ts) and the market-scan probe scripts.
// Centralised so robots.txt handling, backoff/rate-limiting, and headers are
// consistent everywhere we read a third-party store's public product feed,
// instead of duplicated per file.
import { CONTACT_EMAIL } from "./site";

// Deliberately a realistic browser User-Agent, not an identifying bot UA — some
// stores serve a stale/cached price to obvious bot UAs but the fresh price to
// browsers (see price-import.ts's UA comment). `From` carries the same "who is
// this" information a descriptive UA would, without triggering that stale-cache
// behaviour.
export const SCRAPE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  From: CONTACT_EMAIL,
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Small fixed delay between paginated/sequential requests to the SAME store, so a
// single store's crawl never looks like a burst. One conservative default for
// every scraper rather than a per-call-site knob.
export const REQUEST_DELAY_MS = 300;

// Cloudflare's "error 1015" rate-limit response is served as HTTP 429. Treat any
// 429 as an explicit backoff signal: callers should log it once and stop hitting
// that store for the rest of the run, never retry it in a loop.
export function isRateLimited(res: Response): boolean {
  return res.status === 429;
}

// Minimal robots.txt reader: only understands flat Disallow/Allow prefixes under
// a `User-agent: *` group — no wildcards, no `$` anchors, no Crawl-delay. That
// covers every real-world case of a robots.txt blocking a Shopify products.json
// feed; anything this can't confidently read FAILS OPEN (allowed), matching the
// importer's existing behaviour for any other unreadable feed — a parsing gap
// here must never silently block a store that was working fine, it can only ever
// under-enforce, never over-enforce.
interface RobotsRules {
  disallow: string[];
  allow: string[];
}
const robotsCache = new Map<string, Promise<RobotsRules | null>>();

async function fetchRobots(base: string): Promise<RobotsRules | null> {
  try {
    const res = await fetch(`${base}/robots.txt`, { headers: SCRAPE_HEADERS });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
    const rules: RobotsRules = { disallow: [], allow: [] };
    let inWildcardGroup = false;
    let sawWildcard = false;
    for (const line of lines) {
      const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const field = m[1].toLowerCase();
      const value = m[2].trim();
      if (field === "user-agent") {
        inWildcardGroup = value === "*";
        if (value === "*") sawWildcard = true;
        continue;
      }
      if (!inWildcardGroup) continue;
      if (field === "disallow" && value) rules.disallow.push(value);
      if (field === "allow" && value) rules.allow.push(value);
    }
    return sawWildcard ? rules : null;
  } catch {
    return null;
  }
}

// Returns a checker for whether `path` (e.g.
// "/collections/riftbound-singles/products.json") is allowed for our crawl at
// this `base`. Cached per base so calling this from multiple functions for the
// same store costs one fetch. Fails open on any fetch/parse failure (see above).
export async function robotsAllows(base: string): Promise<(path: string) => boolean> {
  let pending = robotsCache.get(base);
  if (!pending) {
    pending = fetchRobots(base);
    robotsCache.set(base, pending);
  }
  const rules = await pending;
  if (!rules) return () => true;
  return (path: string) => {
    // Longest matching prefix wins (standard robots.txt semantics); ties favour Allow.
    const longestMatch = (list: string[]) =>
      list.filter((p) => path.startsWith(p)).sort((a, b) => b.length - a.length)[0];
    const dis = longestMatch(rules.disallow);
    if (!dis) return true;
    const allow = longestMatch(rules.allow);
    return !!allow && allow.length >= dis.length;
  };
}
