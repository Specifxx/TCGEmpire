import type { Metadata } from "next";
import Link from "next/link";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { ebaySearchUrl } from "@/lib/affiliate";
import { ldJson, webPage } from "@/lib/jsonld";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonCatalog } from "@/lib/pokemon/data";
import { toDisplay } from "@/lib/pokemon/browse";
import { pokemonEbayQuery } from "@/lib/pokemon/ebay-query";
import { PER_PACK_METHOD, PER_PACK_TOP, perPackPage, proseLabel } from "@/lib/pokemon/hubs";
import { pokemonItemList, pokemonMeta, productIsIndexed } from "@/lib/pokemon/seo";
import { asOfLabel } from "@/lib/pokemon/value";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { PerPackTable } from "@/components/pokemon/PerPackTable";

// Every sealed product with a known pack count and an open listing in the
// visitor's market, ranked by price per booster pack (lib/pokemon/value.ts
// perPackRanking), overall and per kind. Per-request over the cached
// catalogue: a read error throws (500), an empty catalogue is 200 + noindex.
// Kinds are reached by in-page anchors, never query parameters, so there is
// one URL to index.
export const dynamic = "force-dynamic";

const TITLE = "Pokémon Price per Pack: Sealed Products Ranked";
const DESCRIPTION =
  "Sealed Pokémon products with a known pack count, ranked by price per booster pack at the cheapest listing we track. Updated daily.";
const PATH = "/pokemon/price-per-pack";

export async function generateMetadata(): Promise<Metadata> {
  if (!pokemonEnabled()) return notFoundMetadata();
  const catalog = await getPokemonCatalog(getCountry());
  return pokemonMeta({
    title: TITLE,
    description: DESCRIPTION,
    path: PATH,
    ogImage: "section",
    robots: catalog.tiles.length ? undefined : { index: false, follow: true },
  });
}

export default async function PokemonPricePerPackPage() {
  const country = getCountry();
  const currency = getDisplayCurrency(country);
  const catalog = await getPokemonCatalog(country);
  const tiles = toDisplay(catalog.tiles, country === "UK" && currency === "EUR");
  const page = perPackPage({ tiles });
  const asOf = asOfLabel(catalog.pricesAsOf);
  const place = COUNTRIES[country].place;
  const indexed = page.top.filter((t) => productIsIndexed(t)).map((t) => ({ name: t.name, path: `/pokemon/sealed/${t.slug}` }));
  const ranked = page.coverage > 0;

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson(
            webPage({ name: TITLE, href: PATH, description: DESCRIPTION, type: "CollectionPage" }),
            indexed.length ? pokemonItemList("Lowest price per pack", indexed) : null,
          ),
        }}
      />
      <Breadcrumbs
        trail={[
          { name: "Pokémon", href: "/pokemon" },
          { name: "Price per pack", href: PATH },
        ]}
      />

      <section className="card-surface mb-6 overflow-hidden border-l-2 border-rose-500 bg-ink-900">
        <div className="px-5 py-6 sm:px-6">
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Pokémon Price per Pack</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
            {catalog.tiles.length === 0
              ? "No prices yet."
              : ranked
                ? `We have a tracked listing with a known pack count for ${page.coverage.toLocaleString("en-US")} products in ${place}${asOf ? `, ${asOf}` : ""}. Each is ranked by its cheapest open listing divided by the booster packs inside: the lowest price per pack first, item price with postage extra.`
                : `We have no tracked listing with a known pack count in ${place}, so there is nothing to rank by price per pack here. TCGplayer's market price is a reference, not a listing, and is never ranked. Searches of your own eBay site are below.`}
          </p>
          {page.sections.length > 0 && (
            <nav aria-label="Product types on this page" className="mt-4 flex flex-wrap gap-1.5">
              {page.sections.map((s) => (
                <a key={s.kind} href={`#${s.kind}`} className="chip tap-link bg-ink-800 text-slate-300 hover:bg-ink-700 hover:text-white">
                  {s.label} <span className="num ml-1 text-slate-500">{s.total}</span>
                </a>
              ))}
            </nav>
          )}
        </div>
      </section>

      {ranked && (
        <section className="mb-8" aria-labelledby="top">
          <h2 id="top" className="scroll-mt-header mb-3 text-lg font-extrabold text-white">
            Lowest price per pack, every kind{asOf ? `, ${asOf}` : ""}
          </h2>
          <PerPackTable
            tiles={page.top}
            currency={currency}
            country={country}
            surface="pkmn-perpack"
            pageType="pokemon_perpack"
            caption={`The ${PER_PACK_TOP} sealed products with the lowest price per pack`}
            showKind
          />
        </section>
      )}

      {page.sections.map((s) => (
        <section key={s.kind} id={s.kind} className="scroll-mt-header mb-8" aria-labelledby={`${s.kind}-h`}>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <h2 id={`${s.kind}-h`} className="scroll-mt-header text-lg font-extrabold text-white">
              {s.label}
            </h2>
            {s.hub && (
              <Link href={s.hub.path} className="tap-link text-sm font-semibold text-brand-400 hover:underline">
                {s.hub.label}, every product →
              </Link>
            )}
          </div>
          <p className="mb-3 text-xs text-slate-400">
            {s.total > s.tiles.length
              ? `The ${s.tiles.length} lowest of ${s.total} ranked ${proseLabel(s.label)}${asOf ? `, ${asOf}` : ""}.`
              : `All ${s.total} ranked ${proseLabel(s.label)}${asOf ? `, ${asOf}` : ""}.`}
          </p>
          <PerPackTable
            tiles={s.tiles}
            currency={currency}
            country={country}
            surface="pkmn-perpack"
            pageType="pokemon_perpack"
            caption={`${s.label} ranked by price per pack`}
          />
        </section>
      ))}

      {!ranked && catalog.tiles.length > 0 && (
        <EbaySearchPanel
          heading="Search Pokémon sealed on eBay"
          sub={`We track no listings with a pack count in ${place}. These search your own eBay site and show every listing there, not a price we have checked.`}
          links={[
            { label: "Pokémon booster boxes", href: ebaySearchUrl(country, pokemonEbayQuery("booster box"), "pkmn-perpack") },
            { label: "Elite Trainer Boxes", href: ebaySearchUrl(country, pokemonEbayQuery("Elite Trainer Box"), "pkmn-perpack") },
            { label: "Booster bundles", href: ebaySearchUrl(country, pokemonEbayQuery("booster bundle"), "pkmn-perpack") },
            { label: "Booster packs", href: ebaySearchUrl(country, pokemonEbayQuery("booster pack"), "pkmn-perpack") },
          ]}
          country={country}
          pageType="pokemon_perpack"
          className="mb-8"
        />
      )}

      <section className="card-surface mb-6 space-y-3 p-6 text-sm leading-relaxed text-slate-300">
        <h2 className="text-lg font-extrabold text-white">How the price per pack is worked out</h2>
        {PER_PACK_METHOD.map((p) => (
          <p key={p.slice(0, 40)}>{p}</p>
        ))}
        <p>
          Every product of the main box types, with or without a listing, is on its own page:{" "}
          <Link href="/pokemon/booster-boxes" className="text-brand-400 hover:underline">
            booster boxes
          </Link>
          ,{" "}
          <Link href="/pokemon/elite-trainer-boxes" className="text-brand-400 hover:underline">
            Elite Trainer Boxes
          </Link>{" "}
          and{" "}
          <Link href="/pokemon/booster-bundles" className="text-brand-400 hover:underline">
            booster bundles
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
