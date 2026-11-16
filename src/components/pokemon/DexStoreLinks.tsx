import type { Country } from "@/lib/country";
import { COUNTRIES } from "@/lib/country";
import { dexProductHref, dexStoreLinks, storesWord, type DexTileFigures } from "@/lib/pokemon/dexcompare";
import { DexAnchor } from "./DexStores";

// A compact "store prices" list for an INDEXABLE page: one followed link per product to its DexCompare page, only where that page
// exists with two or more stores (lib/pokemon/dexcompare.ts dexStoreLinks). A visible, useful list of where the independent
// stores' prices are, not a hidden block; the quick view and the noindex product pages keep their nofollow links.
export function DexStoreLinks({
  tiles,
  market,
  heading,
  intro,
  className = "",
}: {
  tiles: readonly { id: number; name: string; dex?: DexTileFigures | null }[];
  market: Country;
  heading: string;
  intro?: string;
  className?: string;
}) {
  const links = dexStoreLinks(tiles, market);
  if (!links.length) return null;
  const adjective = COUNTRIES[market].adjective;
  return (
    <section className={`card-surface p-5 ${className}`} aria-label={heading} data-dexcompare="store-links">
      <h2 className="text-lg font-extrabold text-white">{heading}</h2>
      <p className="mt-1 max-w-3xl text-xs text-slate-400">
        {intro ?? `DexCompare, our store comparison, lists ${adjective} independent stores for each of these, in stock first.`}
      </p>
      <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 xl:grid-cols-3">
        {links.map((l) => (
          <li key={l.id} className="min-w-0">
            <DexAnchor
              href={dexProductHref(market, l.slug)}
              surface="product"
              market={market}
              product={l.slug}
              follow
              className="block truncate text-emerald-300 hover:underline"
            >
              {l.name} <span className="text-xs text-slate-500">· {storesWord(l.listed)} ↗</span>
            </DexAnchor>
          </li>
        ))}
      </ul>
    </section>
  );
}
