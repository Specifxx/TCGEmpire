import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArticle, getArticles } from "@/lib/articles";
import { ArticleView } from "@/components/ArticleView";

export function generateStaticParams() {
  return getArticles("guide").map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const a = getArticle(params.slug);
  if (!a || a.category !== "guide") notFound(); // real 404 — metadata resolves before streaming
  return {
    title: { absolute: `${a.title} — RiftCompare Guides` },
    description: a.excerpt,
    alternates: { canonical: `/guides/${a.slug}` },
    openGraph: {
      type: "article",
      title: a.title,
      description: a.excerpt,
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
