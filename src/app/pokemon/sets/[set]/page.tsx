import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { ebaySearchUrl } from "@/lib/affiliate";
import { ldJson, webPage } from "@/lib/jsonld";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonCatalog } from "@/lib/pokemon/data";
import { sortTiles, toDisplay } from "@/lib/pokemon/browse";
import { PK_KINDS } from "@/lib/pokemon/kinds";
import { formatDay } from "@/lib/pokemon/format";
import { pokemonEbayQuery, pokemonSetEbayQuery } from "@/lib/pokemon/ebay-query";
import { pokemonItemList, pokemonMeta, productIsIndexed, setDescription, setTitle } from "@/lib/pokemon/seo";
import { setFacts, setProse } from "@/lib/pokemon/set-facts";
import type { PkCatalog, PkSetSummary } from "@/lib/pokemon/types";
import type { Country } from "@/lib/country";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { PokemonTile } from "@/components/pokemon/PokemonTile";
import { SetFacts } from "@/components/pokemon/SetFacts";
import { SetNav } from "@/components/pokemon/SetNav";
import { CopyPrices } from "@/components/pokemon/CopyPrices";
import { setShareText, shareTexts } from "@/lib/pokemon/share-text";

// One Pokémon expansion's sealed range, grouped by product type, priced for the
// visitor's market from the cached catalogue. Its paragraphs are written from
// the set's own data (lib/pokemon/set-facts.ts: the product mix, the lowest
// price per pack among its kinds, its booster box against the sets either side,
// its pre-orders), which is what makes forty-odd set pages different pages
// rather than one template.
export const dynamic = "force-dynamic";

type Params = { set: string };

// FAIL-OPEN (DECISIONS D14): an unknown slug is a 404; a read error is thrown
// (an HTTP 500), never turned into a 404 or a "something went wrong" 200.
async function load(slug: string, market: Country): Promise<{ catalog: PkCatalog; set: PkSetSummary } | null> {
  const catalog = await getPokemonCatalog(market);
  const set = catalog.sets.find((s) => s.slug === slug);
  return set ? { catalog, set } : null;
}

/** The catalogue in the visitor's display currency (the UK "show in EUR" preference), as the tiles show it. */
function displayed(catalog: PkCatalog, country: Country): PkCatalog {
  const currency = getDisplayCurrency(country);
  const showEur = country === "UK" && currency === "EUR";
  return showEur ? { ...catalog, currency, tiles: toDisplay(catalog.tiles, true) } : catalog;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!pokemonEnabled()) return notFoundMetadata();
  const country = getCountry();
  const loaded = await load(params.set, country);
  if (!loaded) return notFoundMetadata("Set");
  const facts = setFacts(displayed(loaded.catalog, country), loaded.set.slug, new Date());
  if (!facts) return notFoundMetadata("Set");
  return pokemonMeta({
    title: setTitle(loaded.set.name, { perPack: facts.countable }),
    description: setDescription(facts),
    path: `/pokemon/sets/${loaded.set.slug}`,
    // The route's own opengraph-image.tsx shows the set's prices.
    ogImage: "colocated",
  });
}

export default async function PokemonSetPage({ params }: { params: Params }) {
  const country = getCountry();
  const loaded = await load(params.set, country);
  if (!loaded) notFound();
  const catalog = displayed(loaded.catalog, country);
  const { set } = loaded;
  const facts = setFacts(catalog, set.slug, new Date());
  if (!facts) notFound();
  const currency = catalog.currency;

  const tiles = catalog.tiles.filter((t) => t.setSlug === set.slug);
  const groups = PK_KINDS.map((k) => ({ kind: k, tiles: sortTiles(tiles.filter((t) => t.kind === k.id), "price_asc") })).filter(
    (g) => g.tiles.length,
  );
  const listed = formatDay(set.releasedOn);
  const prose = setProse(facts);
  // The first row of tiles is above the fold on a phone and a desktop alike.
  const eagerIds = new Set(groups.flatMap((g) => g.tiles).slice(0, 4).map((t) => t.id));
  // Copy text from the market's own figures (share-text converts pounds to
  // euros itself and says so), not from the displayed catalogue.
  const showEur = country === "UK" && getDisplayCurrency(country) === "EUR";
  const copyTexts = shareTexts((o) => setShareText(loaded.catalog, set.slug, { ...o, eur: showEur }) ?? "");
  const indexed = tiles.filter((t) => productIsIndexed(t)).map((t) => ({ name: t.name, path: `/pokemon/sealed/${t.slug}` }));

  const ebayLinks = [
    { label: `${set.name} sealed`, href: ebaySearchUrl(country, pokemonSetEbayQuery(set.name), "pkmn-set") },
    ...(tiles.some((t) => t.kind === "booster-box")
      ? [{ label: `${set.name} booster box`, href: ebaySearchUrl(country, pokemonEbayQuery(`${set.name} booster box`), "pkmn-set") }]
      : []),
    ...(tiles.some((t) => t.kind === "etb")
      ? [{ label: `${set.name} Elite Trainer Box`, href: ebaySearchUrl(country, pokemonEbayQuery(`${set.name} Elite Trainer Box`), "pkmn-set") }]
      : []),
  ];

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson(
            webPage({ name: `${set.name} Sealed Prices`, href: `/pokemon/sets/${set.slug}`, type: "CollectionPage" }),
            indexed.length ? pokemonItemList(`${set.name} sealed products`, indexed) : null,
          ),
        }}
      />
      <Breadcrumbs
        trail={[
          { name: "Pokémon", href: "/pokemon" },
          { name: "Sets", href: "/pokemon/sets" },
          { name: set.name, href: `/pokemon/sets/${set.slug}` },
        ]}
      />
      <section className="card-surface mb-6 overflow-hidden border-l-2 border-rose-500 bg-ink-900">
        <div className="px-6 py-6">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip bg-ink-800 text-slate-300">{set.series}</span>
            {set.code && <span className="chip bg-ink-800 text-slate-300">{set.code}</span>}
            {facts.preorders.count > 0 && <span className="chip bg-sky-500/15 font-semibold text-sky-300">Pre-orders open</span>}
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">{set.name} Sealed Prices</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            {/* A set not out yet gets its date in the pre-order paragraph below, once. */}
            {set.name} is a {set.series} expansion{listed && !facts.upcoming ? `; TCGplayer lists ${listed} for it` : ""}. Prices are for{" "}
            {facts.place}
            {facts.asOf ? `, ${facts.asOf}` : ""}, and every product links to all the prices we have for it.
          </p>
          <SetFacts blocks={prose} className="mt-3" />
          {copyTexts.reddit.plain && <CopyPrices className="mt-4" page="pokemon_set" texts={copyTexts} />}
        </div>
      </section>

      <nav aria-label="Product types in this set" className="mb-5 flex flex-wrap gap-1.5">
        {groups.map((g) => (
          <a key={g.kind.id} href={`#${g.kind.id}`} className="chip tap-link bg-ink-800 text-slate-300 hover:bg-ink-700 hover:text-white">
            {g.kind.plural} <span className="num ml-1 text-slate-500">{g.tiles.length}</span>
          </a>
        ))}
      </nav>

      {groups.map((g) => (
        <section key={g.kind.id} id={g.kind.id} className="scroll-mt-header mb-8">
          <h2 className="mb-3 text-lg font-extrabold text-white">
            {set.name}: {g.kind.plural}
          </h2>
          <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
            {g.tiles.map((t) => (
              <PokemonTile key={t.id} tile={t} currency={currency} showSet={false} eager={eagerIds.has(t.id)} />
            ))}
          </div>
        </section>
      ))}

      <EbaySearchPanel
        heading={`${set.name} on eBay`}
        sub="Searches of your own eBay site: every listing, not a price we have checked."
        links={ebayLinks}
        country={country}
        pageType="pokemon_set"
        className="mb-6"
      />

      <SetNav older={facts.nav.older} newer={facts.nav.newer} />

      <p className="mb-2 text-center text-xs text-slate-500">
        <Link href="/pokemon/sets" className="text-brand-400 hover:underline">
          ← Every Pokémon set
        </Link>
      </p>
      <AffiliateDisclosure partner="both" className="text-center" />
    </div>
  );
}
