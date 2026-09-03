import type { Metadata } from "next";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { EbayAd } from "@/components/EbayAd";
import { getCountry } from "@/lib/get-country";
import { pageAlternates } from "@/lib/seo";
import { SpaceInvaders } from "@/components/games/SpaceInvaders";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "Space Invaders — Riftbound Arcade Shooter",
  description:
    "Space Invaders, Riftbound-style: shoot down waves of real cards before the formation reaches you. Pricier cards score more. Free, no signup, global leaderboard.",
  alternates: pageAlternates("/games/space-invaders"),
};

export default function SpaceInvadersPage() {
  const country = getCountry();
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Games", href: "/games" }, { name: "Space Invaders", href: "/games/space-invaders" }]} />
      <SpaceInvaders />
      <TcgplayerAd size="leaderboard" country={country} className="mt-8" />
      <EbayAd size="leaderboard" country={country} className="mt-4" />
      <section className="mx-auto mt-8 max-w-2xl">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">How to play</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          A formation of Riftbound cards marches back and forth, dropping a row closer every time it hits an
          edge. Move with the arrow keys or A/D (or the on-screen buttons on mobile), and fire with Space or a
          tap. Shoot every card down before the formation reaches the danger line — pricier cards, based on
          their real live market price, score more when destroyed. Three lives, endless waves, each one faster
          than the last.
        </p>
      </section>
    </div>
  );
}
