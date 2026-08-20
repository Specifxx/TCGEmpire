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

// eBay Partner Network link parameters per marketplace we actually have a real,
// commission-eligible rotation for. The Browse API is supposed to return
// pre-tagged URLs (itemAffiliateWebUrl) when we pass the campaign, but in
// practice it often returns the plain itemWebUrl, so we tag links ourselves here
// — this is the standard "ePN smart link" format and is what actually credits
// clicks. mkevt=1 is the critical flag (without it the click is NOT tracked);
// mkrid is the marketplace rotation id.
//
// UK and CA verified directly against the live EPN dashboard on 2026-08-14 (CA's
// was previously an unverified placeholder — see git history — that turned out
// to be correct).
//
// Germany's brief 2026-08-20 add-then-remove (see country.ts's header note) had
// an "ebay.de" entry here too; it's gone along with the rest of the DE market —
// any stray ebay.de URL now falls through to the generic eBay-TLD fallback below
// (US rotation) like every other untracked eBay TLD.
const EBAY_MARKETS: Record<string, { mkrid: string; siteid: string; customid: string }> = {
  "ebay.com.au": { mkrid: "705-53470-19255-0", siteid: "15", customid: "rc-au" },
  "ebay.com": { mkrid: "711-53200-19255-0", siteid: "0", customid: "rc-us" },
  "ebay.co.uk": { mkrid: "710-53481-19255-0", siteid: "3", customid: "rc-uk" },
  "ebay.ca": { mkrid: "706-53473-19255-0", siteid: "2", customid: "rc-ca" },
};

// eBay Partner Network has NO commissionable program for Singapore at all —
// confirmed against EPN's own help documentation on 2026-08-14. This was never
// a "find the right rotation id" problem the way CA looked like one; there is
// no ebay.com.sg rotation to have. So every ebay.com.sg URL — whether WE built
// it (a search link) or eBay's own Browse API handed it back (a real listing
// found via the EBAY_SG marketplace search — see lib/ebay.ts) — reroutes onto
// the US site/rotation instead of being tagged in place.
//
// Confirmed this is a like-for-like swap, not a guess at some unrelated
// substitute: a real SG-marketplace listing pulled from production for this
// project carried the EXACT SAME eBay item id as that card's UK listing
// (137597929650) — eBay serves the identical inventory across its site
// fronts, it just presents it under a different domain/currency per site.
//
// customid keeps reporting the market as "rc-sg", not "rc-us" — see
// ebayMarket() — specifically so EPN's by-custom-id report can still show
// what Singapore-origin traffic is worth, even though eBay credits it under
// the US rotation.
const SG_HOST = "ebay.com.sg";
const SG_REROUTE_TO = "ebay.com";
const SG_CUSTOM_ID = "rc-sg";

function ebayMarket(hostname: string): { mkrid: string; siteid: string; customid: string; realHost: string } | null {
  const h = hostname.replace(/^www\./i, "").toLowerCase();
  if (h === SG_HOST) return { ...EBAY_MARKETS[SG_REROUTE_TO], customid: SG_CUSTOM_ID, realHost: SG_REROUTE_TO };
  if (EBAY_MARKETS[h]) return { ...EBAY_MARKETS[h], realHost: h };
  // Any other eBay TLD still gets tracked — fall back to the US rotation.
  if (/(?:^|\.)ebay\./i.test(h)) return { ...EBAY_MARKETS["ebay.com"], realHost: "ebay.com" };
  return null;
}

// ── ATTRIBUTION: what earns, not just how much ───────────────────────────────
// Both networks give us exactly one free-text field per click — EPN's `customid`
// and Impact's `sharedid` — and it is the only way to learn WHERE revenue comes
// from. Without it every click reports the same id and the reports can answer
// "did eBay earn?" but never "did the card page's price table earn, or the ad
// carousel, or the deal finder?" — which is the question that decides where the
// next placement goes.
//
// Format: rc-<market>-<source>, e.g. `rc-au-ebay`, `rc-us-tcgplayer`,
// `rc-au-amazon_sealed`. Stable, greppable, and sorts sensibly in a report.
//
// Sanitised hard: EPN silently drops a click whose customid contains anything
// outside a conservative set, and a dropped click is unattributed revenue that
// looks exactly like no revenue. 60 chars is well inside EPN's 256 limit and
// Impact's sharedid limit.
const SUBID_MAX = 60;
export function affiliateSubId(...parts: (string | null | undefined)[]): string {
  const s = parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, SUBID_MAX) || "rc";
}

// Turn a plain eBay item/search URL into an affiliate-tracked one.
//
// `source` segments EPN reporting by placement. Optional so the many existing
// call sites keep working unchanged — they just report the market-level id they
// always did, rather than breaking or silently losing their tag.
export function ebayAffiliateUrl(url: string, source?: string): string {
  try {
    const u = new URL(url);
    const m = ebayMarket(u.hostname);
    if (!m) return url;
    // Applies the SG -> US reroute (see ebayMarket): the URL's own host is
    // swapped to the site whose mkrid/siteid we're actually tagging it with,
    // so the three never disagree with each other. A no-op for every other
    // market, since realHost already equals the URL's own (www-stripped) host.
    if (u.hostname.replace(/^www\./i, "").toLowerCase() !== m.realHost) {
      u.hostname = `www.${m.realHost}`;
    }
    u.searchParams.set("mkevt", "1"); // marks the click as a tracked EPN event (required)
    u.searchParams.set("mkcid", "1"); // channel: eBay Partner Network
    u.searchParams.set("mkrid", m.mkrid); // marketplace rotation id
    u.searchParams.set("siteid", m.siteid);
    u.searchParams.set("campid", EBAY_CAMPAIGN_ID);
    u.searchParams.set("toolid", "10001");
    // ── LINK SHAPE IS PART OF THE SUB-ID ────────────────────────────────────
    // An eBay outbound link is one of two very different things, and until now
    // EPN could not tell them apart:
    //   • an ITEM link  (/itm/<id>) — the buyer lands on the exact card they
    //     were looking at, one click from checkout;
    //   • a SEARCH link (/sch/i.html?_nkw=…) — they land on a result list and
    //     have to find it themselves, if it is even there.
    // Those should not convert alike, but with both reporting the same customid
    // there was no way to prove it either way — which is exactly the question
    // asked when US conversion (0.78%) was compared against AU (3%).
    //
    // Derived from the URL rather than passed in by callers, deliberately:
    // there are eight separate places that build eBay links, and a parameter
    // every one of them had to remember to set correctly would be wrong
    // somewhere within a month. The URL cannot lie about its own shape.
    const shape = /\/itm\//.test(u.pathname) ? "product" : /\/sch\//.test(u.pathname) ? "search" : null;
    u.searchParams.set("customid", affiliateSubId(m.customid, source, shape));
    return u.toString();
  } catch {
    return url;
  }
}

// The eBay marketplace a given RiftCompare market shops on.
// SG is left as "ebay.com.sg" here too — this is the LOGICAL site the market
// shops on, not necessarily where a link actually ends up; ebayAffiliateUrl's
// SG reroute (see ebayMarket above) is what actually redirects it onto
// ebay.com before tagging, since that happens for BOTH a URL built from this
// map (a search link) and a real listing URL the Browse API hands back
// directly. Keeping the reroute in that one place, rather than also baking
// it in here, means there's exactly one spot that needs to know Singapore has
// no EPN program — not two that could drift apart.
//
// This map lives here, beside ebayAffiliateUrl, because four components had
// grown their own private copy of it (EbayBuyCta, EbayAd, PartnersStrip,
// ArticleShopStrip) and they had already drifted: EbayAd's copy was missing
// SG and CA, so those markets were being sent to ebay.com.au. A map that
// eight surfaces need is a shared fact, not eight local constants.
const EBAY_DOMAIN: Record<string, string> = {
  AU: "ebay.com.au",
  US: "ebay.com",
  UK: "ebay.co.uk",
  SG: "ebay.com.sg",
  CA: "ebay.ca",
};

export function ebayDomain(country: string): string {
  return EBAY_DOMAIN[country] ?? EBAY_DOMAIN.US;
}

// Human-readable label for "which eBay am I searching" copy. Deliberately NOT
// derived from EBAY_DOMAIN: SG's logical domain is still ebay.com.sg (above),
// but the link a Singapore visitor actually lands on is ebay.com (see the SG
// reroute), so a "Singapore" label would claim a site the click never visits.
// Unqualified "eBay" is what US already uses for the same site, so SG reuses
// it verbatim rather than inventing a third phrasing for one destination.
const EBAY_LABEL: Record<string, string> = {
  AU: "eBay Australia",
  US: "eBay",
  UK: "eBay UK",
  SG: "eBay",
  CA: "eBay Canada",
};

export function ebayLabel(country: string): string {
  return EBAY_LABEL[country] ?? EBAY_LABEL.US;
}

// An affiliate-tagged eBay SEARCH on the visitor's own marketplace. `source` is
// the placement segment that reaches EPN's customid (see affiliateSubId above),
// so reports can answer "which surface earned?" rather than only "did eBay
// earn?" — pass one at every call site.
export function ebaySearchUrl(country: string, query: string, source?: string): string {
  const url = `https://www.${ebayDomain(country)}/sch/i.html?_nkw=${encodeURIComponent(query)}`;
  return ebayAffiliateUrl(url, source);
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
  if (!url) return "#";
  // `subId` is the retailer key the caller already had ("ebay_us", "tcgplayer",
  // "amazon_sealed"); `loc` is the page it was rendered on. Both were previously
  // accepted and thrown away (`void subId; void loc;`), which is why every click
  // reported one undifferentiated id. They now reach the networks.
  //
  // Only the PATH of `loc` is used: a full URL would blow the sub-id length and
  // leak query strings into a third party's reports.
  const page = (() => {
    try {
      return new URL(loc, SITE_URL).pathname.split("/").filter(Boolean)[0] ?? "home";
    } catch {
      return undefined;
    }
  })();
  try {
    const u = new URL(url);
    if (/(?:^|\.)ebay\./i.test(u.hostname)) {
      return ebayAffiliateUrl(url, affiliateSubId(subId, page));
    }
    if (/(?:^|\.)amazon\./i.test(u.hostname)) {
      u.searchParams.set("tag", AMAZON_ASSOCIATE_TAG);
      // Amazon's own sub-tag field. Associates reports break it out per ascsubtag.
      u.searchParams.set("ascsubtag", affiliateSubId(subId, page));
      return u.toString();
    }
    // TCGplayer via Impact — only once an approved deep-link base is configured.
    // `sharedid` is Impact's sub-id field; it shows up as "SubId1"/"Shared ID" in
    // the TCGplayer partner reports, so placements are comparable to eBay's.
    if (TCGPLAYER_IMPACT_LINK && /(?:^|\.)tcgplayer\.com$/i.test(u.hostname)) {
      return (
        `${TCGPLAYER_IMPACT_LINK}?u=${encodeURIComponent(url)}` +
        `&sharedid=${encodeURIComponent(affiliateSubId(subId, page))}`
      );
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

// Is this outbound URL ACTUALLY monetised — i.e. did affiliateUrl() do something to
// it, or would it fall through untouched? Mirrors the three live branches in
// affiliateUrl() above (eBay / Amazon / TCGplayer) plus DIRECT_PROGRAMS, which is
// checked structurally so a store added there is automatically covered without a
// second hand-maintained list. Used to gate a per-link "Paid link" disclosure: with
// DIRECT_PROGRAMS empty today, the ~60 Shopify store links earn nothing, and
// labelling every row "Paid link" regardless would over-disclose on the majority of
// rows — the FTC concern this exists to address is UNDER-disclosure, not padding
// every link with a label that isn't true for it.
export function isPaidLink(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    const u = new URL(href);
    if (/(?:^|\.)ebay\./i.test(u.hostname)) return true;
    if (/(?:^|\.)amazon\./i.test(u.hostname)) return true;
    if (TCGPLAYER_IMPACT_LINK && /(?:^|\.)tcgplayer\.com$/i.test(u.hostname)) return true;
    return directProgramUrl(u) != null;
  } catch {
    return false;
  }
}
