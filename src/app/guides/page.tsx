import type { Metadata } from "next";
import { getArticles } from "@/lib/articles";
import { FilterableArticles, type ArticleSection, type ArticleListItem } from "@/components/FilterableArticles";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { COUNTRY_GUIDE_SLUGS, pageAlternates } from "@/lib/seo";
import { GUIDE_PICKS } from "@/lib/content/featured";

// "Editor's picks" come from lib/content/featured.ts (owner-curated, 2026-09-26).
// They replaced a "Most read" list drawn from August's 30-day Top Pages, which
// no per-article view count could keep true.

// Topic clusters for the default (unfiltered) view — matched by tag, first
// section wins so nothing appears twice. Anything matching none of these still
// shows up, in a trailing "More" group.
const GUIDE_SECTIONS: ArticleSection[] = [
  { title: "Vendetta Guides", accent: "#34d17e", tags: ["vendetta"] },
  {
    title: "Buying & Value",
    accent: "#eab308",
    tags: [
      "buying", "value", "arbitrage", "riftcompare-index", "methodology", "market-data",
      "expected-value", "booster-box", "booster box", "sealed-product", "buying-guide",
      "sealed", "stores", "australia",
    ],
  },
  {
    title: "Collecting & Card Knowledge",
    accent: "#a855f7",
    tags: ["collecting", "rarity", "printings", "condition", "storage", "chase cards"],
  },
  {
    title: "Getting Started",
    accent: "#06b6d4",
    tags: ["beginners", "beginner", "how to start", "budget", "banlist", "competitive", "rules", "deckbuilding"],
  },
];

// The tools the guides explain, linked once under the intro (2026-09-26, "Blog
// and tools, joined up" in DECISIONS.md). Each guide links its own tool too;
// this is the index's one-line map of them. /blog words its line differently.
const TOOL_LINKS: { href: string; label: string }[] = [
  { href: "/browse", label: "Card price database" },
  { href: "/tools/best-basket", label: "Best Basket" },
  { href: "/tools/box-ev", label: "Box EV calculator" },
  { href: "/movers", label: "Price movers" },
  { href: "/market", label: "RiftCompare Index" },
];

export const metadata: Metadata = {
  title: "Riftbound Guides — Learn the Game & Build Decks",
  description:
    "Beginner-friendly guides for Riftbound: League of Legends TCG — deckbuilding, where to buy, and more.",
  alternates: pageAlternates("/guides"),
};

export default function GuidesPage() {
  const articles = getArticles("guide");
  const country = getCountry();
  const info = COUNTRIES[country];
  // Only what the list renders and searches crosses into the client component,
  // never a guide's markdown body (see ArticleListItem).
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
      { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
    ],
  };

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Riftbound Guides",
    description: "Beginner-friendly guides for Riftbound: League of Legends TCG — deckbuilding, where to buy, and more.",
    url: `${SITE_URL}/guides`,
      // Edges back to the site-level graph in app/layout.tsx. Without them this
      // node is an island and the Organization/WebSite entity signals — sameAs,
      // areaServed, knowsAbout — don't propagate to the page.
      isPartOf: { "@id": `${SITE_URL}/#website` },
      publisher: { "@id": `${SITE_URL}/#org` },
    numberOfItems: articles.length,
    itemListElement: articles.map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: a.title,
      url: `${SITE_URL}/guides/${a.slug}`,
      description: a.excerpt,
    })),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumb, itemList]) }}
      />
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-white">Guides</h1>
        {/* What the guides are and who writes them (2026-09-26, "Blog and
            tools, joined up"). Its own wording, not /blog's: the two indexes
            describe different halves of the writing. The authorship clause is
            the owner's statement (lib/content/authors.ts ARTICLE_PROCESS). The
            visitor's market picks the buying-guide link, as it already picked
            this page's copy before. */}
        <div className="mt-2 max-w-3xl space-y-2 text-sm leading-relaxed text-slate-400">
          <p>
            Guides are the reference side of RiftCompare: how Riftbound&apos;s mechanics and ban list work, how a deck
            is built, how to tell one printing or condition from another, and how to buy and sell without overpaying.
            They are revised when the game changes rather than left to date, and most end by pointing you at the tool
            that does what the guide describes.
          </p>
          <p>
            Each one is drafted with AI assistance, then edited and fact-checked by Bill, who runs the site, and the
            prices and figures it quotes come from RiftCompare&apos;s own price database. See{" "}
            <Link href="/authors" className="text-brand-300 underline-offset-2 hover:underline">who writes them</Link>,
            our{" "}
            <Link href="/editorial-policy" className="text-brand-300 underline-offset-2 hover:underline">
              editorial policy
            </Link>{" "}
            and{" "}
            <Link href="/methodology" className="text-brand-300 underline-offset-2 hover:underline">
              how prices are collected
            </Link>
            . Buying in {info.place}? Start with{" "}
            <Link
              href={`/blog/${COUNTRY_GUIDE_SLUGS[country]}`}
              className="font-semibold text-brand-300 underline-offset-2 hover:underline"
            >
              where to buy Riftbound cards in {info.place} →
            </Link>{" "}
            Looking for the wider community?{" "}
            <Link href="/community" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
              See community links →
            </Link>
          </p>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 text-xs">
          <span className="text-slate-500">Tools these guides explain:</span>
          {TOOL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="tap-link font-semibold text-brand-300 underline-offset-2 hover:underline">
              {l.label}
            </Link>
          ))}
        </p>
      </div>
      <FilterableArticles articles={items} basePath="/guides" sections={GUIDE_SECTIONS} featured={GUIDE_PICKS} />
    </div>
  );
}
