import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SellForm } from "@/components/SellForm";

export const dynamic = "force-dynamic";

export default async function SellPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cards = await prisma.card.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      domain: true,
      type: true,
      rarity: true,
      energyCost: true,
      might: true,
      collectorNumber: true,
      artSeed: true,
      orientation: true,
      imageUrl: true,
      imageThumbUrl: true,
      blurDataUrl: true,
      marketPriceCents: true,
    },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-extrabold text-white">List a card for sale</h1>
      <p className="mt-1 mb-6 text-sm text-slate-400">
        Choose a card, set its condition and price in AUD, and it goes live on
        the marketplace instantly.
      </p>
      <SellForm cards={cards} />
    </div>
  );
}
