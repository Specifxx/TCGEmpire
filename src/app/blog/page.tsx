import type { Metadata } from "next";
import { getBlogPosts } from "@/lib/posts";
import { ensureMarketReport } from "@/lib/market-report";
import { ArticleList } from "@/components/ArticleList";

// Revalidate often enough that a freshly-generated daily report appears promptly.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Riftbound Blog — News, Meta & Daily Market Reports",
  description:
    "News, metagame snapshots, buying guides and the automated daily Riftbound market report from RiftCompare — the RiftCompare Index, region by region.",
  alternates: { canonical: "/blog" },
};

export default async function BlogPage() {
  // Self-heal: make sure today's market report exists even if the cron hasn't
  // fired yet (best-effort — never block or break the page over it).
  await ensureMarketReport().catch(() => {});
  const articles = await getBlogPosts();
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-white">Blog</h1>
        <p className="mt-1 text-sm text-slate-400">
          News, meta snapshots, buying guides and the daily Riftbound market report.
        </p>
      </div>
      <ArticleList articles={articles} basePath="/blog" />
    </div>
  );
}
