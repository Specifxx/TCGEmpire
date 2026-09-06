import type { Metadata } from "next";
import { getArticles } from "@/lib/articles";
import { FilterableArticles, type ArticleSection } from "@/components/FilterableArticles";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";

// Curated from real traffic (30-day Top Pages), not a live/self-updating ranking —
// revisit occasionally as new guides prove themselves. Empower Explained alone
// outdrew every other guide combined; deck-archetype content is the clear #2.
const FEATURED_GUIDES = ["riftbound-empower-explained", "best-riftbound-vendetta-decks", "budget-riftbound-decks"];

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

export const metadata: Metadata = {
  title: "Riftbound Guides — Learn the Game & Build Decks",
  description:
    "Beginner-friendly guides for Riftbound: League of Legends TCG — deckbuilding, where to buy, and more.",
  alternates: pageAlternates("/guides"),
};

export default function GuidesPage() {
  const articles = getArticles("guide");
  const info = COUNTRIES[getCountry()];

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
        <p className="mt-1 text-sm text-slate-400">
          Learn Riftbound — deckbuilding basics, buying tips and more, for {info.adjective} players.
        </p>
      </div>
      <FilterableArticles articles={articles} basePath="/guides" sections={GUIDE_SECTIONS} featured={FEATURED_GUIDES} />
    </div>
  );
}
