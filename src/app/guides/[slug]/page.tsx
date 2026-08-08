import type { Metadata } from "next";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { notFound } from "next/navigation";
import { getArticle, getArticles } from "@/lib/articles";
import { ArticleView } from "@/components/ArticleView";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

// ISR rather than a pure build-time static render. A guide can now carry a LIVE
// data block (Article.topValue / Article.marketData), and the build sandbox has
// no database — without a revalidate window those blocks would render their
// empty fallback at build time and stay frozen that way until the next deploy.
// Matches /blog/[slug]'s existing 600s.
export const revalidate = 600;

export function generateStaticParams() {
  return getArticles("guide").map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const a = getArticle(params.slug);
  if (!a || a.category !== "guide") return notFoundMetadata("Guide");
  return {
    title: { absolute: `${a.title} — RiftCompare Guides` },
    description: a.excerpt,
    // Reachable by direct URL for review, but never indexed while unfinished.
    ...(a.draft ? { robots: { index: false, follow: true } } : {}),
    alternates: pageAlternates(`/guides/${a.slug}`, {
      // Machine-readable mirror for agents — the counterpart of the one
      // /blog/[slug] and /card/[id] already advertise.
      types: { "text/markdown": `${SITE_URL}/llm/guides/${a.slug}` },
    }),
    openGraph: pageOpenGraph({
      type: "article",
      title: a.title,
      description: a.excerpt,
      url: `/guides/${a.slug}`,
      publishedTime: a.date,
      modifiedTime: a.updated ?? a.date,
      authors: [a.author],
      ...(a.hero ? { images: [`${SITE_URL}${a.hero.src}`] } : {}),
    }),
  };
}

export default function GuideArticlePage({ params }: { params: { slug: string } }) {
  const a = getArticle(params.slug);
  if (!a || a.category !== "guide") notFound();
  return <ArticleView article={a} />;
}
