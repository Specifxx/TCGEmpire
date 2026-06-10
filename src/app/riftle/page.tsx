import type { Metadata } from "next";
import { Riftle } from "@/components/Riftle";

export const metadata: Metadata = {
  title: "Riftle — the daily Riftbound card guessing game",
  description:
    "Guess the Riftbound card of the day in 8 tries. A free daily puzzle for League of Legends TCG players — Wordle-style hints on set, domain, type, rarity, cost and might.",
  alternates: { canonical: "/riftle" },
};

export default function RiftlePage() {
  return <Riftle />;
}
