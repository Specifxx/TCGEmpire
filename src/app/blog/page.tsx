import type { Metadata } from "next";
import { getArticles } from "@/lib/articles";
import { ArticleList } from "@/components/ArticleList";
import { WipBanner } from "@/components/WipBanner";

export const metadata: Metadata = {
  title: "Riftbound Blog — News, Meta & Set Updates (Australia)",
  description:
    "News, metagame snapshots and updates for Riftbound: League of Legends TCG, written for Australian players by RiftCompare.",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  const articles = getArticles("blog");
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-white">Blog</h1>
        <p className="mt-1 text-sm text-slate-400">
          News, meta snapshots and updates for Riftbound in Australia.
        </p>
      </div>
      <WipBanner />
      <ArticleList articles={articles} basePath="/blog" />
    </div>
  );
}
