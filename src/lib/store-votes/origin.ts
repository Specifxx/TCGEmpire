import { RIFT_SITE_KEY, reviewSiteForOrigin } from "../site-reviews/sites";

// WHO MAY VOTE: RiftCompare itself and the sister sites in
// lib/site-reviews/sites.ts, by their exact https origins (www or apex), never
// a wildcard or a preview host. The site is taken from the Origin header, kept
// with the vote for the admin only, and never published.
export function voteSiteForOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    if (u.protocol === "https:" && !u.port && u.hostname.toLowerCase().replace(/^www\./, "") === "riftcompare.com") return RIFT_SITE_KEY;
  } catch {
    return null;
  }
  return reviewSiteForOrigin(origin)?.key ?? null;
}

export function voteCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !voteSiteForOrigin(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
