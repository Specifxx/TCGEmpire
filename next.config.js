/** @type {import('next').NextConfig} */

// An ENFORCING Content-Security-Policy is still deliberately omitted: a wrong one
// silently breaks ads/affiliates, so it must be tuned in Report-Only first (below).
// The Report-Only policy reports violations without blocking anything, so we can
// watch the report stream and promote a verified policy to enforcing later.
//
// NOTHING HERE MAY EVER BLOCK GOOGLE'S AD OR CONSENT ORIGINS. Even in
// Report-Only — which by definition blocks nothing — the allow-list is kept
// correct and complete, so that promoting this policy to enforcing later cannot
// silently kill ad delivery or the EEA/UK/CH consent message. The origin lists
// below mirror ADSENSE_SCRIPT_ORIGINS / _FRAME_ / _CONNECT_ in
// src/lib/adsense.ts; scripts/adsense-guard.ts asserts every one of them still
// appears in this file, so the two can't drift.
//
// Allow-list rationale (third parties that actually load on the site):
//  • Google AdSense delivery + Privacy & Messaging (see the ADS_* lists below)
//  • Vercel Analytics + Speed Insights (va.vercel-scripts.com, *.vercel-insights.com)
//  • Card art CDN (cdn.riftscribe.gg) + sealed/marketplace product images
//  • TCGplayer + eBay affiliate banners (partner.tcgplayer.com, *.ebay.com)
// 'unsafe-inline' is permitted for script/style because Next streams inline
// hydration scripts and the JSON-LD blocks; a nonce-based policy is a later step.
// (Google's ad tags also inject inline script, so 'unsafe-inline' is a hard
// requirement for AdSense specifically, not just a Next convenience.)
const ADS_SCRIPT_SRC = [
  "https://pagead2.googlesyndication.com",
  "https://partner.googleadservices.com",
  "https://tpc.googlesyndication.com",
  "https://googleads.g.doubleclick.net",
  "https://fundingchoicesmessages.google.com",
  "https://www.googletagservices.com",
  "https://adservice.google.com",
];
const ADS_FRAME_SRC = [
  "https://googleads.g.doubleclick.net",
  "https://tpc.googlesyndication.com",
  "https://www.google.com",
  "https://fundingchoicesmessages.google.com",
];
const ADS_CONNECT_SRC = [
  "https://pagead2.googlesyndication.com",
  "https://googleads.g.doubleclick.net",
  "https://tpc.googlesyndication.com",
  // Google's ad-traffic-quality beacons. Blocking these degrades invalid-traffic
  // detection, which shows up as an account-health problem rather than a visible
  // breakage — the worst kind to miss.
  "https://ep1.adtrafficquality.google",
  "https://ep2.adtrafficquality.google",
  "https://fundingchoicesmessages.google.com",
  "https://csi.gstatic.com",
];

const cspReportOnly = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://*.vercel-insights.com ${ADS_SCRIPT_SRC.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  // Ad creatives and tracking pixels come from arbitrary advertiser domains, so
  // img-src must stay open to https: — narrowing it would blank creatives.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.vercel-insights.com https://vitals.vercel-insights.com https://cdn.riftscribe.gg ${ADS_CONNECT_SRC.join(" ")}`,
  // Ads render inside cross-origin iframes; the consent message does too.
  `frame-src 'self' https: ${ADS_FRAME_SRC.join(" ")}`,
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Baseline security headers applied to every response. These are safe defaults
// that don't depend on the page's content.
const securityHeaders = [
  // Force HTTPS for two years, including subdomains. Vercel serves HTTPS already;
  // this tells browsers to never even attempt plain HTTP.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Don't let browsers MIME-sniff responses into a different content type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Clickjacking protection: only this origin may frame the site.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Don't leak full URLs (incl. any ?key=… tokens) to third parties via Referer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // We don't use these device APIs — deny them.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Report-only CSP: surfaces violations without blocking, so it can be tuned
  // before being promoted to an enforcing Content-Security-Policy.
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // Confirmed 404 in Search Console: an incomplete/truncated deck slug (the
      // real deck is "master-yi-wuju-bladesman" in prisma/meta-decks.json). A 301
      // tells Google the old URL is permanently gone rather than leaving a dead
      // page indexed.
      {
        source: "/decks/master-yi-wuju",
        destination: "/decks/master-yi-wuju-bladesman",
        permanent: true,
      },
      // Retired the /card-value lander — the card database is the real value
      // checker. 301 so any indexed/inbound links flow to /browse instead of 404ing.
      {
        source: "/card-value",
        destination: "/browse",
        permanent: true,
      },
      // Retired the proxy printer entirely (thin/low-value utility page, part of
      // the AdSense Publisher Policy remediation). 301 any indexed/inbound links
      // (incl. ?list= shares) to the deck pricer, its nearest surviving equivalent.
      {
        source: "/proxy",
        destination: "/deck",
        permanent: true,
      },
      // Retired the daily-market-wrap archive and stopped generating new auto-
      // reports entirely (see lib/market-report.ts) — a run of near-identical
      // templated pages, one per day forever, was exactly the "scaled content
      // abuse" shape putting the AdSense application at risk. 301 to the real
      // Index tool rather than 404ing any indexed/inbound links.
      {
        source: "/market/wrap",
        destination: "/market",
        permanent: true,
      },
      // CONSOLIDATION (AdSense remediation § Phase 12b). "Where to Buy Riftbound
      // Cards in Australia" was a 294-word guide whose entire topic is covered —
      // and covered far better — by the 1,100-word multi-market guide it linked
      // to twice in its own body. Its one genuinely unique section (why we always
      // request each store's local-currency price) has been merged into the
      // target, so nothing is lost; a 301 keeps its link equity and any bookmark
      // working. The AU-specific /blog/buy-riftbound-cards-australia post stays —
      // it is a different, live-data-backed piece, not a duplicate.
      {
        source: "/guides/where-to-buy-riftbound-australia",
        destination: "/guides/where-to-buy-riftbound-cards",
        permanent: true,
      },
      // The tool is called "Deal Finder" in its own H1, nav entry, metadata and
      // every internal link — only the URL still said "arbitrage", a word no
      // buyer searches for. Renamed to /tools/deal-finder; this 301 preserves
      // the indexed URL's link equity and keeps any bookmarks/inbound links
      // working. Next.js carries the query string across automatically, so the
      // ?view=/?buy=/?sort=/?page= deep links survive the redirect.
      {
        source: "/tools/arbitrage",
        destination: "/tools/deal-finder",
        permanent: true,
      },
      // SHORT URLs the editorial content asks for. The 2026 content pack's
      // articles were briefed to link to "/deals (deal finder)" and to
      // "/guides/us", "/guides/uk" … — neither shape exists as a route, and
      // both name a page that DOES exist under a different URL. Minting real
      // pages at these paths would create duplicate content competing with the
      // originals, so each is a 301 to the canonical page instead. The article
      // bodies link straight to the canonical URL (no redirect hop); these
      // exist so the short URL a reader types, or an inbound link uses, still
      // lands somewhere correct.
      { source: "/deals", destination: "/tools/deal-finder", permanent: true },
      { source: "/guides/us", destination: "/blog/buy-riftbound-cards-us", permanent: true },
      { source: "/guides/uk", destination: "/blog/buy-riftbound-cards-uk", permanent: true },
      { source: "/guides/au", destination: "/blog/buy-riftbound-cards-australia", permanent: true },
      { source: "/guides/nz", destination: "/blog/buy-riftbound-cards-nz", permanent: true },
      { source: "/guides/ca", destination: "/blog/buy-riftbound-cards-canada", permanent: true },
      { source: "/guides/sg", destination: "/blog/riftbound-price-comparison-singapore", permanent: true },
      // The watchlist/alerts explainer lives at /alerts; /watchlist is the other
      // word people type for it.
      { source: "/watchlist", destination: "/alerts", permanent: true },
      // RETIRED COUNTDOWN. /vendetta-countdown existed to answer "when does
      // Vendetta release"; it released on 31 Jul 2026, so the page had already
      // been rewritten into the past tense and was, by then, a worse version of
      // /sets/vendetta — which answers the same question and also shows prices.
      // Replaced by /radiance-countdown, the countdown for the set that is
      // actually upcoming.
      //
      // 301, NOT 404: "riftbound vendetta release date" is one of the highest-
      // volume queries in this niche and the URL carried ~35 internal links.
      // Sending it to the set page keeps that equity on a page that still
      // answers the query, instead of dropping it on the floor.
      { source: "/vendetta-countdown", destination: "/sets/vendetta", permanent: true },
    ];
  },
  async headers() {
    return [
      // Embeddable price widget (/embed/*): must be frameable on ANY third-party
      // site, so it can't carry X-Frame-Options: SAMEORIGIN. Allow cross-origin
      // framing via CSP frame-ancestors while keeping the other safe defaults.
      {
        source: "/embed/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // Everything else keeps the clickjacking-protective defaults (negative
      // lookahead so this rule never double-sets headers on /embed/*).
      { source: "/((?!embed/).*)", headers: securityHeaders },
    ];
  },
};

module.exports = nextConfig;
