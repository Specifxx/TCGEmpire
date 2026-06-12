import type { Metadata } from "next";
import { SETS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { PackSim } from "@/components/games/PackSim";

export const metadata: Metadata = {
  title: "Riftbound Pack Opening Simulator — Rip Free Virtual Packs",
  description:
    "Open virtual Riftbound booster packs for free, built from the real card pool with live prices. See what a pack is actually worth — no money, all the dopamine. Then check the Box EV calculator to see if real packs are worth opening.",
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

export default function PackSimPage() {
  const sets = SETS.filter((s) => !s.comingSoon).map((s) => ({ code: s.code, name: s.name }));
  return <PackSim sets={sets} />;
}
