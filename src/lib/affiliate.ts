// Affiliate / partner identifiers. These are PUBLIC by design — they appear in
// outbound URLs and in the page HTML — so they're safe as code defaults (override
// via env if you ever rotate them).

// eBay Partner Network campaign id. Passed to the Browse API so listing URLs come
// back already affiliate-tagged (itemAffiliateWebUrl). See lib/ebay.ts.
export const EBAY_CAMPAIGN_ID = process.env.EBAY_AFFILIATE_CAMPAIGN ?? "5339155912";

// Amazon Associates store/tracking id, appended to amazon.* product links.
export const AMAZON_ASSOCIATE_TAG = process.env.AMAZON_ASSOCIATE_TAG ?? "riftcompare-20";

// Impact (TCGplayer affiliate) site-ownership verification token. Rendered as a
// <meta> in the document <head>.
export const IMPACT_SITE_VERIFICATION = "ebb0400c-dec0-45ae-a56e-e7bb1596e965";

// TCGplayer's affiliate program runs through Impact. Once the application is
// APPROVED, set this to your Impact deep-link base from the dashboard, e.g.
//   https://tcgplayer.pxf.io/c/<accountSID>/<campaignID>/<propertyID>
// and every tcgplayer.com outbound link is wrapped to earn commission. Empty =
// links pass through untouched (no tracking) while the application is in review.
export const TCGPLAYER_IMPACT_LINK = process.env.TCGPLAYER_IMPACT_LINK ?? "";

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

// Append our affiliate identifier to an outbound product link where we belong to a
// program (eBay EPN, Amazon Associates, TCGplayer via Impact). Other links pass
// through unchanged. Safe on any string.
export function affiliateUrl(url: string | null | undefined): string {
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
  } catch {
    /* not an absolute URL — leave it untouched */
  }
  return url;
}
