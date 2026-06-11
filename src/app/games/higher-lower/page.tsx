import type { Metadata } from "next";
import { HigherLower } from "@/components/games/HigherLower";

export const metadata: Metadata = {
  title: "Higher or Lower — Riftbound Card Price Game",
  description:
    "The classic Higher or Lower game with live Riftbound card prices: guess which card costs more and build your streak. Free, no signup — prices straight from real stores.",
  alternates: { canonical: "/games/higher-lower" },
};

export default function HigherLowerPage() {
  return <HigherLower />;
}
