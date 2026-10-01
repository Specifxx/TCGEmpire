import Link from "next/link";
import { formatDay, thumbOf } from "@/lib/pokemon/format";
import type { PkSetSummary } from "@/lib/pokemon/types";

// One Pokémon expansion as a link card: its booster box (or ETB) as the face,
// the name, release date and how many sealed products we price from it.
export function PokemonSetCard({ set, className = "" }: { set: PkSetSummary; className?: string }) {
  const thumb = thumbOf(set.imageUrl);
  const released = formatDay(set.releasedOn);
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
          {released ? ` · ${released}` : ""}
        </div>
      </div>
    </Link>
  );
}
