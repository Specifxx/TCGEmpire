import type { Metadata } from "next";
import { getBlogPosts, getLatestMarketReport } from "@/lib/posts";
import { ensureMarketReport } from "@/lib/market-report";
import { FilterableArticles } from "@/components/FilterableArticles";
import { DailyWrapHero } from "@/components/DailyWrapHero";
import { SITE_URL } from "@/lib/site";

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
  const [articles, latestWrap] = await Promise.all([getBlogPosts(), getLatestMarketReport()]);
  // The featured wrap gets the hero slot; don't list it twice.
  const rest = latestWrap ? articles.filter((a) => a.slug !== latestWrap.article.slug) : articles;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
    ],
  };

  const blog = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Riftbound Blog — News, Meta & Daily Market Reports",
    description:
      "News, metagame snapshots, buying guides and the automated daily Riftbound market report from RiftCompare.",
    url: `${SITE_URL}/blog`,
    blogPost: articles.slice(0, 20).map((a) => ({
      "@type": "BlogPosting",
      headline: a.title,
      url: `${SITE_URL}/blog/${a.slug}`,
      description: a.excerpt,
      datePublished: a.date,
      author: { "@type": "Person", name: a.author },
    })),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumb, blog]) }}
      />
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-white">Blog</h1>
        <p className="mt-1 text-sm text-slate-400">
          News, meta snapshots, buying guides and the daily Riftbound market report.
        </p>
      </div>
      {latestWrap && <DailyWrapHero post={latestWrap} />}
      <FilterableArticles articles={rest} basePath="/blog" />
    </div>
  );
}
