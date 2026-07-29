// Affiliate / partner identifiers. These are PUBLIC by design — they appear in
// outbound URLs and in the page HTML — so they're safe as code defaults (override
// via env if you ever rotate them).

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

// ---- The long tail of Shopify stores -----------------------------------------
// eBay, Amazon and TCGplayer pay us DIRECTLY (best rate — no middleman cut) and
// are handled above. Every OTHER outbound store click (the 60+ Shopify shops we
// compare) currently goes out as a PLAIN link and earns nothing.
//
// Sovrn Commerce (VigLink) used to auto-monetise these via a redirect wrapper,
// and its on-page vglnk.js script was loaded site-wide. Both were removed at the
// owner's direction, matching the same removal on DexCompare (where the script
// was demonstrably broken — its api.viglink.com ping blocked by CORS and its
// stylesheet by CSP).
//
// To re-monetise this tail, sign per-store DIRECT programs below — they pay
// better than any network anyway since there's no revenue share.

// Per-store DIRECT affiliate programs, added as you sign them (Shopify Collabs /
// Refersion / UpPromote, etc.). A direct program beats the network because there's
// no revenue share, so these are checked BEFORE the network fallback. Use your
// outbound-click leaderboard to prioritise which stores to sign first. Example:
//   "cherrycollectables.com.au": (u) => { u.searchParams.set("ref", "riftcompare"); return u.toString(); },
const DIRECT_PROGRAMS: Record<string, (u: URL) => string> = {
  // add approved programs here — they override the network automatically
};

function directProgramUrl(u: URL): string | null {
  const host = u.hostname.replace(/^www\./i, "").toLowerCase();
  const fn = DIRECT_PROGRAMS[host];
  return fn ? fn(u) : null;
}

// Append our affiliate identifier to an outbound product link.
//   Priority: eBay EPN → Amazon Associates → TCGplayer (Impact) → per-store DIRECT
//   program → plain link.
// `subId` is retained for call-site compatibility (and as the sub-id hook for any
// future network/direct program that wants one); it is unused today. Safe on any
// string.
export function affiliateUrl(url: string | null | undefined, subId = "riftcompare"): string {
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
    // A signed direct store program is the only monetisation left for the long
    // tail now that the Sovrn network wrapper is gone; without one the plain
    // store URL is returned untouched.
    const direct = directProgramUrl(u);
    if (direct) return direct;
  } catch {
    /* not an absolute URL — leave it untouched */
  }
  return url;
}

// rel attribute for outbound merchant anchors. "sponsored" is the required
// machine-readable half of affiliate disclosure; "nofollow" keeps outbound
// commercial links from passing PageRank.
//
// The old "norewrite" token was Sovrn-specific — it told vglnk.js to leave
// already-affiliated links alone. With Sovrn removed there is no script to
// instruct, so it's dropped.
export function outboundRel(_href?: string): string {
  return "nofollow sponsored noopener noreferrer";
}
