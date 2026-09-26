import type { Metadata } from "next";
import { HubIntro } from "@/components/HubIntro";
import { TradeCalculator } from "@/components/TradeCalculator";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";
import { pageAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Trade Calculator — Compare Riftbound card trade values",
  description:
    "Trading Riftbound cards in person? Add each side's cards and instantly compare their total value using RiftCompare's live lowest prices — so you know a trade is fair before you shake on it.",
  alternates: pageAlternates("/trade"),
};

// Static shell; the calculator itself is client-side (reads the country cookie via
// the CountryProvider and fetches prices on demand).
export default function TradePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs trail={[{ name: "Trade Calculator", href: "/trade" }]} />
      <header className="mb-5">
        <h1 className="font-display text-3xl font-extrabold text-white">Trade Calculator</h1>
        <p className="mt-1 text-slate-400">
          Trading cards at locals? Add each side&apos;s cards below to compare their total value at a glance — using
          RiftCompare&apos;s live lowest prices — and trade with confidence.
        </p>
      </header>
      <HubIntro path="/trade" />
      <TradeCalculator />
      {/* The guides behind a fair trade, after the calculator (2026-09-26,
          "Blog and tools, joined up"). Static, like the rest of this page. */}
      <RelatedGuides guides={guidesForTool("/trade")} className="card-surface mt-8 p-5" />
    </div>
  );
}
