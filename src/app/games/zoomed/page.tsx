import type { Metadata } from "next";
import { Zoomed } from "@/components/games/Zoomed";

export const metadata: Metadata = {
  title: "Zoomed In — Guess the Riftbound Card from Its Art",
  description:
    "Name the Riftbound card from a tiny zoomed-in patch of its artwork. Five rounds, four choices, optional zoom-out hint at half points. Free daily-replayable art quiz.",
  alternates: { canonical: "/games/zoomed" },
};

export default function ZoomedPage() {
  return <Zoomed />;
}
