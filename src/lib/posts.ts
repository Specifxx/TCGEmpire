// Blog content comes from the hand-written file articles (lib/articles.ts),
// presented as the Article shape the blog list and ArticleView render.
//
// The auto-generated daily "market report" feature has been removed: its
// generator was deleted earlier, and the read-side (and the RiftCompare Index it
// summarised) is now gone too. The ~130 legacy MarketReport rows are left dormant
// in the database but are no longer read or served anywhere.
import { ARTICLES, getArticle, type Article } from "./articles";

// All hand-written blog posts, newest first. Feeds the public /blog list, the
// RSS/JSON feeds and the Google News sitemap.
export async function getBlogPosts(): Promise<Article[]> {
  // `!a.draft`: this feeds /blog, the RSS/JSON feeds and the Google News
  // sitemap, and an unfinished post must not reach any of them.
  return ARTICLES.filter((a) => a.category === "blog" && !a.draft).sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Resolve a single blog post by slug.
export async function getBlogPost(slug: string): Promise<Article | null> {
  const file = getArticle(slug);
  return file && file.category === "blog" ? file : null;
}
