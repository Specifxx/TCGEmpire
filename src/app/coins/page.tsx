import type { Metadata } from "next";
import { pageAlternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CoinCollection } from "@/components/coins/CoinCollection";
import { coinArt } from "@/lib/coins";

// /coins — RiftCompare Coins (2026-10-16, owner, from George's design: "Turn
// these into virtual coins that premium members can get by completing tasks…
// Make it gacha"). DECISIONS.md, "RiftCompare Coins". A static shell around a
// client collection: no database read at render, so the page is cached a day;
// the member's own coins load from /api/coins.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "RiftCompare Coins: Collect All Twelve Champions",
  description:
    "Premium members earn free pulls by checking in, building a watchlist, sharing prices and inviting friends, then collect twelve champion coins.",
  alternates: pageAlternates("/coins"),
  // A member's own page. Not disallowed in robots.txt, so the noindex is read.
  robots: { index: false, follow: true },
};

// The three coins that float in the hero: the Legendary and both Epics.
const HERO = [
  { id: "jinx", rot: "-10deg", left: "18%", delay: "-1.2s", size: "h-24 w-24 sm:h-32 sm:w-32" },
  { id: "ahri", rot: "0deg", left: "50%", delay: "0s", size: "h-32 w-32 sm:h-44 sm:w-44" },
  { id: "yasuo", rot: "10deg", left: "82%", delay: "-2.4s", size: "h-24 w-24 sm:h-32 sm:w-32" },
];

export default function CoinsPage() {
  return (
    <div className="container-app max-w-5xl space-y-8 py-6">
      <Breadcrumbs trail={[{ name: "RiftCompare Coins", href: "/coins" }]} />

      <header className="relative overflow-hidden rounded-3xl border border-[#ffcc4d]/20 bg-[#0b0814] px-5 pb-8 pt-10 text-center sm:px-10">
        <div aria-hidden="true" className="sp-aurora pointer-events-none absolute -inset-1/4 bg-[radial-gradient(circle_at_30%_30%,rgba(255,204,77,0.22),transparent_45%),radial-gradient(circle_at_75%_60%,rgba(200,107,255,0.2),transparent_45%)]" />
        <div aria-hidden="true" className="sp-stars pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative">
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-[#ffcc4d]">A Premium collection</p>
          <h1 className="sp-shine mt-2 font-display text-4xl font-black leading-tight sm:text-6xl">RiftCompare Coins</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-300 sm:text-base">
            Twelve champions, four rarities. Earn pulls by using the site, pull a coin, and see who answers. Collect the set.
          </p>
        </div>
        <div aria-hidden="true" className="relative mx-auto mt-6 h-40 max-w-md sm:h-52">
          {HERO.map((c) => (
            <div key={c.id} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: c.left }}>
              <div className="sp-float" style={{ ["--sp-rot" as string]: c.rot, animationDelay: c.delay }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coinArt(c.id)} alt="" aria-hidden="true" className={`${c.size} max-w-none drop-shadow-[0_0_30px_rgba(255,204,77,0.45)]`} />
              </div>
            </div>
          ))}
        </div>
      </header>

      <CoinCollection />
    </div>
  );
}
