import type { Metadata } from "next";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { EbayAd } from "@/components/EbayAd";
import { getCountry } from "@/lib/get-country";
import { pageAlternates } from "@/lib/seo";
import { PriceCheck } from "@/components/games/PriceCheck";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "Price Check — Guess the Riftbound Card Price",
  description:
    "The Price Is Right, for Riftbound: guess each card's live market price and score by how close you land. Five rounds, real store prices, free to play.",
  alternates: pageAlternates("/games/price-check"),
};

export default function PriceCheckPage() {
  const country = getCountry();
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Games", href: "/games" }, { name: "Price Check", href: "/games/price-check" }]} />
      <PriceCheck />
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
          Five rounds, one card each — guess what it&apos;s actually selling for right now and your
          score is based on how close your guess lands to the real live market price, the same
          numbers RiftCompare uses for its price comparisons. Guess too low or too high and you&apos;ll
          score less; nail it exactly and you&apos;ll top out the round. A fun gut-check for how well
          you actually know current Riftbound prices.
        </p>
      </section>
    </div>
  );
}
