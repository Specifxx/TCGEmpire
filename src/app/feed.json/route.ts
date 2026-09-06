import { getArticles } from "@/lib/articles";
import { getBlogPosts } from "@/lib/posts";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// JSON Feed 1.1 (jsonfeed.org) — the machine-readable companion to /feed.xml, easier
// for agents and modern readers to parse than RSS. Same content: blog posts (incl.
// the daily market reports) + guides, newest first.
// ISR: 24 hours; purged on demand by the price importer (lib/revalidate-content.ts).
// It was 600, which regenerated this 144x a day to publish a feed whose contents
// only change when an article ships (a deploy) or the importer runs.
export const revalidate = 86400;

export async function GET() {
  const [blog, guides] = [await getBlogPosts(), getArticles("guide")];
  const articles = [...blog, ...guides].sort((a, b) => (a.date < b.date ? 1 : -1));

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: `${SITE_NAME} — Riftbound Blog & Guides`,
    home_page_url: `${SITE_URL}/blog`,
    feed_url: `${SITE_URL}/feed.json`,
    description:
      "News, guides, metagame snapshots and price insights for Riftbound: League of Legends TCG, from RiftCompare.",
    language: "en-au",
    items: articles.map((a) => {
      const url = `${SITE_URL}/${a.category === "guide" ? "guides" : "blog"}/${a.slug}`;
      return {
        id: url,
        url,
        title: a.title,
        summary: a.excerpt,
        content_text: a.excerpt,
        date_published: new Date(`${a.date}T09:00:00+10:00`).toISOString(),
        authors: [{ name: a.author }],
        tags: [a.category],
      };
    }),
  };

  return Response.json(feed, {
    headers: { "Content-Type": "application/feed+json; charset=utf-8", "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200" },
  });
}
