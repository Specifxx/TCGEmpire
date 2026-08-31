import type { Metadata } from "next";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { notFound } from "next/navigation";
import { getArticle, getArticles } from "@/lib/articles";
import { getBlogPost } from "@/lib/posts";
import { ArticleView } from "@/components/ArticleView";
import { SITE_URL } from "@/lib/site";
import { clampText } from "@/lib/format";
import { hreflangForCountryGuide, pageAlternates, pageOpenGraph } from "@/lib/seo";

// Soft cap at generation time — belt-and-suspenders alongside actually keeping
// each post's own `excerpt` under this length (see lib/articles.ts). An SEO
// audit found 19 of 36 published posts' excerpts rendering straight into
// <meta name="description"> past Google's ~155-160 char SERP truncation point
// (as long as 246 chars) with nothing to catch it — this is that catch, so a
// future post can't silently reintroduce the same bug just by writing a long
// excerpt. clampText is shared with card/[id]/page.tsx, which needed the
// identical truncate-on-a-word-boundary rule for the same reason.
const DESCRIPTION_MAX = 155;

// Pre-render the file-based posts.
// ISR: 24 hours, with the price importer's /api/revalidate POST purging this
// path outright at the end of every run (see lib/revalidate-content.ts).
//
// It was 600. Nothing here changes on a ten-minute clock: the prose is compiled
// into the bundle, so an edit ships with a deploy, and the only live data is the
// embedded card galleries, which move when the importer runs. The short TTL was
// compensating for these routes being absent from the on-demand purge list —
// they are on it now, so freshness went UP (immediate on import, not up to ten
// minutes late) while regenerations went from 144 a day to 1.
//
// Across 56 posts + 38 guides that is ~13,500 renders a day, each re-running its
// article's embed queries against Neon, replaced by ~2. See the egress rules at
// the top of lib/db.ts for why that matters here specifically.
export const revalidate = 86400;

export function generateStaticParams() {
  return getArticles("blog").map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const a = await getBlogPost(params.slug);
  if (!a) return notFoundMetadata("Post");
  // A DRAFT is noindexed: it is reachable by direct URL so it can be reviewed,
  // but it must not be indexed while it still has unverified content in it.
  const isDraft = !!getArticle(params.slug)?.draft;
  const description = clampText(a.excerpt, DESCRIPTION_MAX);
  return {
    // " — RiftCompare", not " — RiftCompare Blog": matches the suffix every
    // other indexed page on the site uses (the root layout's title template,
    // and TITLE_SUFFIX in lib/deck-groups.ts). The extra " Blog" cost every
    // rendered <title> 5 more characters for a distinction the URL (/blog/…)
    // and the page's own content already make — on a site where article
    // titles are already long, that was enough on its own to push a lot of
    // otherwise-fine titles past Google's ~60-char SERP truncation point.
    title: { absolute: `${a.title} — RiftCompare` },
    description,
    ...(isDraft ? { robots: { index: false, follow: true } } : {}),
    alternates: pageAlternates(`/blog/${a.slug}`, {
      types: { "text/markdown": `${SITE_URL}/llm/blog/${a.slug}` },
      // The six country buying guides are the ONE place on this site where
      // per-market hreflang is honest: each is a separately-indexable page about
      // buying in one market, in that market's currency, and they are genuine
      // alternates of each other. Everywhere else the market is a cookie over a
      // single URL set, so pageAlternates() falls back to x-default only.
      ...(hreflangForCountryGuide(a.slug) ? { languages: hreflangForCountryGuide(a.slug)! } : {}),
    }),
    openGraph: pageOpenGraph({
      type: "article",
      title: a.title,
      description: a.excerpt,
      url: `/blog/${a.slug}`,
      publishedTime: a.date,
      modifiedTime: a.updated ?? a.date,
      authors: [a.author],
      ...(a.hero ? { images: [a.hero.src.startsWith("http") ? a.hero.src : `${SITE_URL}${a.hero.src}`] } : {}),
    }),
  };
}

export default async function BlogArticlePage({ params }: { params: { slug: string } }) {
  // File-based editorial posts render as plain articles. Anything else (including
  // the retired auto-generated market-report slugs) is not found.
  const file = getArticle(params.slug);
  if (file && file.category === "blog") return <ArticleView article={file} />;
  notFound();
}
