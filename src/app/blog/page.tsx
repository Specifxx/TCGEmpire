import type { Metadata } from "next";
import { getBlogPosts, getLatestMarketReport } from "@/lib/posts";
import { ensureMarketReport } from "@/lib/market-report";
import { FilterableArticles, type ArticleSection } from "@/components/FilterableArticles";
import { DailyWrapHero } from "@/components/DailyWrapHero";
import { SITE_URL } from "@/lib/site";

// Curated from real traffic (30-day Top Pages), not a live/self-updating ranking —
// the Vendetta card-gallery post alone outdrew every other blog post combined.
const FEATURED_POSTS = [
  "every-riftbound-vendetta-card-revealed",
  "riftbound-vendetta-new-mechanics-flow-burn-empower",
  "unleashed-meta-snapshot-june-2026",
];

const BLOG_SECTIONS: ArticleSection[] = [
  { title: "Vendetta News & Spoilers", accent: "#34d17e", tags: ["vendetta"] },
  {
    title: "Getting Started & Selling",
    accent: "#06b6d4",
    tags: ["beginners", "opinion", "selling", "marketplace", "about", "tips"],
  },
  {
    title: "Where to Buy & Market Updates",
    accent: "#eab308",
    tags: ["buying guide", "price comparison", "movers", "investing", "buying", "singles", "sealed"],
  },
  // Auto-generated daily/weekly wraps (lib/posts.ts's reportToArticle) always carry
  // exactly this tag — matched on it alone since it's unique to them, so a hand-
  // written post's own "prices"/"market" tags never get swept in here by mistake.
  // Capped: the full history already has its own archive at /market/wrap.
  {
    title: "Daily Market Reports",
    accent: "#64748b",
    tags: ["market report"],
    cap: 3,
    moreHref: "/market/wrap",
    moreLabel: "See the full market wrap archive →",
  },
];

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
      <FilterableArticles articles={rest} basePath="/blog" sections={BLOG_SECTIONS} featured={FEATURED_POSTS} />
    </div>
  );
}
