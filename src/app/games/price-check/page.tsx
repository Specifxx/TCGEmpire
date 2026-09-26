import type { Metadata } from "next";
import { pageAlternates } from "@/lib/seo";
import { PriceCheck } from "@/components/games/PriceCheck";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";

// "Game" ADDED TO THE TITLE 2026-09-17, as an anti-cannibalization fix rather
// than a cosmetic one. This was the ONLY page on the site whose <title>
// contained the phrase "price check", which made a five-round guessing game the
// site's de facto answer to `riftbound price check` — a query whose searcher
// wants to know what a card is worth. The homepage now owns that query
// (docs/seo-keyword-map.md), and "Game" here breaks the "Riftbound … price
// check" adjacency so the two stop competing, while keeping the game findable
// by its own name for anyone searching for it directly.
export const metadata: Metadata = {
  title: "Price Check Game — Guess the Riftbound Card Price",
  description:
    "The Price Is Right, for Riftbound: guess each card's live market price and score by how close you land. Five rounds, real listing prices, free to play.",
  alternates: pageAlternates("/games/price-check"),
};

// No in-page banner pair (owner decision, 2026-09-26, "Blog and tools, joined
// up" in DECISIONS.md): the site-wide footer pair and GameShell's AdSlot stay.
// The scoring described below is roundPoints() in components/games/PriceCheck.tsx.
export default function PriceCheckPage() {
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Games", href: "/games" }, { name: "Price Check", href: "/games/price-check" }]} />
      <PriceCheck />
      <section className="mx-auto mt-8 max-w-2xl">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">How to play</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          A game is five cards, one at a time. Study the card — its art, its name, and the set code
          and collector number that say which printing it is — then type what you think it costs in
          your market&apos;s currency and lock it in. The real price appears straight away, with a link
          to that card&apos;s store comparison, and the next card comes up.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Scoring is by percentage, not by the dollar. Each round is worth up to 100 points, and you
          lose a point for every 1% your guess is out: land within 10% and you score at least 90, be
          half out and you score 50, guess double the price (or zero) and you score nothing. So
          missing a 1.00 card by 0.50 costs as much as missing a 100.00 card by 50. The best possible
          game is 500. Your best total is saved in this browser, and signed-in players&apos; best totals
          go on the global leaderboard.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          The answer is the lowest asking price for an in-stock copy of that exact printing in your
          market, at a store we track or on eBay: the item price alone, with no postage, as it stood
          after our most recent price import (they run twice a day). Five rounds is a quick check on
          whether your sense of what cards cost matches what they are listed for before you buy or
          trade.
        </p>
      </section>
      <RelatedGuides guides={guidesForTool("/games/price-check")} className="card-surface mx-auto mt-6 max-w-2xl p-5" />
    </div>
  );
}
