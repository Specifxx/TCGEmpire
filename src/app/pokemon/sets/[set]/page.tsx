import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { ebaySearchUrl } from "@/lib/affiliate";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonCatalog } from "@/lib/pokemon/data";
import { sortTiles, toDisplay } from "@/lib/pokemon/browse";
import { PK_KINDS } from "@/lib/pokemon/kinds";
import { formatDay, sourceWord } from "@/lib/pokemon/format";
import { pokemonEbayQuery, pokemonSetEbayQuery } from "@/lib/pokemon/ebay-query";
import type { PkCatalog, PkTile } from "@/lib/pokemon/types";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { PokemonTile } from "@/components/pokemon/PokemonTile";

// One Pokémon expansion's sealed range, grouped by product type, priced for the
// visitor's market from the cached catalogue. Its summary paragraph is written
// from the set's own data (counts, dates, the cheapest box and ETB), which is
// what makes 40-odd set pages different pages rather than one template.
export const dynamic = "force-dynamic";

type Params = { set: string };

async function load(slug: string, market: Parameters<typeof getPokemonCatalog>[0]): Promise<PkCatalog | null> {
  try {
    const c = await getPokemonCatalog(market);
    return c.sets.some((s) => s.slug === slug) ? c : null;
  } catch (e) {
    console.error("[pokemon] catalogue read failed", e);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!pokemonEnabled()) return notFoundMetadata();
  const catalog = await load(params.set, getCountry());
  const set = catalog?.sets.find((s) => s.slug === params.set);
  if (!set) return notFoundMetadata("Set");
  const title = `${set.name} Sealed Prices: Booster Box, ETB & More`;
  const description = `Prices for all ${set.productCount} ${set.name} sealed products (${set.series}): booster boxes, Elite Trainer Boxes, bundles and collections, compared on TCGplayer and eBay. Updated daily.`;
  return {
    title,
    description,
    alternates: pageAlternates(`/pokemon/sets/${set.slug}`),
    openGraph: pageOpenGraph({
      title,
      description,
      url: `/pokemon/sets/${set.slug}`,
      ...(set.imageUrl ? { images: [set.imageUrl] } : {}),
    }),
  };
}

function cheapestOf(tiles: PkTile[], kind: string): PkTile | null {
  return (
    tiles
      .filter((t) => t.kind === kind && t.lowCents != null && !/half/i.test(t.name))
      .sort((a, b) => (a.lowCents as number) - (b.lowCents as number))[0] ?? null
  );
}

export default async function PokemonSetPage({ params }: { params: Params }) {
  const country = getCountry();
  const currency = getDisplayCurrency(country);
  const showEur = country === "UK" && currency === "EUR";
  const catalog = await load(params.set, country);
  const set = catalog?.sets.find((s) => s.slug === params.set);
  if (!catalog || !set) notFound();

  const tiles = toDisplay(
    catalog.tiles.filter((t) => t.setSlug === set.slug),
    showEur,
  );
  const groups = PK_KINDS.map((k) => ({ kind: k, tiles: sortTiles(tiles.filter((t) => t.kind === k.id), "price_asc") })).filter(
    (g) => g.tiles.length,
  );
  const released = formatDay(set.releasedOn);
  const upcoming = tiles.some((t) => t.presale);
  const box = cheapestOf(tiles, "booster-box");
  const etb = cheapestOf(tiles, "etb");
  const place = COUNTRIES[country].place;

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
            {upcoming && <span className="chip bg-sky-500/15 font-semibold text-sky-300">Pre-orders open</span>}
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">{set.name} Sealed Prices</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            {set.name} is a {set.series} expansion{released ? (upcoming ? ` releasing ${released}` : ` released ${released}`) : ""}.
            We price {set.productCount} of its sealed products for {place}.
            {box?.lowCents != null && (
              <>
                {" "}
                The cheapest booster box we track today is {formatMoney(box.lowCents, currency)} {sourceWord(box.lowSource)}
                {etb?.lowCents != null ? "," : "."}
              </>
            )}
            {etb?.lowCents != null && (
              <>
                {box?.lowCents != null ? " and the" : " The"} cheapest Elite Trainer Box is {formatMoney(etb.lowCents, currency)}{" "}
                {sourceWord(etb.lowSource)}.
              </>
            )}{" "}
            Tap any product for every price we have for it.
          </p>
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
          <h2 className="mb-1 text-lg font-extrabold text-white">
            {set.name}: {g.kind.plural}
          </h2>
          <p className="mb-3 max-w-3xl text-xs text-slate-500">{g.kind.about}</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {g.tiles.map((t) => (
              <PokemonTile key={t.id} tile={t} currency={currency} showSet={false} />
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

      <p className="mb-2 text-center text-xs text-slate-500">
        <Link href="/pokemon/sets" className="text-brand-400 hover:underline">
          ← Every Pokémon set
        </Link>
      </p>
      <AffiliateDisclosure partner="both" className="text-center" />
    </div>
  );
}
