"use client";

import { formatMoney } from "@/lib/format";
import { kindInfo } from "@/lib/pokemon/kinds";
import { formatDay, pokemonImageAlt, sourceWord, thumbOf } from "@/lib/pokemon/format";
import type { PkTile } from "@/lib/pokemon/types";
import { usePokemonQuickView } from "./PokemonQuickView";

// A Pokémon sealed product on a grid. Built on SealedTile's frame, with one
// difference that matters for search: the tile is a real link to the product's
// own page, so crawlers and a middle-click reach it, and a plain click opens the
// quick view in place instead. `currency` is the page's display currency,
// resolved on the server (the market cookie can disagree with the client
// provider until it hydrates, which is why /sealed passes it the same way).
export function PokemonTile({ tile, currency, showSet = true }: { tile: PkTile; currency: string; showSet?: boolean }) {
  const { open } = usePokemonQuickView();
  const kind = kindInfo(tile.kind);
  const thumb = thumbOf(tile.imageUrl);
  const released = formatDay(tile.releasedOn);

  return (
    <a
      href={`/pokemon/sealed/${tile.slug}`}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        open(tile, currency);
      }}
      className="cv-auto group card-surface relative flex h-full flex-col overflow-hidden text-left transition-[transform,box-shadow,border-color] duration-base hover:border-ink-600 hover:shadow-glow focus-visible:border-brand-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 motion-safe:hover:-translate-y-0.5"
    >
      <div className="relative grid aspect-square w-full place-items-center overflow-hidden bg-white/95 p-4">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={pokemonImageAlt(tile.name)}
            loading="lazy"
            decoding="async"
            className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="px-2 text-center text-sm font-bold text-slate-600">{kind.label}</span>
        )}
        <span className="chip absolute left-2 top-2 bg-ink-950/80 text-[10px] font-semibold text-slate-200">{kind.label}</span>
        {tile.presale && (
          <span className="chip absolute left-2 top-9 bg-sky-500/90 text-[10px] font-semibold text-white">Pre-order</span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 border-t border-ink-800 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white" title={tile.name}>
          {tile.name}
        </h3>
        {showSet && tile.setName && <p className="truncate text-xs text-slate-500">{tile.setName}</p>}
        {tile.presale && released && <p className="text-[11px] text-sky-300">Releases {released}</p>}

        {tile.lowCents != null ? (
          <div className="mt-auto flex items-end justify-between gap-2 pt-1">
            <div className="min-w-0">
              <div className="text-[11px] text-slate-500">cheapest {sourceWord(tile.lowSource)}</div>
              <div className="num whitespace-nowrap text-lg font-bold text-accent">{formatMoney(tile.lowCents, currency)}</div>
            </div>
            {tile.refCents != null && (
              <div className="shrink-0 text-right text-[11px] leading-tight text-slate-500">
                <span className="block">TCGplayer market</span>
                <span className="num font-semibold text-slate-300">
                  {currency === "USD" ? "" : "≈ "}
                  {formatMoney(tile.refCents, currency)}
                </span>
              </div>
            )}
          </div>
        ) : (
          // No listing we track in this market (most tins and blisters outside
          // the US): the reference becomes the figure, and the way on is eBay,
          // whose search the quick view opens with. A label, not a link: the
          // whole tile is already one.
          <div className="mt-auto flex flex-col items-start gap-1.5 pt-1">
            <div className="min-w-0">
              {tile.refCents != null ? (
                <>
                  <div className="text-[11px] text-slate-500">TCGplayer market</div>
                  <div className="num whitespace-nowrap text-base font-bold text-slate-200">
                    {currency === "USD" ? "" : "≈ "}
                    {formatMoney(tile.refCents, currency)}
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500">No price yet</div>
              )}
            </div>
            <span className="rounded-md bg-[#0064d2]/15 px-2 py-1 text-[11px] font-semibold text-sky-300">Check eBay →</span>
          </div>
        )}
      </div>
    </a>
  );
}
