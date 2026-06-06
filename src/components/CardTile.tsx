import Link from "next/link";
import { CardImage } from "./CardImage";
import { VariantBadge, OvernumberedBadge, PromoBadge, SignatureBadge } from "./Badge";
import { WishlistButton } from "./WishlistButton";
import { formatAUD } from "@/lib/format";
import { rarityInfo, isOvernumbered, isSignature } from "@/lib/constants";

export interface CardTileData {
  id: string;
  name: string;
  domain: string;
  type: string;
  rarity: string;
  variant: string | null;
  isPromo: boolean;
  setCode: string;
  collectorNumber: string;
  energyCost: number | null;
  might: number | null;
  artSeed: number;
  orientation: string | null;
  imageUrl: string | null;
  imageThumbUrl: string | null;
  blurDataUrl: string | null;
  lowestPriceCents: number | null;
  _count: { retailerPrices: number };
}

export function CardTile({ card }: { card: CardTileData }) {
  const r = rarityInfo(card.rarity);
  const stores = card._count.retailerPrices;

  return (
    // Outer wrapper holds the hover state and the wishlist button. The wishlist
    // button is a SIBLING of the link (not inside it) so toggling it never triggers
    // navigation or the top loading bar.
    <div className="group card-surface relative flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-glow">
      <div className="absolute right-2 top-2 z-10">
        <WishlistButton cardId={card.id} />
      </div>
      <Link href={`/card/${card.id}`} className="flex flex-1 flex-col">
        <div
          className="relative aspect-[5/7] w-full overflow-hidden p-3"
          style={{ background: `radial-gradient(120% 80% at 50% 0%, ${r.color}22, transparent 60%)` }}
        >
          <CardImage
            card={card}
            className="h-full w-full drop-shadow-lg transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            <VariantBadge variant={card.variant} />
            <SignatureBadge show={isSignature(card.collectorNumber)} />
            <OvernumberedBadge show={isOvernumbered(card.collectorNumber)} />
            <PromoBadge show={card.isPromo} />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1.5 border-t border-ink-700 p-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-white" title={card.name}>
          {card.name}
        </h3>
        <p className="text-xs text-slate-500">
          {card.setCode} · {card.collectorNumber}
        </p>

        <div className="mt-auto flex items-end justify-between pt-1">
          <div>
            {card.lowestPriceCents != null ? (
              <>
                <div className="text-[11px] text-slate-500">from</div>
                <div className="text-lg font-bold text-accent">
                  {formatAUD(card.lowestPriceCents)}
                </div>
              </>
            ) : (
              <div className="text-sm font-medium text-slate-500">No price yet</div>
            )}
          </div>
          {stores > 0 && (
            <div className="text-right text-[11px] text-slate-500">
              {stores} {stores === 1 ? "store" : "stores"}
            </div>
          )}
        </div>
        </div>
      </Link>
    </div>
  );
}
