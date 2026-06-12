import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArticle, getArticles } from "@/lib/articles";
import { getBlogPost, getMarketReportPost } from "@/lib/posts";
import { ArticleView } from "@/components/ArticleView";
import { MarketReportView } from "@/components/MarketReportView";

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
  // File-based editorial posts render as plain articles.
  const file = getArticle(params.slug);
  if (file && file.category === "blog") return <ArticleView article={file} />;

  // Market reports get the chart-rich view when their payload is stored; rows
  // that predate the charts fall back to the markdown body.
  const report = await getMarketReportPost(params.slug);
  if (!report) notFound();
  return report.data ? (
    <MarketReportView article={report.article} data={report.data} />
  ) : (
    <ArticleView article={report.article} />
  );
}
