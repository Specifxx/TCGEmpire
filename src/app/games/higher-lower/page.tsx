import type { Metadata } from "next";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { getCountry } from "@/lib/get-country";
import { HigherLower } from "@/components/games/HigherLower";

export const metadata: Metadata = {
  title: "Higher or Lower — Riftbound Card Price Game",
  description:
    "The classic Higher or Lower game with live Riftbound card prices: guess which card costs more and build your streak. Free, no signup — prices straight from real stores.",
  alternates: { canonical: "/games/higher-lower" },
};

export default function HigherLowerPage() {
  const country = getCountry();
  return (
    <div>
      <HigherLower />
      <TcgplayerAd size="leaderboard" country={country} className="mt-8" />
    </div>
  );
}
