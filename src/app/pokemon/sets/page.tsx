import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { ldJson, webPage } from "@/lib/jsonld";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonCatalog } from "@/lib/pokemon/data";
import { SERIES_ORDER } from "@/lib/pokemon/catalog";
import { toDisplay } from "@/lib/pokemon/browse";
import { formatDay } from "@/lib/pokemon/format";
import { newestSets } from "@/lib/pokemon/home";
import { pokemonItemList, pokemonMeta } from "@/lib/pokemon/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PokemonSetCard } from "@/components/pokemon/PokemonSetCard";

// Every Pokémon expansion we price sealed product from, newest first, grouped
// by series, each with its booster box and ETB "from" figures in the
// visitor's market. One read of the market's cached catalogue; a read error
// throws (HTTP 500), an empty catalogue is a 200 with noindex.
export const dynamic = "force-dynamic";

const TITLE = "Pokémon TCG Sets: Sealed Prices by Expansion";
const DESCRIPTION =
  "Pokémon TCG expansions from Sword & Shield to Mega Evolution, with the booster boxes, Elite Trainer Boxes, bundles and collections we price from each.";

export async function generateMetadata(): Promise<Metadata> {
  if (!pokemonEnabled()) return notFoundMetadata();
  const catalog = await getPokemonCatalog(getCountry());
  return pokemonMeta({
    title: TITLE,
    description: DESCRIPTION,
    path: "/pokemon/sets",
    ogImage: "section",
    robots: catalog.sets.length ? undefined : { index: false, follow: true },
  });
}

export default async function PokemonSetsPage() {
  if (!pokemonEnabled()) notFound();
  const country = getCountry();
  const currency = getDisplayCurrency(country);
  const raw = await getPokemonCatalog(country);
  const catalog = { ...raw, tiles: toDisplay(raw.tiles, country === "UK" && currency === "EUR") };
  const sets = newestSets(catalog, catalog.sets.length);
  const total = catalog.sets.reduce((n, s) => n + s.productCount, 0);
  const dated = catalog.sets.filter((s) => s.releasedOn);
  const oldest = dated[dated.length - 1];
  const newest = dated[0];
  const hasFrom = sets.some((s) => s.box?.lowCents != null || s.etb?.lowCents != null);

  return (
    <div>
      {sets.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: ldJson(
              webPage({ name: TITLE, href: "/pokemon/sets", description: DESCRIPTION, type: "CollectionPage" }),
              pokemonItemList(
                "Pokémon TCG sets",
                sets.map((s) => ({ name: s.set.name, path: `/pokemon/sets/${s.set.slug}` })),
              ),
            ),
          }}
        />
      )}
      <Breadcrumbs
        trail={[
          { name: "Pokémon", href: "/pokemon" },
          { name: "Sets", href: "/pokemon/sets" },
        ]}
      />
      <section className="card-surface mb-6 overflow-hidden border-l-2 border-rose-500 bg-ink-900">
        <div className="px-5 py-6 sm:px-6">
          <h1 className="text-2xl font-extrabold text-white">Pokémon TCG Sets</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            {sets.length === 0 ? (
              "No prices yet."
            ) : (
              <>
                {sets.length} expansions and {total.toLocaleString("en-US")} sealed products
                {oldest && newest && oldest !== newest
                  ? `, from ${oldest.name} (TCGplayer lists ${formatDay(oldest.releasedOn)}) to ${newest.name} (TCGplayer lists ${formatDay(newest.releasedOn)})`
                  : ""}
                . Each set page lists that set&apos;s sealed products with the cheapest listing we track in your market
                {hasFrom ? "; the figures on a card are the set's cheapest booster box and Elite Trainer Box" : ""}.
              </>
            )}
          </p>
        </div>
      </section>

      {SERIES_ORDER.map((series) => {
        const list = sets.filter((s) => s.set.series === series);
        if (!list.length) return null;
        return (
          <section key={series} className="mb-8">
            <h2 className="mb-3 text-lg font-extrabold text-white">{series}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((s) => (
                <PokemonSetCard
                  key={s.set.slug}
                  set={s.set}
                  from={{
                    currency,
                    ...(s.box?.lowCents != null ? { boxCents: s.box.lowCents, boxPresale: s.box.presale } : {}),
                    ...(s.etb?.lowCents != null ? { etbCents: s.etb.lowCents, etbPresale: s.etb.presale } : {}),
                  }}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
