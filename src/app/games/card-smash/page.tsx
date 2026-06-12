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
    </div>
  );
}
