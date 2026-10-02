import type { Metadata } from "next";
import { pageAlternates } from "@/lib/seo";
import { HigherLower } from "@/components/games/HigherLower";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";

export const metadata: Metadata = {
  title: "Higher or Lower — Riftbound Card Price Game",
  description:
    "The classic Higher or Lower game with live Riftbound card prices: guess which card costs more and build your streak. Free, no signup — prices from the stores and eBay listings we track.",
  alternates: pageAlternates("/games/higher-lower"),
};

// No in-page banner pair any more (owner decision, 2026-09-26, "Blog and tools,
// joined up" in DECISIONS.md): with FooterAds' pair below and GameShell's
// AdSlot, a toy with ~70 words of help carried up to five ad units. The words went
// up instead (and since 2026-10-02 the arcade carries no ads at all). Every sentence
// below is checkable in components/games/HigherLower.tsx and api/games/cards.
export default function HigherLowerPage() {
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Games", href: "/games" }, { name: "Higher or Lower", href: "/games/higher-lower" }]} />
      <HigherLower />
      <section className="mx-auto mt-8 max-w-2xl">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">How to play</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Two cards sit side by side. The one on the left shows its price; the one on the right, the
          challenger, keeps its price hidden. Tap ▲ Higher if you think the challenger costs more, or
          ▼ Lower if you think it costs less. Call it right and the challenger&apos;s price is revealed,
          it moves across to the left, a new challenger is dealt in and your streak goes up by one.
          Call it wrong and the run is over. Two cards at exactly the same price count as a right
          answer whichever way you called it.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Every figure is the cheapest in-stock listing we hold for that card in your market — a
          store&apos;s or an eBay seller&apos;s — in your market&apos;s own currency, before postage, as of
          the latest of our two daily price imports. A deal is up to 80 cards drawn at random from
          the ones with a price in your market, and getting through all of them ends the run as a
          win. Your best streak is kept in this browser; sign in and it goes on the global
          leaderboard, where each player keeps their best.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          The hard calls are between printings. The set code and collector number under each name
          tell a base print from an alternate-art, over-numbered or Signature copy of the same card,
          and those can be priced far apart. When a run ends, the recap lists the cards you saw,
          dearest first, each with a heart to watch it for price drops and a link to its full store
          comparison.
        </p>
      </section>
      <RelatedGuides guides={guidesForTool("/games/higher-lower")} className="card-surface mx-auto mt-6 max-w-2xl p-5" />
    </div>
  );
}
