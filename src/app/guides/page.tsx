import type { Metadata } from "next";
import { getArticles } from "@/lib/articles";
import { FilterableArticles } from "@/components/FilterableArticles";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Riftbound Guides — Learn the Game & Build Decks",
  description:
    "Beginner-friendly guides for Riftbound: League of Legends TCG — deckbuilding, where to buy, and more.",
  alternates: { canonical: "/guides" },
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
      <FilterableArticles articles={articles} basePath="/guides" />
    </div>
  );
}
