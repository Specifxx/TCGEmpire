import type { Metadata } from "next";
import { SETS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { PackSim } from "@/components/games/PackSim";
import { Breadcrumbs } from "@/components/Breadcrumbs";

const DESC =
  "Open virtual Riftbound booster packs for free, built from the real card pool with live prices. See what a pack is actually worth — no money, all the dopamine. Then check the Box EV calculator to see if real packs are worth opening.";

// Shared pull links carry ?v=<value> so they unfurl with a custom OG card
// ("I pulled $X"), pulling friends in to rip their own. Plain link is unchanged.
export function generateMetadata({ searchParams }: { searchParams?: { v?: string } }): Metadata {
  const base: Metadata = {
    title: "Riftbound Pack Opening Simulator — Rip Free Virtual Packs",
    description: DESC,
    keywords: [
      "Riftbound pack simulator",
      "Riftbound pack opening",
      "open Riftbound packs free",
      "TCG pack simulator",
      "Riftbound booster simulator",
    ],
    alternates: { canonical: "/games/pack-sim" },
    openGraph: {
      title: "Riftbound Pack Opening Simulator | RiftCompare",
      description: "Rip free virtual Riftbound packs built from real cards and live prices.",
      url: `${SITE_URL}/games/pack-sim`,
    },
  };
  const v = typeof searchParams?.v === "string" ? searchParams.v.slice(0, 14) : null;
  if (!v) return base;

  const sub = "I ripped a Riftbound pack on RiftCompare — rip yours free";
  const img = `${SITE_URL}/api/og?t=${encodeURIComponent("PACK PULL")}&s=${encodeURIComponent(v)}&l=${encodeURIComponent(
    "of cards"
  )}&b=${encodeURIComponent(sub)}&c=${encodeURIComponent("#f5a524")}`;
  return {
    ...base,
    openGraph: { title: `I pulled ${v} of Riftbound cards`, description: sub, images: [{ url: img, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: `I pulled ${v}`, description: sub, images: [img] },
  };
}

export default function PackSimPage() {
  const sets = SETS.filter((s) => !s.comingSoon).map((s) => ({ code: s.code, name: s.name }));
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Games", href: "/games" }, { name: "Pack Opening Simulator", href: "/games/pack-sim" }]} />
      <PackSim sets={sets} />
      <section className="mx-auto mt-8 max-w-2xl">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">How it works</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Pick a Riftbound set and rip a virtual booster pack, built from that set&apos;s real card
          pool with the same odds by rarity as a physical pack. Every card you pull is priced against
          live store data, so you get an honest read on what your pull would actually be worth — no
          money spent, no risk, just the pull. If you like what you see, the real cards are one click
          away on the <a href="/browse" className="text-brand-400 hover:underline">card database</a>,
          each priced across every store RiftCompare tracks.
        </p>
      </section>
    </div>
  );
}
