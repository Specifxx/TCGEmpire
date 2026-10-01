import type { Metadata } from "next";
import { getCountry } from "@/lib/get-country";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonCatalog } from "@/lib/pokemon/data";
import { SERIES_ORDER } from "@/lib/pokemon/catalog";
import type { PkCatalog } from "@/lib/pokemon/types";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PokemonSetCard } from "@/components/pokemon/PokemonSetCard";

// Every Pokémon expansion we price sealed product from, newest first, grouped
// by series. Reads the visitor's market's cached catalogue (the set list is
// market-neutral, but it is the read the rest of the section already shares).
export const dynamic = "force-dynamic";

const TITLE = "Pokémon TCG Sets: Sealed Prices by Expansion";
const DESCRIPTION =
  "Every Pokémon TCG expansion from Sword & Shield to Mega Evolution, with the booster boxes, Elite Trainer Boxes, bundles and collections we price from each.";

export function generateMetadata(): Metadata {
  if (!pokemonEnabled()) return notFoundMetadata();
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: pageAlternates("/pokemon/sets"),
    openGraph: pageOpenGraph({ title: TITLE, description: DESCRIPTION, url: "/pokemon/sets" }),
  };
}

export default async function PokemonSetsPage() {
  let catalog: PkCatalog | null = null;
  try {
    catalog = await getPokemonCatalog(getCountry());
  } catch (e) {
    console.error("[pokemon] catalogue read failed", e);
  }
  const sets = catalog?.sets ?? [];
  const total = sets.reduce((n, s) => n + s.productCount, 0);

  return (
    <div>
      <Breadcrumbs
        trail={[
          { name: "Pokémon", href: "/pokemon" },
          { name: "Sets", href: "/pokemon/sets" },
        ]}
      />
      <section className="card-surface mb-6 overflow-hidden border-l-2 border-rose-500 bg-ink-900">
        <div className="px-6 py-6">
          <h1 className="text-2xl font-extrabold text-white">Pokémon TCG Sets</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            {sets.length} expansions and {total.toLocaleString()} sealed products, from the Sword &amp; Shield base set in
            February 2020 to the newest Mega Evolution release. Each set page lists every sealed product from that set with
            the cheapest listing we track in your market.
          </p>
        </div>
      </section>

      {sets.length === 0 ? (
        <div className="card-surface p-10 text-center text-slate-400">The first daily import has not run yet.</div>
      ) : (
        SERIES_ORDER.map((series) => {
          const list = sets.filter((s) => s.series === series);
          if (!list.length) return null;
          return (
            <section key={series} className="mb-8">
              <h2 className="mb-3 text-lg font-extrabold text-white">{series}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((s) => (
                  <PokemonSetCard key={s.slug} set={s} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
