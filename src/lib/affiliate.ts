// Affiliate / partner identifiers. These are PUBLIC by design — they appear in
// outbound URLs and in the page HTML — so they're safe as code defaults (override
// via env if you ever rotate them).

import { SITE_URL } from "./site";

// eBay Partner Network campaign id. Passed to the Browse API so listing URLs come
// back already affiliate-tagged (itemAffiliateWebUrl). See lib/ebay.ts.
// NOTE: `||` (not `??`) so a var accidentally set to an EMPTY string still falls
// back to this id — an empty value emits `campid=` and silently untracks clicks.
export const EBAY_CAMPAIGN_ID = process.env.EBAY_AFFILIATE_CAMPAIGN || "5339155912";

// Amazon Associates store/tracking id, appended to amazon.* product links.
// `||` (not `??`) so an empty-string env var still falls back to the default.
export const AMAZON_ASSOCIATE_TAG = process.env.AMAZON_ASSOCIATE_TAG || "riftcompare-20";

// Impact (TCGplayer affiliate) site-ownership verification token. Rendered as a
// <meta> in the document <head>.
export const IMPACT_SITE_VERIFICATION = "ebb0400c-dec0-45ae-a56e-e7bb1596e965";

// TCGplayer's affiliate program runs through Impact (APPROVED). Every
// tcgplayer.com outbound link is wrapped through this deep-link base to earn
// commission. `||` (not `??`) so an empty-string env var still falls back to the
// approved link — an empty base would silently un-monetise every TCGplayer click.
export const TCGPLAYER_IMPACT_LINK =
  process.env.TCGPLAYER_IMPACT_LINK || "https://partner.tcgplayer.com/c/7385758/1780961/21018";

// eBay Partner Network link parameters per marketplace. The Browse API is supposed
// to return pre-tagged URLs (itemAffiliateWebUrl) when we pass the campaign, but in
// practice it often returns the plain itemWebUrl, so we tag links ourselves here —
// this is the standard "ePN smart link" format and is what actually credits clicks.
// mkevt=1 is the critical flag (without it the click is NOT tracked); mkrid is the
// marketplace rotation id (verified against eBay's EPN docs).
const EBAY_MARKETS: Record<string, { mkrid: string; siteid: string; customid: string }> = {
  "ebay.com.au": { mkrid: "705-53470-19255-0", siteid: "15", customid: "rc-au" },
  "ebay.com": { mkrid: "711-53200-19255-0", siteid: "0", customid: "rc-us" },
  "ebay.co.uk": { mkrid: "710-53481-19255-0", siteid: "3", customid: "rc-uk" },
};

function ebayMarket(hostname: string) {
  const h = hostname.replace(/^www\./i, "").toLowerCase();
  if (EBAY_MARKETS[h]) return EBAY_MARKETS[h];
  // Any other eBay TLD still gets tracked — fall back to the US rotation.
  if (/(?:^|\.)ebay\./i.test(h)) return EBAY_MARKETS["ebay.com"];
  return null;
}

// Turn a plain eBay item/search URL into an affiliate-tracked one.
export function ebayAffiliateUrl(url: string): string {
  try {
    const u = new URL(url);
    const m = ebayMarket(u.hostname);
    if (!m) return url;
    u.searchParams.set("mkevt", "1"); // marks the click as a tracked EPN event (required)
    u.searchParams.set("mkcid", "1"); // channel: eBay Partner Network
    u.searchParams.set("mkrid", m.mkrid); // marketplace rotation id
    u.searchParams.set("siteid", m.siteid);
    u.searchParams.set("campid", EBAY_CAMPAIGN_ID);
    u.searchParams.set("toolid", "10001");
    u.searchParams.set("customid", m.customid); // sub-id so EPN reports are segmentable
    return u.toString();
  } catch {
    return url;
  }
}

// ---- Per-store DIRECT affiliate programs (the long tail of Shopify stores) ------
// eBay, Amazon and TCGplayer pay us DIRECTLY (best rate — no middleman cut) and are
// handled above. The 60+ Shopify shops we compare earn nothing UNLESS we sign each
// store's own affiliate/referral program (Shopify Collabs / Refersion / UpPromote,
// a ref= param, etc.) and register the URL rewrite here. Add stores as you get them
// approved — use the outbound-click leaderboard (/admin/clicks) to prioritise which
// to sign first. Example:
//   "cherrycollectables.com.au": (u) => { u.searchParams.set("ref", "riftcompare"); return u.toString(); },
const DIRECT_PROGRAMS: Record<string, (u: URL) => string> = {
  // add approved programs here, keyed by bare hostname (no www)
};

function directProgramUrl(u: URL): string | null {
  const host = u.hostname.replace(/^www\./i, "").toLowerCase();
  const fn = DIRECT_PROGRAMS[host];
  return fn ? fn(u) : null;
}

// Append our affiliate identifier to an outbound product link.
//   Priority: eBay EPN → Amazon Associates → TCGplayer (Impact) → per-store DIRECT
//   program → plain link.
// `subId` (the store/retailer key when callers pass it) and `loc` (the source page)
// are accepted for signature compatibility with per-store programs that may want a
// sub-id; unused by the current programs. Safe on any string.
export function affiliateUrl(
  url: string | null | undefined,
  subId = "riftcompare",
  loc: string = SITE_URL,
): string {
  void subId;
  void loc;
  if (!url) return "#";
  try {
    const u = new URL(url);
    if (/(?:^|\.)ebay\./i.test(u.hostname)) {
      return ebayAffiliateUrl(url);
    }
    if (/(?:^|\.)amazon\./i.test(u.hostname)) {
      u.searchParams.set("tag", AMAZON_ASSOCIATE_TAG);
      return u.toString();
    }
    // TCGplayer via Impact — only once an approved deep-link base is configured.
    if (TCGPLAYER_IMPACT_LINK && /(?:^|\.)tcgplayer\.com$/i.test(u.hostname)) {
      return `${TCGPLAYER_IMPACT_LINK}?u=${encodeURIComponent(url)}`;
    }
    // A signed per-store direct program (none yet) rewrites the URL here.
    const direct = directProgramUrl(u);
    if (direct) return direct;
  } catch {
    /* not an absolute URL — leave it untouched */
  }
  return url;
}

// rel attribute for outbound merchant anchors. Links already affiliated — eBay EPN
// (campid), TCGplayer Impact, or Amazon (tag) — are marked "sponsored"; all outbound
// merchant links are nofollow + noopener + noreferrer.
export function outboundRel(_href: string): string {
  void _href;
  return "nofollow sponsored noopener noreferrer";
}
