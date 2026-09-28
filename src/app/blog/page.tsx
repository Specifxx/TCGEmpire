import Link from "next/link";
import type { Metadata } from "next";
import { getBlogPosts } from "@/lib/posts";
import { FilterableArticles, type ArticleSection, type ArticleListItem } from "@/components/FilterableArticles";
import { SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { authorJsonLd } from "@/lib/content/authors";
import { BLOG_PICKS } from "@/lib/content/featured";

// "Editor's picks" come from lib/content/featured.ts (owner-curated, 2026-09-26),
// which replaced a "Most read" list taken from August's 30-day Top Pages: no
// per-article view count exists to keep a traffic label true.

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

// The tools the posts' figures come from, linked once under the intro so the
// blog and the data are one click apart (2026-09-26, "Blog and tools, joined up"
// in DECISIONS.md). /guides carries its own, differently worded line.
const DATA_LINKS: { href: string; label: string }[] = [
  { href: "/browse", label: "Card prices" },
  { href: "/tools/best-basket", label: "Best Basket" },
  { href: "/tools/box-ev", label: "Booster box EV" },
  { href: "/movers", label: "Price movers" },
  { href: "/market", label: "RiftCompare Index" },
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
  // Only what the list renders and searches crosses into the client component,
  // never a post's markdown body (see ArticleListItem).
  const items: ArticleListItem[] = articles.map(({ slug, title, excerpt, tags, date, readMins, hero }) => ({
    slug,
    title,
    excerpt,
    tags,
    date,
    readMins,
    hero,
  }));

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
    ],
  };

  // Named and described for what the blog is today. Until 2026-09-26 it still
  // promised "Daily Market Reports" and "the automated daily Riftbound market
  // report", a feature removed with its read-side (lib/posts.ts).
  const blog = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Riftbound Blog — News, Analysis & Buying Guides",
    description:
      "Riftbound news, set coverage, ban-list changes and market analysis from RiftCompare, with prices and figures from its own price database.",
    url: `${SITE_URL}/blog`,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: { "@id": `${SITE_URL}/#org` },
    blogPost: articles.slice(0, 20).map((a) => ({
      "@type": "BlogPosting",
      headline: a.title,
      url: `${SITE_URL}/blog/${a.slug}`,
      description: a.excerpt,
      datePublished: a.date,
      // Real per-author type (Person or Organization) — a hardcoded "Person"
      // here would mistype an Organization byline like "RiftCompare" itself,
      // the same fabricated-credential mistake ArticleView.tsx and
      // authors/[slug]/page.tsx already avoid via this same helper.
      author: authorJsonLd(a.author),
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
        {/* What the blog is and who writes it (2026-09-26, "Blog and tools,
            joined up"). Worded for this page: /guides describes the reference
            half in its own words, so neither intro is the other's boilerplate.
            The authorship sentence is the owner's statement (lib/content/
            authors.ts ARTICLE_PROCESS), in this page's own phrasing. */}
        <div className="mt-2 max-w-3xl space-y-2 text-sm leading-relaxed text-slate-400">
          <p>
            The blog covers what is happening in Riftbound: set announcements and card reveals, ban-list changes, and
            market analysis of what cards cost across the six markets we track — Australia, the US, the UK,
            Singapore, Canada and the EU. Prices and figures in a post come from RiftCompare&apos;s own price
            database, the one behind every comparison on the site, never from the draft.
          </p>
          <p>
            Every post is drafted with AI assistance, then edited and fact-checked before publishing by Bill, who
            founded RiftCompare and runs it on his own. Our{" "}
            <Link href="/authors" className="text-brand-300 underline-offset-2 hover:underline">authors page</Link>{" "}
            says who writes under which byline, the{" "}
            <Link href="/editorial-policy" className="text-brand-300 underline-offset-2 hover:underline">
              editorial policy
            </Link>{" "}
            how mistakes are corrected, and the{" "}
            <Link href="/methodology" className="text-brand-300 underline-offset-2 hover:underline">methodology</Link>{" "}
            how prices are collected.{" "}
            {/* The header's editorial link points here now rather than at /guides,
                so this is what keeps the evergreen half one hop from the top bar
                instead of two (footer + ⌘K only). */}
            <Link href="/guides" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
              Browse the guides →
            </Link>{" "}
            Want more than our own writing?{" "}
            <Link href="/community" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
              See community links →
            </Link>
          </p>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 text-xs">
          <span className="text-slate-500">The data behind the posts:</span>
          {DATA_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="tap-link font-semibold text-brand-300 underline-offset-2 hover:underline">
              {l.label}
            </Link>
          ))}
        </p>
      </div>
      <FilterableArticles articles={items} basePath="/blog" sections={BLOG_SECTIONS} featured={BLOG_PICKS} />
    </div>
  );
}
