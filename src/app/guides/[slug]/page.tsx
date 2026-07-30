import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArticle, getArticles } from "@/lib/articles";
import { ArticleView } from "@/components/ArticleView";
import { buildTitle, buildDescription } from "@/lib/seo-meta";

export function generateStaticParams() {
  return getArticles("guide").map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const a = getArticle(params.slug);
  if (!a || a.category !== "guide") notFound(); // real 404 — metadata resolves before streaming
  // Hand-authored titles/excerpts have no shorter fallback phrasing to step
  // down to, so a single-candidate ladder — buildTitle/buildDescription still
  // cap them (dropping the suffix, then clamping) rather than let a long one
  // through untouched.
  const description = buildDescription([a.excerpt]);
  return {
    title: buildTitle([a.title], " — RiftCompare Guides"),
    description,
    alternates: { canonical: `/guides/${a.slug}` },
    openGraph: {
      type: "article",
      title: a.title,
      description,
      publishedTime: a.date,
      authors: [a.author],
    },
  };
}

export default function GuideArticlePage({ params }: { params: { slug: string } }) {
  const a = getArticle(params.slug);
  if (!a || a.category !== "guide") notFound();
  return <ArticleView article={a} />;
}
