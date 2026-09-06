import type { Metadata } from "next";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { EbayAd } from "@/components/EbayAd";
import { getCountry } from "@/lib/get-country";
import { pageAlternates } from "@/lib/seo";
import { HigherLower } from "@/components/games/HigherLower";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "Higher or Lower — Riftbound Card Price Game",
  description:
    "The classic Higher or Lower game with live Riftbound card prices: guess which card costs more and build your streak. Free, no signup — prices straight from real stores.",
  alternates: pageAlternates("/games/higher-lower"),
};

export default function HigherLowerPage() {
  const country = getCountry();
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Games", href: "/games" }, { name: "Higher or Lower", href: "/games/higher-lower" }]} />
      <HigherLower />
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
          You&apos;re shown two Riftbound cards and their names — guess which one has the higher live
          market price. Guess right and the cheaper card is replaced with a new challenger; guess
          wrong and your streak ends. Every price comes straight from the same store data RiftCompare
          uses for real price comparisons, so a good streak here means you&apos;re getting a genuine
          feel for what cards in this game actually cost.
        </p>
      </section>
    </div>
  );
}
