import { COUNTRIES, type Country } from "@/lib/country";
import { dexHomeHref } from "@/lib/pokemon/dexcompare";
import { DexAnchor } from "./DexStores";

// The section home's way to DexCompare, the owner's Pokémon STORE comparison
// (lib/pokemon/dexcompare.ts): this section prices TCGplayer and eBay, DexCompare
// the independent stores, and a buyer who would rather order from a local shop
// should find it from here in one tap. `inStockProducts` is DexCompare's own
// count for the market (null when it could not be read: the band then says
// what DexCompare is without a figure).
export function HomeStoresBand({ market, inStockProducts }: { market: Country; inStockProducts: number | null }) {
  const { adjective } = COUNTRIES[market];
  return (
    <section
      aria-label="Pokémon sealed at independent stores"
      className="card-surface mb-8 flex flex-wrap items-center gap-x-4 gap-y-3 border-l-2 border-emerald-500 px-5 py-4"
    >
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-extrabold text-white">Rather buy from a shop?</p>
        <p className="text-xs text-slate-400">
          {inStockProducts
            ? `DexCompare, our store comparison, has ${inStockProducts.toLocaleString("en-US")} Pokémon sealed products in stock at ${adjective} stores, cheapest first.`
            : `DexCompare, our store comparison, prices Pokémon sealed at ${adjective} stores, cheapest first.`}{" "}
          Our product pages show the cheapest store beside TCGplayer and eBay wherever DexCompare lists the product.
        </p>
      </div>
      <DexAnchor
        href={dexHomeHref(market, "home")}
        surface="home"
        market={market}
        className="btn shrink-0 border border-emerald-500/60 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-300 hover:border-emerald-500 hover:bg-emerald-500/25"
      >
        Compare {adjective} stores ↗
      </DexAnchor>
    </section>
  );
}
