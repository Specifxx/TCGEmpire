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
  // Allow the camera for our OWN origin (the /scan card scanner needs it); keep
  // microphone and geolocation denied since we don't use them. NOTE: `camera=()`
  // blocks the camera for everyone INCLUDING us — `camera=(self)` is what permits
  // getUserMedia on our pages.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
