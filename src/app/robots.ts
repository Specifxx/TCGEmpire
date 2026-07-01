import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

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
];

// Bulk scrapers that DON'T cite back (Common Crawl feeds many models second-hand;
// ByteDance/Meta agents don't send referral traffic) — no upside, so blocked.
const BLOCKED_BOTS = ["CCBot", "Bytespider", "meta-externalagent", "Meta-ExternalAgent"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Allow the public data API (/api/v1/*) for everyone — it carries an
        // `X-Robots-Tag: noindex` header so it's fetchable by agents/dashboards but
        // never indexed as a page. Everything else under /api/ stays blocked.
        allow: ["/", "/api/v1/"],
        // Block ONLY machine endpoints. Account/utility/admin PAGES are kept out
        // of the index with a `noindex` meta tag instead of a robots Disallow —
        // because a Disallow stops Google from ever crawling the page, so it never
        // SEES the noindex. That mismatch is exactly what produced the Search
        // Console "Blocked by robots.txt" and "Indexed, though blocked by
        // robots.txt" buckets. Leaving these pages crawlable lets Google read the
        // noindex and drop them cleanly (as "Excluded by noindex tag").
        disallow: ["/api/"],
      },
      {
        // AI citation/search crawlers: public content + the agent-readable surfaces.
        // Allow /api/v1/ (the public data API) and llms.txt; keep the rest of /api/
        // (auth/account/machine routes) blocked — Allow is more specific, so it wins.
        userAgent: CITATION_BOTS,
        allow: ["/", "/api/v1/", "/llms.txt", "/llms-full.txt"],
        disallow: ["/api/"],
      },
      {
        // Non-citing bulk scrapers: no crawl.
        userAgent: BLOCKED_BOTS,
        disallow: "/",
      },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
    // NOTE: no `host` directive — it's non-standard (Bing/Google ignore it);
    // host canonicalisation is handled by 301 redirects, not robots.txt.
  };
}
