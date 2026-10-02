import type { Metadata } from "next";
import { pageAlternates } from "@/lib/seo";
import { CardSmash } from "@/components/games/CardSmash";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";

export const metadata: Metadata = {
  title: "Card Smash — Riftbound Whack-a-Mole Reflex Game",
  description:
    "Card Smash: tap Riftbound cards as they pop up, dodge the bombs, beat the clock. Pricier cards score more, so it's a reflex game and market trivia in one. Free, no signup, global leaderboard.",
  alternates: pageAlternates("/games/card-smash"),
};

// No in-page banner pair (owner decision, 2026-09-26, "Blog and tools, joined
// up" in DECISIONS.md): (2026-10-02: the arcade is now ad-free, footer pair and AdSlot included.)
// The numbers below are CardSmash.tsx's own constants (GAME_SECONDS, LIVES,
// BOMB_CHANCE, tierPts, the combo bonus and the spawn schedule) — change one
// there and this copy has to follow.
export default function CardSmashPage() {
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Games", href: "/games" }, { name: "Card Smash", href: "/games/card-smash" }]} />
      <CardSmash />
      <section className="mx-auto mt-8 max-w-2xl">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">How to play</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Cards pop up on a three-by-three grid and vanish again if you are slow. Tap a card to smash
          it for points; tap a 💣 and you lose one of your three lives. The run ends when the
          45-second clock runs down or your lives run out. It gets faster as you go: one target at a
          time for the first 12 seconds, two at once until 28 seconds, then three, with less time
          between pops the longer you last. Almost one pop in five is a bomb.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Each card wears its price along the bottom of the tile, and the price sets what it is
          worth: 25 points at 20 or more in your market&apos;s currency, 12 points from 5 up to 20, and 5
          points below that. Your combo adds 15% per card in the current unbroken run, counting the
          one you just hit, up to 90% extra from the sixth in a row, and a bomb resets it. So when
          three cards are up at once, the dearest is the one to hit first.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Those prices come from our own price data: what the cheapest in-stock copy of each card is
          listed for in your market, by a store or an eBay seller, before postage, refreshed by each
          of our twice-daily imports. When the run ends, a recap lists the cards you smashed,
          dearest first, each linking through to its full price comparison. Your best score stays in
          this browser, and signing in puts it on the global leaderboard.
        </p>
      </section>
      <RelatedGuides guides={guidesForTool("/games/card-smash")} className="card-surface mx-auto mt-6 max-w-2xl p-5" />
    </div>
  );
}
