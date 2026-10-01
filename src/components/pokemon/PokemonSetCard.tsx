import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { formatDay, thumbOf } from "@/lib/pokemon/format";
import type { PkSetSummary } from "@/lib/pokemon/types";

/**
 * "From" figures for the card: the cheapest open listing of the set's booster
 * box and ETB in the page's display currency (lib/pokemon/home.ts newestSets).
 * A pre-order price is flagged, never passed off as a released one.
 */
export interface SetCardFrom {
  boxCents?: number;
  etbCents?: number;
  boxPresale?: boolean;
  etbPresale?: boolean;
  currency: string;
}

// One Pokémon expansion as a link card: its booster box (or ETB) as the face,
// the name, the date TCGplayer lists for it and how many sealed products we
// price from it, plus "from" prices where the page passes them.
export function PokemonSetCard({ set, className = "", from }: { set: PkSetSummary; className?: string; from?: SetCardFrom }) {
  const thumb = thumbOf(set.imageUrl);
  const released = formatDay(set.releasedOn);
  const figures = from
    ? [
        from.boxCents != null ? { label: "Booster box", cents: from.boxCents, presale: from.boxPresale } : null,
        from.etbCents != null ? { label: "ETB", cents: from.etbCents, presale: from.etbPresale } : null,
      ].filter((x): x is { label: string; cents: number; presale: boolean | undefined } => x != null)
    : [];
  return (
    <Link
      href={`/pokemon/sets/${set.slug}`}
      className={`card-surface group flex items-center gap-3 overflow-hidden p-3 transition-colors hover:border-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${className}`}
    >
      <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-md bg-white/95 p-1.5">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={`${set.name}, Pokémon TCG expansion`} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-center text-[10px] font-bold text-slate-600">{set.code ?? set.name}</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-white group-hover:text-brand-300">{set.name}</div>
        <div className="text-xs text-slate-500">
          {set.series}
          {set.code ? ` · ${set.code}` : ""}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          {set.productCount} sealed {set.productCount === 1 ? "product" : "products"}
          {released ? ` · TCGplayer lists ${released}` : ""}
        </div>
        {figures.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-300">
            {figures.map((f) => (
              <span key={f.label}>
                {f.label} from <span className="num whitespace-nowrap font-semibold text-accent">{formatMoney(f.cents, from?.currency)}</span>
                {f.presale && <span className="text-sky-300"> (pre-order)</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
