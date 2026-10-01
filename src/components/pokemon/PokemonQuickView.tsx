"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import { ebaySearchUrl } from "@/lib/affiliate";
import { kindInfo } from "@/lib/pokemon/kinds";
import { pokemonEbayQuery } from "@/lib/pokemon/ebay-query";
import { formatDay, pokemonImageAlt, sourceWord } from "@/lib/pokemon/format";
import { formatPerPack } from "@/lib/pokemon/value";
import type { PkBoard, PkTile } from "@/lib/pokemon/types";
import type { Country } from "@/lib/country";
import { useCountry } from "../CountryProvider";
import { OutboundLink } from "../OutboundLink";
import { AffiliateDisclosure } from "../AffiliateDisclosure";
import { Dialog } from "../ui/Dialog";
import { PokemonBoardView } from "./PokemonBoardView";

// The Pokémon twin of SealedQuickView: a tile opens the price board in place.
// Unlike Riftbound sealed, the tile does not carry every offer (a grid of a
// thousand products would ship megabytes), so the board is fetched on open
// from /api/pokemon/product/[slug] — one CDN-cached response per product. The
// header, the tile's own figures and the eBay search render at once; only the
// comparison waits for the fetch. Mounted by app/pokemon/layout.tsx only.

type Opened = { tile: PkTile; currency: string };
type Boards = Record<Country, PkBoard>;

const Ctx = createContext<{ open: (tile: PkTile, currency: string) => void }>({ open: () => {} });
export const usePokemonQuickView = () => useContext(Ctx);

export function PokemonQuickViewProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Opened | null>(null);
  const last = useRef<Opened | null>(null);
  if (state) last.current = state;
  const shown = state ?? last.current;

  const open = useCallback((tile: PkTile, currency: string) => {
    setState({ tile, currency });
    trackEvent("pokemon_quickview_open", { product: tile.slug, kind: tile.kind });
  }, []);
  const close = useCallback(() => setState(null), []);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <Dialog open={!!state} onClose={close} size="2xl" z="overlay" labelledBy="pokemon-quickview-title">
        {shown && <QuickViewPanel key={shown.tile.slug} tile={shown.tile} currency={shown.currency} onClose={close} />}
      </Dialog>
    </Ctx.Provider>
  );
}

const cache = new Map<string, Boards>();

function QuickViewPanel({ tile, currency, onClose }: { tile: PkTile; currency: string; onClose: () => void }) {
  const { country } = useCountry();
  const [boards, setBoards] = useState<Boards | null>(() => cache.get(tile.slug) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (boards) return;
    let alive = true;
    fetch(`/api/pokemon/product/${encodeURIComponent(tile.slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { boards: Boards }) => {
        cache.set(tile.slug, d.boards);
        if (alive) setBoards(d.boards);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [boards, tile.slug]);

  const board = boards?.[country];
  const kind = kindInfo(tile.kind);
  const released = formatDay(tile.releasedOn);
  // Built here so the eBay button works before (and without) the fetch. The
  // fetched board carries the same search, built on the server.
  const ebayHref = ebaySearchUrl(country, pokemonEbayQuery(tile.name), "pkmn-quickview");

  return (
    <div className="max-h-[88vh] overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-2xl">
      <button
        onClick={onClose}
        aria-label="Close"
        className="tap-icon absolute right-3 top-3 z-20 rounded-full bg-ink-950/80 text-slate-300 hover:text-white"
      >
        ✕
      </button>
      <div className="max-h-[88vh] overflow-y-auto">
        <div className="flex gap-4 border-b border-ink-800 p-5">
          <div className="grid aspect-square w-28 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-800 bg-white/95 p-2 sm:w-32">
            {tile.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tile.imageUrl} alt={pokemonImageAlt(tile.name)} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="px-1 text-center text-xs font-bold text-slate-600">{kind.label}</span>
            )}
          </div>
          <div className="min-w-0 flex-1 pr-8">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="chip bg-brand-500/15 font-semibold text-brand-300">{kind.label}</span>
              {tile.presale && <span className="chip bg-sky-500/15 font-semibold text-sky-300">Pre-order</span>}
              {tile.setName && <span className="chip bg-ink-800 text-slate-300">{tile.setName}</span>}
            </div>
            <h2 id="pokemon-quickview-title" className="mt-1.5 text-lg font-extrabold leading-tight text-white">
              {tile.name}
            </h2>
            {released && <p className={`mt-1 text-xs ${tile.presale ? "text-sky-300" : "text-slate-400"}`}>TCGplayer lists {released}</p>}
            <div className="mt-2">
              {tile.lowCents != null ? (
                <>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Cheapest we track {sourceWord(tile.lowSource)}</div>
                  <div className="num text-2xl font-extrabold text-accent">{formatMoney(tile.lowCents, currency)}</div>
                  {/* Here, not in PokemonBoardView: the board is shared with the
                      product page, whose hero renders its own per-pack line. */}
                  {tile.perPackCents != null && tile.packCount != null && (
                    <div className="num text-xs text-slate-300">
                      {formatPerPack(tile.perPackCents, currency)} · {tile.packCount} {tile.packCount === 1 ? "booster pack" : "booster packs"}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm font-semibold text-slate-400">No tracked listing in your market</div>
              )}
            </div>
            <Link href={`/pokemon/sealed/${tile.slug}`} className="mt-2 inline-block text-xs font-semibold text-brand-400 hover:underline">
              Full price page, every market →
            </Link>
          </div>
        </div>

        <div className="p-4">
          {board ? (
            <PokemonBoardView board={board} preorder={tile.presale} pageType="pokemon_quickview" surface="modal" />
          ) : (
            <div className="space-y-3">
              <p className="px-1 text-sm text-slate-400" aria-live="polite">
                {failed ? "Couldn't load the price comparison just now." : "Loading the price comparison…"}
              </p>
              <OutboundLink
                href={ebayHref}
                retailer="pkmn_ebay_search"
                country={country}
                kind="sealed"
                pageType="pokemon_quickview"
                surface="ebay_search"
                className="btn-ebay w-full justify-center text-sm"
              >
                Search eBay for this →
              </OutboundLink>
              <AffiliateDisclosure partner="ebay" tight />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
