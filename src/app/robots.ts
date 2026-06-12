import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep account/utility routes out of the index.
        disallow: ["/api/", "/admin", "/login", "/register", "/profile", "/wishlist", "/sell", "/wanted"],
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
