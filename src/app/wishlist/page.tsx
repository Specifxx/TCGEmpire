import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { CardTile } from "@/components/CardTile";
import { CARD_TILE_SELECT } from "@/lib/cards";

export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const raw = cookies().get("rea_wishlist")?.value ?? "";
  const ids = decodeURIComponent(raw).split(",").filter(Boolean);

  const cards = ids.length
    ? await prisma.card.findMany({ where: { id: { in: ids } }, select: CARD_TILE_SELECT })
    : [];
  // Preserve the order the user added them (cookie order).
  const order = new Map(ids.map((id, i) => [id, i]));
  cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return (
    <div>
      <div className="card-surface mb-5 overflow-hidden">
        <div className="bg-gradient-to-r from-gold/15 via-ink-850 to-brand-600/20 p-6">
          <h1 className="text-2xl font-extrabold text-white">Your Wishlist</h1>
          <p className="mt-1 text-sm text-slate-300">
            Cards you&apos;re tracking. Saved on this device — sign-in to sync across devices is coming soon.
          </p>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center">
          <p className="text-lg font-semibold text-white">Your wishlist is empty</p>
          <p className="mt-1 text-sm text-slate-400">
            Tap the ♥ on any card to add it here and track its price.
          </p>
          <Link href="/" className="btn-primary mt-4">Browse cards</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
          {cards.map((c) => (
            <CardTile key={c.id} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}
