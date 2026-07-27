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
      <section className="mx-auto mt-8 max-w-2xl">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">How to play</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          The classic slide-and-merge puzzle, reskinned with Riftbound&apos;s own rarity ladder:
          slide tiles with the arrow keys or a swipe, and two matching cards merge into the next
          rarity up — two Commons become an Uncommon, two Uncommons become a Rare, and so on up to
          Legend. The board fills up fast, so the real skill is keeping your board clear enough to
          keep merging instead of getting stuck.
        </p>
      </section>
    </div>
  );
}
