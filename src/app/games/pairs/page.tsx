import type { Metadata } from "next";
import { Pairs } from "@/components/games/Pairs";

export const metadata: Metadata = {
  title: "Pairs — Riftbound Card Memory Game",
  description:
    "Classic memory with real Riftbound card art: flip the 4×4 grid, match all eight pairs in the fewest moves. Free, fast and endlessly replayable.",
  alternates: { canonical: "/games/pairs" },
};

export default function PairsPage() {
  return <Pairs />;
}
