import { getBlogPosts } from "@/lib/posts";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// Google News-style sitemap: only items published in the last 2 days (the News
// sitemap spec), so genuinely time-sensitive posts (set-launch coverage, etc.)
// get faster, higher-frequency crawls. Referenced from robots.ts alongside the
// main sitemap. getBlogPosts() only returns hand-written posts — auto-generated
// market reports are excluded (see lib/posts.ts).
// ISR: 24 hours; purged on demand by the price importer (lib/revalidate-content.ts).
// It was 600, which regenerated this 144x a day to publish a feed whose contents
// only change when an article ships (a deploy) or the importer runs.
export const revalidate = 86400;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET() {
  const cutoff = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const recent = (await getBlogPosts())
    .filter((a) => a.category === "blog" && a.date >= cutoff)
    .slice(0, 100);

  const urls = recent
    .map((a) => {
      const loc = `${SITE_URL}/blog/${a.slug}`;
      const pub = new Date(`${a.date}T09:00:00+10:00`).toISOString();
      return `  <url>
    <loc>${loc}</loc>
    <news:news>
      <news:publication>
        <news:name>${esc(SITE_NAME)}</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${pub}</news:publication_date>
      <news:title>${esc(a.title)}</news:title>
    </news:news>
  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
