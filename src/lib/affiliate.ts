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

// Sovrn Commerce (VigLink) API key — APPROVED. Used twice: the client-side
// vglnk.js install snippet (components/SovrnLoader.tsx, which Sovrn's install
// check looks for) and the server-side redirect wrapper below. Public by design
// (it ships in the page HTML either way).
export const SOVRN_KEY = process.env.NEXT_PUBLIC_SOVRN_KEY || "1a16f011fe9fa529aa7722b8b7127476";

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

// ---- Auto-affiliate network (the long tail of Shopify stores) -----------------
// eBay, Amazon and TCGplayer pay us DIRECTLY (best rate — no middleman cut), so
// they're handled above and never touched here. Every OTHER outbound store click
// (the 60+ Shopify shops we compare) earns nothing unless we route it through a
// link-monetisation network that has those merchants under one integration.
//
// Sovrn Commerce (formerly VigLink) is the default network: a Skimlinks-style
// auto-affiliate that converts outbound merchant links on the fly across ~30k
// merchants, with a lower acceptance bar than Skimlinks. Configure:
//   AFFILIATE_NETWORK=sovrn                      (default)
//   AFFILIATE_NETWORK_ID=<your Sovrn API key>    (Sovrn dashboard → "API key")
// Leaving the id EMPTY = links pass through untouched (zero behaviour change),
// exactly like the TCGplayer link stays inert until approved. So this is safe to
// ship now and "turns on" the moment you paste your id into the env.
const AFFILIATE_NETWORK = (process.env.AFFILIATE_NETWORK ?? "sovrn").toLowerCase();
// Defaults to the approved Sovrn key, so the 60+ Shopify store links are
// monetised out of the box; override or empty via env to switch networks/off.
const AFFILIATE_NETWORK_ID = process.env.AFFILIATE_NETWORK_ID ?? SOVRN_KEY;

// Hosts that must NEVER be wrapped by the network: our own site, and the partners
// we already monetise directly (their direct programs always pay more).
const NEVER_WRAP = /(?:^|\.)(riftcompare\.com|ebay\.|amazon\.|tcgplayer\.com)$/i;

// Wrap a destination URL in the configured network's redirect. `subId` is passed
// through as the network's custom-tracking field so earnings are segmentable by
// store in the network dashboard (complements our own click analytics). `loc` is
// the source page the click originates from. Returns null when no network id is
// set (→ caller falls back to the plain URL).
function networkUrl(url: string, subId: string, loc: string): string | null {
  if (!AFFILIATE_NETWORK_ID) return null;
  const enc = encodeURIComponent(url);
  const xcust = encodeURIComponent(subId);
  switch (AFFILIATE_NETWORK) {
    case "sovrn":
    case "viglink":
      // Sovrn Commerce "Anywhere" redirect. We mirror EXACTLY the query shape Sovrn's
      // own on-page script (vglnk.js) emits for tracked clicks:
      //   format=go + out=<destination> + key=<api key> + loc=<source page> + v=1
      // Two things that matter for attribution:
      //   • `out` (not `u`) is the destination param that pairs with format=go — `u`
      //     is only for the no-format-go manual/CUID link style, so mixing them broke
      //     tracking even though the click still redirected to the store.
      //   • `loc` tells Sovrn the click came from our domain (our outbound anchors are
      //     rel="noreferrer", so the Referer is stripped) — required for the automatic
      //     domain approval that gates whether clicks show in the dashboard at all.
      // cuid is the custom sub-id so earnings stay segmentable by store.
      return `https://redirect.viglink.com/?format=go&key=${AFFILIATE_NETWORK_ID}&out=${enc}&cuid=${xcust}&loc=${encodeURIComponent(loc)}&v=1`;
    default:
      return null;
  }
}

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
//   program → auto-affiliate network (Sovrn) → plain link.
// `subId` (defaults to the store/retailer key when callers pass it) is used as the
// network's custom-tracking tag. `loc` is the source page URL passed to the network
// so it can attribute the click to our domain (defaults to the site root; pass the
// specific page URL where available). Safe on any string.
export function affiliateUrl(
  url: string | null | undefined,
  subId = "riftcompare",
  loc: string = SITE_URL,
): string {
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
    // A signed direct store program always beats the network — check it first.
    const direct = directProgramUrl(u);
    if (direct) return direct;
    // Otherwise auto-monetise via the network (no-op until an id is configured).
    if ((u.protocol === "https:" || u.protocol === "http:") && !NEVER_WRAP.test(u.hostname)) {
      const net = networkUrl(url, subId, loc);
      if (net) return net;
    }
  } catch {
    /* not an absolute URL — leave it untouched */
  }
  return url;
}

// rel attribute for outbound merchant anchors. Sovrn's on-page script
// (vglnk.js) honours "norewrite": links that are already affiliated — eBay EPN
// (campid), TCGplayer Impact, Amazon (tag), or Sovrn's own server-side
// redirect — must keep their full-rate direct attribution, so the script is
// told to leave them alone.
export function outboundRel(href: string): string {
  const affiliated = /partner\.tcgplayer\.com|redirect\.viglink\.com|[?&]campid=|[?&]tag=/.test(href);
  return `nofollow sponsored noopener noreferrer${affiliated ? " norewrite" : ""}`;
}
