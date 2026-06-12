/** @type {import('next').NextConfig} */

// Baseline security headers applied to every response. These are safe defaults
// that don't depend on the page's content. A Content-Security-Policy is
// deliberately omitted here: a strict CSP needs per-app tuning (Next.js inline
// hydration scripts, Vercel Analytics/Speed Insights, the external image CDNs)
// and a wrong one silently breaks the site — add it separately once tested.
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
];

const nextConfig = {
  reactStrictMode: true,
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
