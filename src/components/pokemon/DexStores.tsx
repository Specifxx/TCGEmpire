"use client";

import type { ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";
import { COUNTRIES, type Country } from "@/lib/country";
import { formatDay } from "@/lib/pokemon/format";
import { DEX_REL, dexHref, storePriceCents, storesWord, type DexLink, type DexSurface } from "@/lib/pokemon/dexcompare";

// The stores line: DexCompare's figures for this product in the visitor's
// market (lib/pokemon/dexcompare.ts has the join and the why), and the way to
// its store-by-store table. Not an offer row: DexCompare's figure is a summary
// of many stores, and its link goes to DexCompare, not to a store, so it sits
// beside the comparison, in its own colour, never ranked inside it.
//
// Every link: a new tab (the visitor keeps this page), nofollow (DEX_REL), and
// `pokemon_dexcompare_click` by surface, the measure of the connection.

export function DexAnchor({
  href,
  surface,
  market,
  product,
  className,
  children,
}: {
  href: string;
  surface: DexSurface;
  market: Country;
  product?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel={DEX_REL}
      onClick={() => trackEvent("pokemon_dexcompare_click", { surface, market, product })}
      className={className}
    >
      {children}
    </a>
  );
}

const BUTTON =
  "btn shrink-0 border border-emerald-500/60 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-300 hover:border-emerald-500 hover:bg-emerald-500/25";

/**
 * The board's stores block. `money` formats in the board's display currency
 * (the UK euro preference included). `cheaper`: DexCompare's figure is below
 * the board's own cheapest open listing (a store's, never TCGplayer's: the
 * caller passes it only when no marketplace is in DexCompare's figure).
 */
export function DexStoresBlock({
  market,
  link,
  money,
  surface,
  product,
  cheaper = false,
  preorder = false,
}: {
  market: Country;
  link: DexLink;
  money: (cents: number) => string;
  surface: DexSurface;
  product?: string;
  cheaper?: boolean;
  /** A pre-order: DexCompare counts a store taking pre-orders as "in stock", which is not what the words would say. */
  preorder?: boolean;
}) {
  // No store lists it (TCGplayer may: that is already the board's own row): nothing to add.
  if (link.kind === "product" && link.inStock === 0 && link.listed === 0) return null;
  const adjective = COUNTRIES[market].adjective;
  const href = dexHref(market, link, surface);
  let title: ReactNode;
  let line: ReactNode;
  let button: string;
  if (link.kind === "set") {
    title = `${link.setName} at ${adjective} stores`;
    line = "DexCompare compares this set's sealed products across independent stores, in stock first.";
    button = "Compare stores";
  } else if (link.inStock > 0) {
    // A price only when it is a store's (storePriceCents): DexCompare's US cheapest can be TCGplayer's.
    const price = storePriceCents(link);
    title = (
      <>
        {preorder ? "Open for pre-order" : "In stock"} at {link.inStock} of {storesWord(link.listed)}
        {price != null && (
          <>
            {" "}
            · from <span className="num font-bold text-accent">{money(price)}</span>
          </>
        )}
      </>
    );
    line =
      price != null
        ? `The cheapest ${adjective} store price on DexCompare, our store comparison, with every store's price beside it.`
        : "DexCompare, our store comparison, has each store's price, TCGplayer's beside them.";
    button = link.listed > 1 ? `Compare ${storesWord(link.listed)}` : "See the store";
  } else {
    title = `Sold out at the ${storesWord(link.listed)} DexCompare checks`;
    line = "Its page lists them, so you can see which store restocks first.";
    button = link.listed > 1 ? "See the stores" : "See the store";
  }
  const checked = link.kind === "product" ? formatDay(link.checkedAt) : null;

  return (
    <div data-dexcompare={link.kind} className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
            Independent stores · {COUNTRIES[market].place}
            {cheaper && <span className="chip bg-emerald-500/20 normal-case tracking-normal text-emerald-300">Cheaper at a store</span>}
          </div>
          <div className="mt-0.5 text-sm font-semibold text-white">{title}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            {line}
            {checked && <> Stores checked {checked}.</>}
          </div>
        </div>
        <DexAnchor href={href} surface={surface} market={market} product={product} className={BUTTON}>
          {button} on DexCompare <span aria-hidden="true">↗</span>
        </DexAnchor>
      </div>
    </div>
  );
}
