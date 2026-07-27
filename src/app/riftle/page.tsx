import type { Metadata } from "next";
import { Riftle } from "@/components/Riftle";
import { GameBoundary } from "@/components/GameBoundary";
import { AdSlot } from "@/components/AdSlot";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { getCountry } from "@/lib/get-country";
import { SITE_URL } from "@/lib/site";
import { RIFTLE_ATTEMPTS } from "@/lib/riftle-shared";

const DESCRIPTION =
  "Guess the Riftbound card of the day in 8 tries — or switch to Unlimited mode and play endless random cards. A free puzzle for League of Legends TCG players, with progressive hints and Wordle-style feedback on set, domain, type, rarity, cost and might.";

// Dynamic share image: when a player shares their result the URL carries ?r=<n>
// (solved in n) or ?r=x (stumped), so the link unfurls with a custom OG card —
// the viral loop that brings their friends in. A plain /riftle link is unchanged.
export function generateMetadata({ searchParams }: { searchParams?: { r?: string } }): Metadata {
  const base: Metadata = {
    title: "Riftle — the daily Riftbound card guessing game",
    description: DESCRIPTION,
    alternates: { canonical: "/riftle" },
  };
  const r = typeof searchParams?.r === "string" ? searchParams.r : null;
  if (!r) return base;

  const won = /^\d{1,2}$/.test(r);
  const stat = won ? `${r}/${RIFTLE_ATTEMPTS}` : `X/${RIFTLE_ATTEMPTS}`;
  const sub = won
    ? `I guessed today's Riftbound card in ${r}/${RIFTLE_ATTEMPTS}. Can you beat that?`
    : "Today's Riftbound card stumped me. Can you guess it?";
  const img = `${SITE_URL}/api/og?t=${encodeURIComponent("RIFTLE")}&s=${encodeURIComponent(stat)}&l=${encodeURIComponent(
    won ? "today's card" : "stumped"
  )}&b=${encodeURIComponent(sub)}`;

  return {
    ...base,
    openGraph: { title: "Riftle — daily Riftbound card game", description: sub, images: [{ url: img, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: "Riftle", description: sub, images: [img] },
  };
}

export default function RiftlePage() {
  const country = getCountry();
  return (
    <>
      {/* Contained boundary: a Riftle crash shows its message + retry in place
          instead of replacing the whole page with the route error screen. */}
      <GameBoundary>
        <Riftle />
      </GameBoundary>
      {/* TCGplayer banner under the puzzle — the game's daily repeat visitors
          are exactly the audience these creatives convert. */}
      <TcgplayerAd size="leaderboard" country={country} className="mt-8" />
      <div className="mx-auto max-w-2xl">
        <AdSlot className="mt-8" height={100} />
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">How to play</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Riftle picks one mystery Riftbound card each day, and you have {RIFTLE_ATTEMPTS} guesses to
            find it. After every guess you get Wordle-style feedback comparing your pick to the answer
            across set, domain, type, rarity, cost and might — green means an exact match, so you can
            narrow the field fast. Everyone gets the same daily card, so it's a fair comparison with
            friends; switch to Unlimited mode from the game for endless random cards with no daily
            limit.
          </p>
        </section>
      </div>
    </>
  );
}
