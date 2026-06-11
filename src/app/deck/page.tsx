import type { Metadata } from "next";
import { DeckBuilder } from "@/components/DeckBuilder";

// NOTE: the layout's title template appends "— RiftCompare"; don't add it here.
export const metadata: Metadata = {
  title: "Riftbound Deck Builder & Deck Price Calculator",
  description:
    "Paste any Riftbound decklist and price every card instantly — each one matched to its cheapest live store price, with a full deck total. Free deck builder and pricing tool.",
  alternates: { canonical: "/deck" },
};

export default function DeckPage({ searchParams }: { searchParams: { list?: string } }) {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-white">Deck Builder &amp; Pricing</h1>
        <p className="mt-1 text-sm text-slate-400">
          Paste a Riftbound decklist and get every card matched with the cheapest
          Australian price and a full deck total.
        </p>
      </div>
      <DeckBuilder initialList={searchParams.list} />
    </div>
  );
}
