import type { Metadata } from "next";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { getCountry } from "@/lib/get-country";
import { Twenty48 } from "@/components/games/Twenty48";

export const metadata: Metadata = {
  title: "Riftbound 2048 — Merge Cards Up the Rarity Ladder",
  description:
    "Play Riftbound 2048: the classic slide-and-merge puzzle, but you climb the rarity ladder from Common to Legend. Free, no signup, arrow keys or swipe. Compete on the global leaderboard.",
  alternates: { canonical: "/games/twenty48" },
};

export default function Twenty48Page() {
  const country = getCountry();
  return (
    <div>
      <Twenty48 />
      <TcgplayerAd size="leaderboard" country={country} className="mt-8" />
    </div>
  );
}
