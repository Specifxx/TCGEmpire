import type { Metadata } from "next";
import { Riftle } from "@/components/Riftle";

export const metadata: Metadata = {
  title: "Riftle — the daily Riftbound card guessing game",
  description:
    "Guess the Riftbound card of the day in 8 tries — or switch to Unlimited mode and play endless random cards. A free puzzle for League of Legends TCG players, with progressive hints and Wordle-style feedback on set, domain, type, rarity, cost and might.",
  alternates: { canonical: "/riftle" },
};

export default function RiftlePage() {
  return <Riftle />;
}
