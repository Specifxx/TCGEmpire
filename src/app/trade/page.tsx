import type { Metadata } from "next";
import { HubIntro } from "@/components/HubIntro";
import { TradeCalculator } from "@/components/TradeCalculator";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { ldJson, webApplication } from "@/lib/jsonld";

// 2026-09-27: the title was "Trade Calculator — Compare Riftbound card trade
// values", 68 characters once the " — RiftCompare" template is added, so Google
// cut it mid-phrase. The replacement leads with the query ("riftbound trade
// calculator") and fits the 60-character budget with the suffix. Every claim in
// the description, intro and JSON-LD is what components/TradeCalculator.tsx does:
// each card valued at the cheapest in-stock store price for the visitor's market
// and currency, with a per-card override or a specific store's price.
const TITLE = "Riftbound Trade Calculator: Fair Trade Values";
const DESCRIPTION =
  "Compare Riftbound card trade values: both sides priced at the cheapest in-stock store price in your market and currency, so you know a trade is fair.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: pageAlternates("/trade"),
  openGraph: pageOpenGraph({ title: `${TITLE} — RiftCompare`, description: DESCRIPTION, url: "/trade" }),
};

// Static shell; the calculator itself is client-side (reads the country cookie via
// the CountryProvider and fetches prices on demand).
export default function TradePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs trail={[{ name: "Trade Calculator", href: "/trade" }]} />
      <header className="mb-5">
        <h1 className="font-display text-3xl font-extrabold text-white">Riftbound Trade Calculator</h1>
        <p className="mt-1 text-slate-400">
          Trading cards at locals? Add each side&apos;s cards below to compare their total value at a glance. Every
          card is priced at the cheapest in-stock store price in your market and currency — tap a value to type your
          own or pick a specific store&apos;s price — so you can trade with confidence.
        </p>
      </header>
      <HubIntro path="/trade" />
      <TradeCalculator />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson(
            webApplication({
              id: "#app",
              name: "RiftCompare Trade Calculator",
              href: "/trade",
              applicationCategory: "UtilitiesApplication",
              description:
                "A free Riftbound trade calculator: add the cards on each side of a trade and compare their total value at the cheapest in-stock store price in your market and currency.",
              featureList: [
                "Add Riftbound cards to each side of a trade and compare the two totals",
                "Each card valued at the cheapest in-stock store price in your market",
                "Prices in USD, AUD, GBP, SGD, CAD or EUR",
                "Type your own value for any card, or pick a specific store's price",
              ],
            }),
          ),
        }}
      />
    </div>
  );
}
