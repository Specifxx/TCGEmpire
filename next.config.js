/** @type {import('next').NextConfig} */

// An ENFORCING Content-Security-Policy is still deliberately omitted: a wrong one
// silently breaks ads/affiliates, so it must be tuned in Report-Only first (below).
// The Report-Only policy reports violations without blocking anything, so we can
// watch the report stream and promote a verified policy to enforcing later.
//
// Allow-list rationale (third parties that actually load on the site):
//  • Vercel Analytics + Speed Insights (va.vercel-scripts.com, *.vercel-insights.com)
//  • HilltopAds delivery (deliciouslip.com) — the primary ad network
//  • Card art CDN (cdn.riftscribe.gg) + sealed/marketplace product images
//  • TCGplayer + eBay affiliate banners (partner.tcgplayer.com, *.ebay.com)
// 'unsafe-inline' is permitted for script/style because Next streams inline
// hydration scripts and the JSON-LD blocks; a nonce-based policy is a later step.
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://*.vercel-insights.com https://deliciouslip.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.vercel-insights.com https://vitals.vercel-insights.com https://deliciouslip.com https://cdn.riftscribe.gg",
  "frame-src 'self' https:",
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
