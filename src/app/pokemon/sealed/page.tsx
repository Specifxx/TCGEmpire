import type { Metadata } from "next";
import Link from "next/link";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { ebaySearchUrl } from "@/lib/affiliate";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonCatalog } from "@/lib/pokemon/data";
import { SETLESS, SORTS, filterTiles, isFiltered, pageOf, parseBrowse, sortTiles, toDisplay } from "@/lib/pokemon/browse";
import { PK_KINDS } from "@/lib/pokemon/kinds";
import { pokemonEbayQuery } from "@/lib/pokemon/ebay-query";
import { sourceList } from "@/lib/pokemon/copy";
import type { PkCatalog } from "@/lib/pokemon/types";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SealedFilters } from "@/components/SealedFilters";
import { SealedSort } from "@/components/SealedSort";
import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { PokemonTile } from "@/components/pokemon/PokemonTile";

// Every Pokémon sealed product, filtered and sorted on the server from the
// market's cached catalogue — the /sealed page's shape (force-dynamic,
// searchParams, the same SealedFilters and SealedSort pointed at this path).
// Filtered and searched views are noindex, canonical to the clean page.
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

const TITLE = "All Pokémon Sealed Products: Prices Compared";
const DESCRIPTION =
  "Every English Pokémon sealed product from Sword & Shield on, with the cheapest TCGplayer and eBay listing we track in your market. Filter by set, product type and price.";

export function generateMetadata({ searchParams }: { searchParams: SP }): Metadata {
  if (!pokemonEnabled()) return notFoundMetadata();
  const q = parseBrowse(searchParams);
  return {
    title: q.q ? `${q.q}: Pokémon sealed prices` : TITLE,
    description: DESCRIPTION,
    alternates: pageAlternates("/pokemon/sealed"),
    openGraph: pageOpenGraph({ title: TITLE, description: DESCRIPTION, url: "/pokemon/sealed" }),
    robots: isFiltered(q) || q.page > 1 || q.sort ? { index: false, follow: true } : undefined,
  };
}

function pageHref(sp: SP, page: number): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val && k !== "page") p.set(k, val);
  }
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return qs ? `/pokemon/sealed?${qs}` : "/pokemon/sealed";
}

export default async function PokemonSealedPage({ searchParams }: { searchParams: SP }) {
  const country = getCountry();
  const currency = getDisplayCurrency(country);
  const showEur = country === "UK" && currency === "EUR";
  const query = parseBrowse(searchParams);
  let catalog: PkCatalog | null = null;
  try {
    catalog = await getPokemonCatalog(country);
  } catch (e) {
    console.error("[pokemon] catalogue read failed", e);
  }
  const all = catalog?.tiles ?? [];
  const results = sortTiles(filterTiles(all, query), query.sort);
  const { items, page, pages } = pageOf(results, query.page);
  const shown = toDisplay(items, showEur);

  const kindOptions = PK_KINDS.filter((k) => all.some((t) => t.kind === k.id)).map((k) => ({ value: k.id, label: k.plural }));
  const setOptions = [
    ...(catalog?.sets ?? []).map((s) => ({ code: s.slug, name: s.name })),
    ...(all.some((t) => !t.setSlug) ? [{ code: SETLESS, name: "Collections & other products" }] : []),
  ];
  const ebayHref = ebaySearchUrl(country, pokemonEbayQuery(query.q || "sealed"), "pkmn-browse");

  return (
    <div>
      <Breadcrumbs
        trail={[
          { name: "Pokémon", href: "/pokemon" },
          { name: "All sealed", href: "/pokemon/sealed" },
        ]}
      />
      <section className="card-surface mb-5 overflow-hidden border-l-2 border-rose-500 bg-ink-900">
        <div className="px-6 py-6">
          <h1 className="text-2xl font-extrabold text-white">All Pokémon Sealed Products</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            {all.length.toLocaleString()} English sealed products from Sword &amp; Shield to Mega Evolution, each with the
            cheapest listing we track in {COUNTRIES[country].place} and TCGplayer&apos;s market price beside it. Tap a product
            for every price, or open its page for all six markets.
          </p>
          {query.q && (
            <p className="mt-2 text-sm text-slate-400">
              Showing matches for <span className="text-brand-400">&ldquo;{query.q}&rdquo;</span>.{" "}
              <Link href="/pokemon/sealed" className="text-brand-400 hover:underline">
                Show all
              </Link>
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-6 xl:flex-row">
        <SealedFilters types={kindOptions} sets={setOptions} currency={currency} basePath="/pokemon/sealed" msrpFilter={false} />
        <section className="min-w-0 flex-1">
          <div id="results" className="mb-4 flex scroll-mt-36 flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              <span className="num font-semibold text-white">{results.length.toLocaleString()}</span>{" "}
              {results.length === 1 ? "product" : "products"}
              {pages > 1 && (
                <>
                  {" "}
                  · page {page} of {pages}
                </>
              )}
            </p>
            <SealedSort basePath="/pokemon/sealed" options={[...SORTS]} />
          </div>

          {shown.length === 0 ? (
            <div className="card-surface grid place-items-center p-12 text-center text-slate-400">
              <div>
                <p className="text-lg font-semibold text-white">
                  {isFiltered(query) ? "No Pokémon sealed products match" : "Pokémon prices are on their way"}
                </p>
                <p className="mt-1 text-sm">
                  {isFiltered(query) ? (
                    <Link href="/pokemon/sealed" className="text-brand-400 hover:underline">
                      Clear filters
                    </Link>
                  ) : (
                    "The first daily import has not run yet."
                  )}
                </p>
                <OutboundLink
                  href={ebayHref}
                  retailer="pkmn_ebay_search"
                  country={country}
                  kind="sealed"
                  pageType="pokemon_browse"
                  surface="ebay_search"
                  className="btn-ebay mt-4 inline-flex text-sm"
                >
                  Search eBay instead →
                </OutboundLink>
                <AffiliateDisclosure partner="ebay" tight />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((t) => (
                <PokemonTile key={t.id} tile={t} currency={currency} />
              ))}
            </div>
          )}

          {pages > 1 && (
            <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-2">
              {page > 1 && (
                <Link href={pageHref(searchParams, page - 1)} className="btn-ghost px-3 py-1.5 text-sm">
                  ← Previous
                </Link>
              )}
              <span className="text-sm text-slate-400">
                Page {page} of {pages}
              </span>
              {page < pages && (
                <Link href={pageHref(searchParams, page + 1)} className="btn-ghost px-3 py-1.5 text-sm">
                  Next →
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>

      <div className="mt-8 text-center">
        <p className="text-[11px] text-slate-500">
          Prices come from {sourceList(catalog?.sources ?? [])}, are checked once a day and may have changed since.
        </p>
        <AffiliateDisclosure partner="both" tight />
      </div>
    </div>
  );
}
