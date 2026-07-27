import type { Metadata } from "next";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { getCountry } from "@/lib/get-country";
import { CardSmash } from "@/components/games/CardSmash";

export const metadata: Metadata = {
  title: "Card Smash — Riftbound Whack-a-Mole Reflex Game",
  description:
    "Card Smash: tap Riftbound cards as they pop up, dodge the bombs, beat the clock. Pricier cards score more, so it's a reflex game and market trivia in one. Free, no signup, global leaderboard.",
  alternates: { canonical: "/games/card-smash" },
};

export default function CardSmashPage() {
  const country = getCountry();
  return (
    <div>
      <CardSmash />
      <TcgplayerAd size="leaderboard" country={country} className="mt-8" />
      <section className="mx-auto mt-8 max-w-2xl">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">How to play</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Riftbound cards pop up at random — tap or click them before they disappear to score points,
          and avoid the bombs that cost you your run. Higher-value cards (based on their real live
          market price) are worth more when smashed, so it pays to recognise the expensive ones fast.
          The clock keeps running the whole time, so speed and accuracy both matter for a high score.
        </p>
      </section>
    </div>
  );
}
