import type { Metadata } from "next";
import Link from "next/link";
import { pageAlternates } from "@/lib/seo";
import { Twenty48 } from "@/components/games/Twenty48";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";

export const metadata: Metadata = {
  title: "Riftbound 2048 — Merge Cards Up the Rarity Ladder",
  description:
    "Play Riftbound 2048: the classic slide-and-merge puzzle, but you climb Riftbound's rarity ladder from Common to Ultimate and beyond. Free, no signup, arrow keys or swipe. Compete on the global leaderboard.",
  alternates: pageAlternates("/games/twenty48"),
};

// No in-page banner pair (owner decision, 2026-09-26, "Blog and tools, joined
// up" in DECISIONS.md): (2026-10-02: the arcade is now ad-free, footer pair and AdSlot included.)
// The copy used to promise a ladder "up to Legend": Legend is a card type, not
// a rarity, and the game's tiers past it (Champion, Mythic…) do not exist in
// Riftbound either. Twenty48.tsx's LADDER now uses the real rarities first; the
// numbers below are its spawn odds (0.9 / 0.1) and slideLine's scoring.
export default function Twenty48Page() {
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Games", href: "/games" }, { name: "Riftbound 2048", href: "/games/twenty48" }]} />
      <Twenty48 />
      <section className="mx-auto mt-8 max-w-2xl">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">How to play</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Slide every tile on the four-by-four board at once with the arrow keys or WASD, or swipe on
          a touch screen. When two tiles of the same rarity run into each other they merge into one
          tile a step up the ladder, and after every move a new tile lands in an empty square —
          usually a Common, one time in ten an Uncommon. The game ends when the board is full and no
          two neighbouring tiles match.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          The first six rungs are the rarity badges RiftCompare puts on its cards, in the same
          colours: Common, Uncommon, Rare, Epic, Showcase and Ultimate. Past Ultimate the game keeps
          going with tiers of its own, Ultimate II to Ultimate V, which no card is printed at. Each
          merge scores the value of the tile it makes, and that value doubles at every rung: 4 points
          for an Uncommon, 8 for a Rare, 16 for an Epic, 32 for a Showcase and 64 for an Ultimate.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          There are no cards or prices in this one, only the order of the tiers. How rarely an Epic
          or an Ultimate turns up in a real pack is set out, with sources, in the pull-rate table on
          the{" "}
          <Link href="/games/pack-sim" className="text-brand-400 hover:underline">pack simulator</Link>, and
          Common to Showcase each have their own priced list under{" "}
          <Link href="/cards/rarity" className="text-brand-400 hover:underline">cards by rarity</Link>. Your
          best score is kept in this browser, and signed-in players&apos; best scores go on the global
          leaderboard.
        </p>
      </section>
      <RelatedGuides guides={guidesForTool("/games/twenty48")} className="card-surface mx-auto mt-6 max-w-2xl p-5" />
    </div>
  );
}
