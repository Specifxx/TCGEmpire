import type { Metadata } from "next";
import { PriceCheck } from "@/components/games/PriceCheck";

export const metadata: Metadata = {
  title: "Price Check — Guess the Riftbound Card Price",
  description:
    "The Price Is Right, for Riftbound: guess each card's live market price and score by how close you land. Five rounds, real store prices, free to play.",
  alternates: { canonical: "/games/price-check" },
};

export default function PriceCheckPage() {
  return <PriceCheck />;
}
