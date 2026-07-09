import Link from "next/link";
import { CardImage } from "./CardImage";
import { ConditionBadge, FoilBadge } from "./Badge";
import { formatAUD } from "@/lib/format";
import { rarityInfo } from "@/lib/constants";
import { cardHref } from "@/lib/card-url";

export interface ListingTile {
  id: string;
  condition: string;
  isFoil: boolean;
  priceCents: number;
  seller: { displayName: string };
  card: {
    id: string;
    slug: string | null;
    name: string;
    domain: string;
    type: string;
    rarity: string;
    energyCost: number | null;
    might: number | null;
    collectorNumber: string;
    artSeed: number;
    orientation: string | null;
    imageUrl: string | null;
    imageThumbUrl: string | null;
    blurDataUrl: string | null;
    marketPriceCents: number;
  };
}

export function ListingCard({ listing }: { listing: ListingTile }) {
  const { card } = listing;
  const r = rarityInfo(card.rarity);
  const diff = listing.priceCents - card.marketPriceCents;
  const pctDiff = card.marketPriceCents
    ? Math.round((diff / card.marketPriceCents) * 100)
    : 0;

  return (
    <Link
      href={cardHref(card)}
      className="group card-surface flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-glow"
    >
      {/* Art */}
      <div
        className="relative aspect-[5/7] w-full overflow-hidden bg-ink-900 p-3"
        style={{
          background: `radial-gradient(120% 80% at 50% 0%, ${r.color}22, transparent 60%)`,
        }}
      >
        <CardImage
          card={card}
          isFoil={listing.isFoil}
          className="h-full w-full drop-shadow-lg transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {listing.isFoil && <FoilBadge />}
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-2 border-t border-ink-700 p-3">
        <div className="min-h-[2.5rem]">
          <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-white">
            {card.name}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {card.collectorNumber} · {card.type}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <ConditionBadge condition={listing.condition} />
          <span
            className="chip"
            style={{ backgroundColor: `${r.color}22`, color: r.color }}
          >
            {card.rarity}
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between pt-1">
          <div>
            <div className="text-lg font-bold text-white">
              {formatAUD(listing.priceCents)}
            </div>
            <div
              className="text-[11px]"
              style={{ color: diff <= 0 ? "#30a46c" : "#9aa0aa" }}
            >
              {diff < 0 ? `${pctDiff}% under ref.` : diff > 0 ? `+${pctDiff}% ref.` : "at ref."}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-slate-500">seller</div>
            <div className="max-w-[90px] truncate text-xs font-medium text-slate-300">
              {listing.seller.displayName}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
