import type { Metadata } from "next";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { EbayAd } from "@/components/EbayAd";
import { getCountry } from "@/lib/get-country";
import { pageAlternates } from "@/lib/seo";
import { Pairs } from "@/components/games/Pairs";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "Pairs — Riftbound Card Memory Game",
  description:
    "Classic memory with real Riftbound card art: flip the 4×4 grid, match all eight pairs in the fewest moves. Free, fast and endlessly replayable.",
  alternates: pageAlternates("/games/pairs"),
};

export default function PairsPage() {
  const country = getCountry();
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Games", href: "/games" }, { name: "Pairs", href: "/games/pairs" }]} />
      <Pairs />
      {/* Both partners, not one. This slot already ran a TCGplayer leaderboard
          on every game route while eBay had none anywhere in games — the only
          place on the site where one affiliate held an in-content surface the
          other was absent from. Same premium suppression, same self-carried
          disclosure, same click tracking; if the slot is worth a banner it is
          worth both. */}
      <TcgplayerAd size="leaderboard" country={country} className="mt-8" />
      <EbayAd size="leaderboard" country={country} className="mt-4" />
      <section className="mx-auto mt-8 max-w-2xl">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">How to play</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          A classic memory game built from real Riftbound card art: a 4×4 grid of face-down tiles
          hides eight matching pairs. Flip two tiles at a time — a match stays face-up, a mismatch
          flips back — and clear the whole board in as few moves as possible. There&apos;s no timer,
          so it&apos;s a quick, low-pressure way to start recognising card art at a glance.
        </p>
      </section>
    </div>
  );
}
