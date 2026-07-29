import { getPriceDay, getEditorialDates } from "@/lib/sitemap-data";
import { SITE_URL } from "@/lib/site";

// /sitemap.xml is now a <sitemapindex> pointing at the 7 section sitemaps under
// /sitemaps/*/sitemap.xml (src/app/sitemaps/*), instead of one flat 1,641-URL
// file — that made per-section indexation impossible to monitor in Search
// Console. The URL stays the same; only the format changes from <urlset> to
// <sitemapindex>. robots.txt's `Sitemap: .../sitemap.xml` line needs no change.
export const revalidate = 86400;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Each child sitemap's own query already computes its real lastModified; rather
// than re-running every section's full query set just to label the index (cards,
// champions, etc. would all get queried twice per crawl), reuse the same cheap
// shared signals here: the one priceDay lookup covers every price-bearing
// section, and the editorial date is derived from local article data (no DB).
export async function GET() {
  const priceDay = await getPriceDay();
  const { guide: latestGuide, blog: latestBlog } = getEditorialDates();
  const editorialDate = new Date(Math.max(latestGuide.getTime(), latestBlog.getTime()));

  const children: { path: string; lastModified?: Date }[] = [
    { path: "/sitemaps/core/sitemap.xml", lastModified: priceDay },
    { path: "/sitemaps/cards/sitemap.xml", lastModified: priceDay },
    { path: "/sitemaps/champions/sitemap.xml", lastModified: priceDay },
    { path: "/sitemaps/sets-domains-keywords/sitemap.xml", lastModified: priceDay },
    { path: "/sitemaps/stores/sitemap.xml", lastModified: priceDay },
    { path: "/sitemaps/decks/sitemap.xml", lastModified: priceDay },
    { path: "/sitemaps/editorial/sitemap.xml", lastModified: editorialDate },
  ];

  const body = children
    .map(
      (c) => `  <sitemap>
    <loc>${esc(SITE_URL + c.path)}</loc>${c.lastModified ? `\n    <lastmod>${c.lastModified.toISOString()}</lastmod>` : ""}
  </sitemap>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
