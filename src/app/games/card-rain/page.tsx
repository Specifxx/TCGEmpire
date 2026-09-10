import type { Metadata } from "next";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { EbayAd } from "@/components/EbayAd";
import { getCountry } from "@/lib/get-country";
import { pageAlternates } from "@/lib/seo";
import { CardRain } from "@/components/games/CardRain";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "Card Rain — Catch the Falling Riftbound Cards",
  description:
    "Card Rain: real Riftbound cards fall from the sky and you slide a deck box to catch them. Pricier cards score more, power-ups drop alongside. Free, no signup, global leaderboard.",
  alternates: pageAlternates("/games/card-rain"),
};

export default function CardRainPage() {
  const country = getCountry();
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Games", href: "/games" }, { name: "Card Rain", href: "/games/card-rain" }]} />
      <CardRain />
      <TcgplayerAd size="leaderboard" country={country} className="mt-8" />
      <EbayAd size="leaderboard" country={country} className="mt-4" />
      <section className="mx-auto mt-8 max-w-2xl">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">How to play</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Real Riftbound cards fall from the sky. Drag anywhere on the field — or use the arrow keys, A/D, or the
          on-screen buttons — to slide your deck box along the bottom and catch them. Every card you catch scores
          points based on its real live market price, so the chase cards are worth several times what a common is.
          Catch ten in a row without dropping one for a combo bonus. Drop three cards and the run ends.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Power-ups fall in alongside the cards, and catching one is always worth a detour:{" "}
          <strong className="text-slate-200">🧲 Magnet</strong> pulls everything toward your box,{" "}
          <strong className="text-slate-200">✨ 2× points</strong> doubles every catch,{" "}
          <strong className="text-slate-200">⏳ Slow-mo</strong> slows the whole sky down,{" "}
          <strong className="text-slate-200">↔️ Wide box</strong> widens your catcher, and the rarest,{" "}
          <strong className="text-slate-200">❤️ Extra life</strong>, buys back a dropped card. Every twelve catches
          raises the level: cards fall faster and more often, endlessly.
        </p>
      </section>
    </div>
  );
}
