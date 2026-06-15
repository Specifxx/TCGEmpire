import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Block ONLY machine endpoints. Account/utility/admin PAGES are kept out
        // of the index with a `noindex` meta tag instead of a robots Disallow —
        // because a Disallow stops Google from ever crawling the page, so it never
        // SEES the noindex. That mismatch is exactly what produced the Search
        // Console "Blocked by robots.txt" and "Indexed, though blocked by
        // robots.txt" buckets. Leaving these pages crawlable lets Google read the
        // noindex and drop them cleanly (as "Excluded by noindex tag").
        disallow: ["/api/"],
      },
      // Google's AdSense crawler must be able to fetch ANY page that shows ads
      // (every page does, via the layout banner) to assess ad context — even
      // pages we keep out of the search index.
      { userAgent: "Mediapartners-Google", allow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
