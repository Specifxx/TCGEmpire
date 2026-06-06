import type { Metadata } from "next";
import { getArticles } from "@/lib/articles";
import { ArticleList } from "@/components/ArticleList";
import { WipBanner } from "@/components/WipBanner";

export const metadata: Metadata = {
  title: "Riftbound Guides — Learn the Game & Build Decks (Australia)",
  description:
    "Beginner-friendly guides for Riftbound: League of Legends TCG — deckbuilding, where to buy in Australia, and more.",
  alternates: { canonical: "/guides" },
};

export default function GuidesPage() {
  const articles = getArticles("guide");
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-white">Guides</h1>
        <p className="mt-1 text-sm text-slate-400">
          Learn Riftbound — deckbuilding basics, buying tips and more, for Australian players.
        </p>
      </div>
      <WipBanner />
      <ArticleList articles={articles} basePath="/guides" />
    </div>
  );
}
