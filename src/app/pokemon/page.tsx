import type { Metadata } from "next";
import Link from "next/link";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { ebaySearchUrl } from "@/lib/affiliate";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonCatalog } from "@/lib/pokemon/data";
import { sortTiles, toDisplay } from "@/lib/pokemon/browse";
import { pokemonFaq, sourceList } from "@/lib/pokemon/copy";
import { pokemonEbayQuery, pokemonSetEbayQuery } from "@/lib/pokemon/ebay-query";
import { PK_KINDS } from "@/lib/pokemon/kinds";
import { formatDay } from "@/lib/pokemon/format";
import type { PkCatalog } from "@/lib/pokemon/types";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { PokemonTile } from "@/components/pokemon/PokemonTile";
import { PokemonSetCard } from "@/components/pokemon/PokemonSetCard";

// The Pokémon section's front page. Per-request like /sealed: the visitor's
// market comes from the cookie (getCountry), and the data from one cached
// catalogue read per market (lib/pokemon/data.ts), never a query of its own.
export const dynamic = "force-dynamic";

const TITLE = "Pokémon Sealed Prices: Booster Boxes, ETBs & Bundles";
const DESCRIPTION =
  "Compare Pokémon booster box, Elite Trainer Box and booster bundle prices on TCGplayer and eBay in your market, from Sword & Shield to Mega Evolution. Updated daily.";

export function generateMetadata(): Metadata {
  if (!pokemonEnabled()) return notFoundMetadata();
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: pageAlternates("/pokemon"),
    openGraph: pageOpenGraph({ title: TITLE, description: DESCRIPTION, url: "/pokemon" }),
  };
}

const QUICK_KINDS = ["booster-box", "etb", "booster-bundle", "pc-etb", "upc", "tin"] as const;

export default async function PokemonHub() {
  const country = getCountry();
  const currency = getDisplayCurrency(country);
  const showEur = country === "UK" && currency === "EUR";
  const place = COUNTRIES[country].place;
  let catalog: PkCatalog | null = null;
  try {
    catalog = await getPokemonCatalog(country);
  } catch (e) {
    console.error("[pokemon] catalogue read failed", e);
  }
  const tiles = catalog ? toDisplay(catalog.tiles, showEur) : [];
  const sets = catalog?.sets ?? [];
  const released = sets.filter((s) => !tiles.some((t) => t.setSlug === s.slug && t.presale));
  const newestSet = released[0] ?? sets[0];
  const newSetSlugs = new Set(released.slice(0, 4).map((s) => s.slug));
  const headline = sortTiles(
    tiles.filter((t) => t.setSlug && newSetSlugs.has(t.setSlug) && ["booster-box", "etb", "booster-bundle", "pc-etb"].includes(t.kind) && !/half/i.test(t.name)),
    "",
  ).slice(0, 8);
  const preorders = sortTiles(tiles.filter((t) => t.presale), "").slice(0, 8);
  const faq = pokemonFaq(catalog?.sources ?? []);
  const updated = formatDay(catalog?.pricesAsOf?.slice(0, 10));

  const ebayLinks = [
    ...(newestSet ? [{ label: `${newestSet.name} sealed`, href: ebaySearchUrl(country, pokemonSetEbayQuery(newestSet.name), "pkmn-hub") }] : []),
    { label: "Pokémon booster boxes", href: ebaySearchUrl(country, pokemonEbayQuery("booster box"), "pkmn-hub") },
    { label: "Elite Trainer Boxes", href: ebaySearchUrl(country, pokemonEbayQuery("Elite Trainer Box"), "pkmn-hub") },
    { label: "Booster bundles", href: ebaySearchUrl(country, pokemonEbayQuery("booster bundle"), "pkmn-hub") },
    { label: "Ultra-Premium Collections", href: ebaySearchUrl(country, pokemonEbayQuery("Ultra Premium Collection"), "pkmn-hub") },
  ];

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson(webPage({ name: TITLE, href: "/pokemon", description: DESCRIPTION, type: "CollectionPage" }), faqPage(faq)),
        }}
      />
      <Breadcrumbs trail={[{ name: "Pokémon", href: "/pokemon" }]} />

      <section className="card-surface animate-fade-up mb-6 overflow-hidden border-l-2 border-rose-500 bg-ink-900">
        <div className="px-6 py-7">
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Pokémon Sealed Prices</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Booster boxes, Elite Trainer Boxes, booster bundles and collections, priced on {sourceList(catalog?.sources ?? [])} for{" "}
            {place}. Cheapest listing first, with TCGplayer&apos;s market price beside it as a reference.
            {updated && <> Prices updated {updated}.</>}
          </p>
          <form action="/pokemon/sealed" method="get" className="mt-4 flex max-w-xl flex-wrap gap-2" role="search">
            <label htmlFor="pokemon-search" className="sr-only">
              Search Pokémon sealed products
            </label>
            <input
              id="pokemon-search"
              name="q"
              type="search"
              placeholder="Search: Prismatic Evolutions ETB, 151 booster bundle…"
              className="input min-w-0 flex-1 basis-56"
            />
            <button type="submit" className="btn-primary">
              Search
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {QUICK_KINDS.map((k) => {
              const info = PK_KINDS.find((x) => x.id === k);
              return info ? (
                <Link key={k} href={`/pokemon/sealed?type=${k}`} className="chip tap-link bg-ink-800 text-slate-300 hover:bg-ink-700 hover:text-white">
                  {info.plural}
                </Link>
              ) : null;
            })}
          </div>
        </div>
      </section>

      {!catalog || tiles.length === 0 ? (
        <div className="card-surface p-10 text-center text-slate-400">
          <p className="text-lg font-semibold text-white">Pokémon prices are on their way</p>
          <p className="mt-1 text-sm">The first daily import has not run yet. Check back soon.</p>
        </div>
      ) : (
        <>
          <section className="mb-8">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="text-lg font-extrabold text-white">Newest sets</h2>
              <Link href="/pokemon/sets" className="text-sm font-semibold text-brand-400 hover:underline">
                All {sets.length} sets →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {/* Three on a phone, where six stacked cards pushed every product a screen down. */}
              {sets.slice(0, 6).map((s, i) => (
                <PokemonSetCard key={s.slug} set={s} className={i >= 3 ? "hidden sm:flex" : ""} />
              ))}
            </div>
          </section>

          {headline.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="text-lg font-extrabold text-white">Boxes and bundles from recent sets</h2>
                <Link href="/pokemon/sealed?type=booster-box,etb,booster-bundle,pc-etb" className="text-sm font-semibold text-brand-400 hover:underline">
                  See all →
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {headline.map((t) => (
                  <PokemonTile key={t.id} tile={t} currency={currency} />
                ))}
              </div>
            </section>
          )}

          {preorders.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-lg font-extrabold text-white">Pre-orders</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {preorders.map((t) => (
                  <PokemonTile key={t.id} tile={t} currency={currency} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <EbaySearchPanel
        heading={`Search Pokémon sealed on eBay`}
        sub="Searches of your own eBay site. They show every listing, not a price we have checked."
        links={ebayLinks}
        country={country}
        pageType="pokemon_hub"
        className="mb-8"
      />

      <section className="card-surface mb-8 space-y-3 p-6 text-sm leading-relaxed text-slate-300">
        <h2 className="text-lg font-extrabold text-white">How these prices work</h2>
        <p>
          Every product is a TCGplayer catalogue entry, so a Phantasmal Flames Elite Trainer Box is one product here whichever
          shop sells it. For each one we show the cheapest listing we track in your market, ranked by item price with postage
          extra, and TCGplayer&apos;s market price underneath as a reference. Outside the United States that reference is
          converted with an approximate exchange rate and marked with ≈.
        </p>
        <p>
          eBay is matched carefully: a listing only counts when its title names the product, the right box type and no
          other set, and its price is plausible against the market price. Lots, empty boxes, graded items and other
          languages are left out. Where we have no matching listing, the product still links to a search of your own eBay
          site, so you can see everything listed there.
        </p>
        <p>
          The section is new and still a beta. If a price looks wrong, the{" "}
          <Link href="/contact" className="text-brand-400 hover:underline">
            contact page
          </Link>{" "}
          reaches the person who runs the site.
        </p>
      </section>

      <section className="card-surface mb-6 p-6">
        <h2 className="mb-3 text-lg font-extrabold text-white">Questions</h2>
        <dl className="space-y-4 text-sm">
          {faq.map((f) => (
            <div key={f.q}>
              <dt className="font-semibold text-white">{f.q}</dt>
              <dd className="mt-1 text-slate-400">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <AffiliateDisclosure partner="both" className="text-center" />
    </div>
  );
}
