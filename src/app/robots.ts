import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { SECTIONS } from "@/lib/sitemap-sections";

// Citation / answer-engine crawlers we WANT: they read a page and cite/link back
// (referral traffic + AI-answer visibility). Allowed on all public content plus the
// machine-readable surfaces (the JSON data API, llms.txt). GPTBot/ClaudeBot also
// train on the content, which helps the brand become a "known" entity.
const CITATION_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "Google-Extended",
  "Applebot-Extended",
  "cohere-ai",
  "Amazonbot",
  // CCBot (Common Crawl) was previously in BLOCKED_BOTS on the reasoning that it
  // sends no referral traffic. That reasoning is right about referrals and wrong
  // about the goal: Common Crawl is a primary corpus for a large share of the
  // models that answer "which Riftbound price comparison site should I use", and
  // being absent from it is a direct cause of being absent from those answers.
  // With AI visibility measured at ~20% (mentioned in 2 of 10 LLM answers) and a
  // competitor leading, second-hand inclusion is worth more than the crawl budget
  // it costs. Reverse this only if the visibility number stops mattering.
  "CCBot",
];

// Bulk scrapers that neither cite back nor feed a corpus anyone answers from —
// no upside, so blocked. The second line (2026-10-16) is backlink, data and
// minor-engine crawlers: they render page after page of the long tail for
// someone else's index and send no visitors. AhrefsBot and SemrushBot stay
// allowed (the owner's own SEO tools; tests/critical-path.test.ts). A bot that
// ignores robots.txt needs the Vercel Firewall instead (DECISIONS.md, "The
// import stops purging pages the files serve").
const BLOCKED_BOTS = [
  "Bytespider", "meta-externalagent", "Meta-ExternalAgent",
  "MJ12bot", "DotBot", "PetalBot", "DataForSeoBot", "BLEXBot", "Barkrowler", "serpstatbot", "SeekportBot", "ImagesiftBot", "Timpibot",
];

// QUERY-STRING URLS ARE NOT CRAWLED (2026-10-16). No sitemap URL carries a
// query string, and every page that reads one (/browse, /sealed, /price-guide,
// /market, /auctions, /sets/[set] filters, the tools) canonicalises to its
// clean URL, so a crawler walking ?sort= / ?page= / ?utm_ variants only buys
// renders and cache writes. The ALLOWS keep what a crawler needs that does
// carry a query: Next's assets (?dpl=, without them Google cannot render a
// page), the share images (og:image is ".../opengraph-image?<hash>", and
// Twitterbot obeys robots.txt) and the icons. The longest matching rule wins,
// so each Allow beats "/*?".
const QUERY_DISALLOW = "/*?";
const QUERY_ALLOWS = ["/_next/", "/*opengraph-image", "/*twitter-image", "/icon", "/apple-icon"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Allow the public data API (/api/v1/*) for everyone — it carries an
        // `X-Robots-Tag: noindex` header so it's fetchable by agents/dashboards but
        // never indexed as a page. Everything else under /api/ stays blocked.
        allow: ["/", "/api/v1/", ...QUERY_ALLOWS],
        // Block ONLY machine endpoints. Account/utility/admin PAGES are kept out
        // of the index with a `noindex` meta tag instead of a robots Disallow —
        // because a Disallow stops Google from ever crawling the page, so it never
        // SEES the noindex. That mismatch is exactly what produced the Search
        // Console "Blocked by robots.txt" and "Indexed, though blocked by
        // robots.txt" buckets. Leaving these pages crawlable lets Google read the
        // noindex and drop them cleanly (as "Excluded by noindex tag").
        disallow: ["/api/", QUERY_DISALLOW],
      },
      {
        // AI citation/search crawlers: public content + the agent-readable surfaces.
        // Allow /api/v1/ (the public data API) and llms.txt; keep the rest of /api/
        // (auth/account/machine routes) blocked — Allow is more specific, so it wins.
        userAgent: CITATION_BOTS,
        allow: ["/", "/api/v1/", "/llms.txt", "/llms-full.txt", ...QUERY_ALLOWS],
        disallow: ["/api/", QUERY_DISALLOW],
      },
      {
        // Non-citing bulk scrapers: no crawl.
        userAgent: BLOCKED_BOTS,
        disallow: "/",
      },
    ],
    // /sitemap.xml is a sitemap INDEX pointing at one child per section
    // (see lib/sitemap-sections.ts). Listing the children here as well is
    // redundant for discovery — Google follows the index — but it costs nothing
    // and means a crawler that mishandles indexes still finds every section.
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      ...SECTIONS.map((id) => `${SITE_URL}/sitemaps/${id}.xml`),
      `${SITE_URL}/news-sitemap.xml`,
    ],
    // NOTE: no `host` directive — it's non-standard (Bing/Google ignore it);
    // host canonicalisation is handled by 301 redirects, not robots.txt.
  };
}
