import type { Metadata } from "next";
import { pageAlternates } from "@/lib/seo";
import { Zoomed } from "@/components/games/Zoomed";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";

export const metadata: Metadata = {
  title: "Zoomed In — Guess the Riftbound Card from Its Art",
  description:
    "Name the Riftbound card from a tiny zoomed-in patch of its artwork. Five rounds, four choices, optional zoom-out hint at half points. Free daily-replayable art quiz.",
  alternates: pageAlternates("/games/zoomed"),
};

// No in-page banner pair (owner decision, 2026-09-26, "Blog and tools, joined
// up" in DECISIONS.md): (2026-10-02: the arcade is now ad-free, footer pair and AdSlot included.)
// The zoom levels and points below are Zoomed.tsx's (scale 3.2 / 1.8,
// PTS_FULL 2, PTS_HINT 1); the card pool is api/games/cards.
export default function ZoomedPage() {
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Games", href: "/games" }, { name: "Zoomed In", href: "/games/zoomed" }]} />
      <Zoomed />
      <section className="mx-auto mt-8 max-w-2xl">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">How to play</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Each of the five rounds shows a small patch of one card&apos;s image, blown up to more than
          three times its size, from a point picked at random away from the edges. Choose the
          card&apos;s name from four options. A right answer at full zoom scores 2 points. Stuck? Zoom
          out once for a wider view before you answer, and a right answer is then worth 1 point. A
          wrong answer scores nothing, and either way the whole card is revealed, with a link to its
          page.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          A perfect game is 10 points. Your best is saved in this browser, and once you are signed
          in your best score goes on the global leaderboard. Each round&apos;s answer and its three
          wrong names come from one random deal of cards that have both an image and a price in your
          market. Priced alternate-art and over-numbered printings are in that pool too, and both are
          drawn differently from the base card, so a name you know well can turn up with a picture you
          have never seen.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          After the last round, the recap lists the cards behind each crop, dearest first, with the
          cheapest in-stock price we track for them in your market. Learning the art this closely
          helps when a card has to be recognised from a photo — a binder page, or an eBay listing
          picture — before you have read its name.
        </p>
      </section>
      <RelatedGuides guides={guidesForTool("/games/zoomed")} className="card-surface mx-auto mt-6 max-w-2xl p-5" />
    </div>
  );
}
