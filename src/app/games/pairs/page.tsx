import type { Metadata } from "next";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { getCountry } from "@/lib/get-country";
import { Pairs } from "@/components/games/Pairs";

export const metadata: Metadata = {
  title: "Pairs — Riftbound Card Memory Game",
  description:
    "Classic memory with real Riftbound card art: flip the 4×4 grid, match all eight pairs in the fewest moves. Free, fast and endlessly replayable.",
  alternates: { canonical: "/games/pairs" },
};

export default function PairsPage() {
  const country = getCountry();
  return (
    <div>
      <Pairs />
      <TcgplayerAd size="leaderboard" country={country} className="mt-8" />
    </div>
  );
}
