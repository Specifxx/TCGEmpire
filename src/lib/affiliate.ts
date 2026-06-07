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

// Append our affiliate identifier to an outbound product link where we belong to a
// program. eBay links are already affiliate-tagged at import time (the Browse API
// returns itemAffiliateWebUrl when the campaign is set), so this mainly handles
// Amazon; other links pass through unchanged. Safe on any string.
export function affiliateUrl(url: string | null | undefined): string {
  if (!url) return "#";
  try {
    const u = new URL(url);
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
