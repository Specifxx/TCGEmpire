import type { Metadata } from "next";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { getCountry } from "@/lib/get-country";
import { Zoomed } from "@/components/games/Zoomed";

export const metadata: Metadata = {
  title: "Zoomed In — Guess the Riftbound Card from Its Art",
  description:
    "Name the Riftbound card from a tiny zoomed-in patch of its artwork. Five rounds, four choices, optional zoom-out hint at half points. Free daily-replayable art quiz.",
  alternates: { canonical: "/games/zoomed" },
};

export default function ZoomedPage() {
  const country = getCountry();
  return (
    <div>
      <Zoomed />
      <TcgplayerAd size="leaderboard" country={country} className="mt-8" />
      <section className="mx-auto mt-8 max-w-2xl">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">How to play</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          You&apos;re shown a tightly zoomed-in crop of a real Riftbound card&apos;s artwork and four
          name choices — pick the right one across five rounds. Not sure? You can zoom out once for
          a wider view of the art, but it halves that round&apos;s points. A good test of how well you
          actually know the card art versus just the names.
        </p>
      </section>
    </div>
  );
}
