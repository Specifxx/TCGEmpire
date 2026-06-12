import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArticles } from "@/lib/articles";
import { getBlogPost } from "@/lib/posts";
import { ArticleView } from "@/components/ArticleView";

// Pre-render the file-based posts; DB-backed market reports render on demand
// (dynamicParams defaults to true) and are cached by `revalidate`.
export const revalidate = 600;

export function generateStaticParams() {
  return getArticles("blog").map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const a = await getBlogPost(params.slug);
  if (!a) return { title: "Post not found", robots: { index: false, follow: false } };
  return {
    title: { absolute: `${a.title} — RiftCompare Blog` },
    description: a.excerpt,
    alternates: { canonical: `/blog/${a.slug}` },
    openGraph: {
      type: "article",
      title: a.title,
      description: a.excerpt,
      publishedTime: a.date,
      authors: [a.author],
    },
  };
}

export default async function BlogArticlePage({ params }: { params: { slug: string } }) {
  const a = await getBlogPost(params.slug);
  if (!a) notFound();
  return <ArticleView article={a} />;
}
