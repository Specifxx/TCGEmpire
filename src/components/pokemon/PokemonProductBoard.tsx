"use client";

import type { Country } from "@/lib/country";
import type { DexLink } from "@/lib/pokemon/dexcompare";
import type { PkBoard } from "@/lib/pokemon/types";
import { useCountry } from "../CountryProvider";
import { PokemonBoardView } from "./PokemonBoardView";

// The product page's price board, localised after hydration: the page is ISR
// with no cookie read anywhere in its tree (the card page's rule), so it ships
// every market's board, and every market's DexCompare stores line, and this
// picks the visitor's. Server HTML is the default market's board, which is also
// what the page's JSON-LD describes.
export function PokemonProductBoard({
  boards,
  preorder,
  dex = {},
  slug,
}: {
  boards: Record<Country, PkBoard>;
  preorder: boolean;
  dex?: Partial<Record<Country, DexLink | null>>;
  slug?: string;
}) {
  const { country } = useCountry();
  const board = boards[country] ?? boards.US;
  return (
    <PokemonBoardView
      board={board}
      preorder={preorder}
      pageType="pokemon_product"
      surface="table"
      dex={dex[board.market] ?? null}
      dexSurface="product"
      product={slug}
    />
  );
}
