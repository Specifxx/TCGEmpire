import Link from "next/link";
import type { Metadata } from "next";
import { getBlogPosts } from "@/lib/posts";
import { FilterableArticles, type ArticleSection } from "@/components/FilterableArticles";
import { SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";

// Curated from real traffic (30-day Top Pages), not a live/self-updating ranking —
// the Vendetta card-gallery post alone outdrew every other blog post combined.
//
// Swapped back to evergreen 25 Aug 2026: the T1 Signature Edition registration
// window (14-17 Aug 2026) that justified featuring the time-boxed drawing post has
// closed, and that post has since been retired — its lasting analysis (scarcity
// math, Player Bundle comparison) was merged into the product explainer below,
// which is what stays featured now. See AdSense remediation Phase 26.
const FEATURED_POSTS = [
  "riftbound-t1-worlds-champion-collection",
  "every-riftbound-vendetta-card-revealed",
  "riftbound-vendetta-new-mechanics-flow-burn-empower",
];

const BLOG_SECTIONS: ArticleSection[] = [
  { title: "Vendetta News & Spoilers", accent: "#34d17e", tags: ["vendetta"] },
  {
    title: "Getting Started & Selling",
    accent: "#06b6d4",
    tags: ["beginners", "opinion", "selling", "about", "tips"],
  },
  {
    title: "Where to Buy & Market Updates",
    accent: "#eab308",
    tags: ["buying guide", "price comparison", "movers", "investing", "buying", "singles", "sealed"],
  },
  // LAST on purpose. Sections claim articles in order and the first match wins,
  // so a broad "news" bucket placed higher would poach from the three topical
  // sections above (the Vendetta launch coverage is all tagged news too). Down
  // here it only picks up what nothing else claimed — which is exactly the
  // announcement coverage that was previously falling into the unlabelled
  // "More" pile: the T1 collection, the LA regional, and the 2026/2027 roadmap
  // and State of the Game posts.
  {
    title: "Game News & Announcements",
    accent: "#a855f7",
    tags: ["news"],
  },
];

// ISR: 24 hours; the price importer purges this index via /api/revalidate
// (lib/revalidate-content.ts), same as the posts it links to. It was 600 for the
// same reason they were — the route was missing from that purge list.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Riftbound Blog — News, Guides & Market Updates",
  description:
    "News, metagame snapshots and buying guides for Riftbound: League of Legends TCG from RiftCompare.",
  alternates: pageAlternates("/blog"),
};

export default async function BlogPage() {
  const articles = await getBlogPosts();

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
          News, meta snapshots and buying guides for Riftbound.{" "}
          {/* The header's editorial link points here now rather than at /guides,
              so this is what keeps the evergreen half one hop from the top bar
              instead of two (footer + ⌘K only). */}
          <Link href="/guides" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Browse the guides →
          </Link>
        </p>
      </div>
      <FilterableArticles articles={articles} basePath="/blog" sections={BLOG_SECTIONS} featured={FEATURED_POSTS} />
    </div>
  );
}
