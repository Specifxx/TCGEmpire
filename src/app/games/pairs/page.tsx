import type { Metadata } from "next";
import { pageAlternates } from "@/lib/seo";
import { Pairs } from "@/components/games/Pairs";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";

export const metadata: Metadata = {
  title: "Pairs — Riftbound Card Memory Game",
  description:
    "Classic memory with real Riftbound card art: flip the 4×4 grid, match all eight pairs in the fewest moves. Free, fast and endlessly replayable.",
  alternates: pageAlternates("/games/pairs"),
};

// No in-page banner pair (owner decision, 2026-09-26, "Blog and tools, joined
// up" in DECISIONS.md): (2026-10-02: the arcade is now ad-free, footer pair and AdSlot included.)
// The old copy here said "There's no timer"; Pairs.tsx has always run one from
// the first move. The leaderboard ranks on moves alone (lib/games.ts, "asc").
export default function PairsPage() {
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Games", href: "/games" }, { name: "Pairs", href: "/games/pairs" }]} />
      <Pairs />
      <section className="mx-auto mt-8 max-w-2xl">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">How to play</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Sixteen face-down tiles hide eight pairs of real Riftbound card art — a four-by-four grid,
          or two rows of eight on a short landscape screen. Turn over one tile, then a second. If
          they show the same card they stay face up with a tick; if not, both turn back after a
          moment, so remember where each one was. Every two tiles you turn is one move, and the game
          is won when all eight pairs are showing.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Fewest moves wins. Eight is a perfect game, and it takes luck as well as memory: you cannot
          know where a card&apos;s twin is until you have turned it over. A clock starts with your first
          move and runs beside the move counter, but the global leaderboard ranks signed-in players
          on moves alone, keeping each player&apos;s lowest count. Your personal best is saved in this
          browser too.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Nothing on the tiles shows a price while you play. Once the board is clear, the eight
          cards you matched are listed with the cheapest in-stock price we have for each in your
          market, dearest first, so you find out whether the art you kept losing track of was a bulk
          common or a chase card. Each one links through to its own page, where the stores we track
          that list it are compared side by side.
        </p>
      </section>
      <RelatedGuides guides={guidesForTool("/games/pairs")} className="card-surface mx-auto mt-6 max-w-2xl p-5" />
    </div>
  );
}
