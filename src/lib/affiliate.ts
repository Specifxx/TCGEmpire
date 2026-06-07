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
  } catch {
    /* not an absolute URL — leave it untouched */
  }
  return url;
}
