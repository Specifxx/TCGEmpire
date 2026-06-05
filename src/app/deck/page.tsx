import { DeckBuilder } from "@/components/DeckBuilder";
import { AdSlot } from "@/components/AdSlot";

export const metadata = {
  title: "Deck Builder & Pricing — RiftCompareAU",
};

export default function DeckPage() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-white">Deck Builder &amp; Pricing</h1>
        <p className="mt-1 text-sm text-slate-400">
          Paste a Riftbound decklist and get every card matched with the cheapest
          Australian price and a full deck total.
        </p>
      </div>
      <AdSlot className="mb-5" height={90} />
      <DeckBuilder />
    </div>
  );
}
