import type { Metadata } from "next";
import { Riftle } from "@/components/Riftle";
import { AdSlot } from "@/components/AdSlot";
import { ADSENSE_SLOTS } from "@/lib/ads";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { getCountry } from "@/lib/get-country";

export const metadata: Metadata = {
  title: "Riftle — the daily Riftbound card guessing game",
  description:
    "Guess the Riftbound card of the day in 8 tries — or switch to Unlimited mode and play endless random cards. A free puzzle for League of Legends TCG players, with progressive hints and Wordle-style feedback on set, domain, type, rarity, cost and might.",
  alternates: { canonical: "/riftle" },
};

export default function RiftlePage() {
  const country = getCountry();
  return (
    <>
      <Riftle />
      {/* TCGplayer banner under the puzzle — the game's daily repeat visitors
          are exactly the audience these creatives convert. */}
      <TcgplayerAd size="leaderboard" country={country} className="mt-8" />
      <div className="mx-auto max-w-2xl">
        <AdSlot slot={ADSENSE_SLOTS.games} className="mt-8" height={100} />
      </div>
    </>
  );
}
