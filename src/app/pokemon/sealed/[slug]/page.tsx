import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COUNTRY_LIST, DEFAULT_COUNTRY } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { offerStock } from "@/lib/sealed-offers";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { ldJson } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { pokemonIndexProducts } from "@/lib/pokemon/flag";
import { getPokemonProduct } from "@/lib/pokemon/data";
import { allBoards } from "@/lib/pokemon/board";
import { kindInfo } from "@/lib/pokemon/kinds";
import { formatDay, pokemonImageAlt, sourceWord, thumbOf } from "@/lib/pokemon/format";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PokemonProductBoard } from "@/components/pokemon/PokemonProductBoard";
import { PokemonPriceChart } from "@/components/pokemon/PokemonPriceChart";

// One Pokémon sealed product: every market's prices, its market-price history
// and what is inside. ISR like a Riftbound card page, and for the same reasons:
// no cookie or header read anywhere in this tree, every market's board shipped
// and localised client-side (PokemonProductBoard), nothing prerendered at build.
// The one read is getPokemonProduct, cached for exactly this page's TTL under
// the "pokemon" tag the daily import purges.
export const revalidate = 21600;

// An EMPTY list, as /card/[id] has: it is what makes Next cache each product
// page on its first visit (ISR) instead of rendering every request, while
// prerendering none of them at build (CLAUDE.md: no prewarming).
export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!pokemonEnabled()) return notFoundMetadata();
  const p = await getPokemonProduct(params.slug).catch(() => null);
  if (!p) return notFoundMetadata("Product");
  const title = `${p.name} Price`;
  const where = p.set ? ` from ${p.set.name}` : "";
  const description = `${p.name}${where}: the cheapest TCGplayer and eBay listings we track in six markets, TCGplayer's market price and its price history. Updated daily.`;
  return {
    title,
    description,
    alternates: pageAlternates(`/pokemon/sealed/${p.slug}`),
    openGraph: pageOpenGraph({
      title,
      description,
      url: `/pokemon/sealed/${p.slug}`,
      ...(p.imageUrl ? { images: [p.imageUrl] } : {}),
    }),
    robots: pokemonIndexProducts() ? undefined : { index: false, follow: true },
  };
}

export default async function PokemonProductPage({ params }: { params: Params }) {
  const p = await getPokemonProduct(params.slug).catch(() => null);
  if (!p) notFound();

  const kind = kindInfo(p.kind);
  const boards = allBoards(p.name, p.offers, { page: `/pokemon/sealed/${p.slug}`, surface: "product" });
  const base = boards[DEFAULT_COUNTRY];
  const released = formatDay(p.releasedOn);
  const usOpen = base.listings.filter((l) => offerStock(l) === "open");

  // Product + AggregateOffer for the default market only, and only when there
  // is an open listing to back it (Google flags a Product with no offers).
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    category: "Trading Card Game Sealed Product",
    brand: { "@type": "Brand", name: "Pokémon" },
    ...(p.imageUrl ? { image: p.imageUrl } : {}),
    ...(p.upc && [8, 12, 13, 14].includes(p.upc.length) ? { gtin: p.upc } : {}),
    url: `${SITE_URL}/pokemon/sealed/${p.slug}`,
    ...(usOpen.length
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: base.currency,
            lowPrice: (Math.min(...usOpen.map((l) => l.priceCents)) / 100).toFixed(2),
            highPrice: (Math.max(...usOpen.map((l) => l.priceCents)) / 100).toFixed(2),
            offerCount: usOpen.length,
            availability: p.presale ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
          },
        }
      : {}),
  };

  const trail = p.set
    ? [
        { name: "Pokémon", href: "/pokemon" },
        { name: p.set.name, href: `/pokemon/sets/${p.set.slug}` },
        { name: p.name, href: `/pokemon/sealed/${p.slug}` },
      ]
    : [
        { name: "Pokémon", href: "/pokemon" },
        { name: "All sealed", href: "/pokemon/sealed" },
        { name: p.name, href: `/pokemon/sealed/${p.slug}` },
      ];

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(productLd) }} />
      <Breadcrumbs trail={trail} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div>
          {/* Capped on phones so the price board starts on the first screen. */}
          <div className="card-surface mx-auto grid aspect-square w-full max-w-[15rem] place-items-center overflow-hidden bg-white/95 p-6 lg:max-w-none">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt={pokemonImageAlt(p.name)} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-sm font-bold text-slate-600">{kind.label}</span>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip bg-brand-500/15 font-semibold text-brand-300">{kind.label}</span>
            {p.presale && <span className="chip bg-sky-500/15 font-semibold text-sky-300">Pre-order</span>}
            <span className="chip bg-ink-800 text-slate-300">{p.series}</span>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight text-white sm:text-3xl">{p.name}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {p.set ? (
              <>
                From{" "}
                <Link href={`/pokemon/sets/${p.set.slug}`} className="text-brand-400 hover:underline">
                  {p.set.name}
                </Link>
              </>
            ) : (
              "A Pokémon TCG collection product"
            )}
            {released && <>{p.presale ? ` · releases ${released}` : ` · released ${released}`}</>}
          </p>

          <section className="card-surface mt-4 p-4">
            <PokemonProductBoard boards={boards} preorder={p.presale} />
          </section>
        </div>
      </div>

      <section className="card-surface mt-6 p-5">
        <h2 className="text-lg font-extrabold text-white">Prices in every market</h2>
        <p className="mt-1 text-xs text-slate-500">
          The cheapest listing we track in each market, in its own currency, and TCGplayer&apos;s market price beside it
          (converted outside the US, so marked ≈).
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-semibold">Market</th>
                <th className="py-2 pr-3 font-semibold">Cheapest we track</th>
                <th className="py-2 font-semibold">TCGplayer market</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {COUNTRY_LIST.map((c) => {
                const b = boards[c.code];
                const ref = b.references.find((r) => r.source === "tcgplayer_market");
                return (
                  <tr key={c.code}>
                    <td className="py-2 pr-3 text-slate-200">
                      <span aria-hidden className="mr-1.5">
                        {c.flag}
                      </span>
                      <span className="sm:hidden">{c.code}</span>
                      <span className="hidden sm:inline">{c.label}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {b.headline ? (
                        <>
                          <span className="num whitespace-nowrap font-semibold text-white">{formatMoney(b.headline.priceCents, b.currency)}</span>{" "}
                          <span className="block text-xs text-slate-500 sm:inline">{sourceWord(b.headline.source)}</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-500">No tracked listing</span>
                      )}
                    </td>
                    <td className="num whitespace-nowrap py-2 text-slate-300">
                      {ref ? `${ref.converted ? "≈ " : ""}${formatMoney(ref.priceCents, b.currency)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-surface mt-6 p-5">
        <h2 className="mb-3 text-lg font-extrabold text-white">TCGplayer market price history (US$)</h2>
        <PokemonPriceChart points={p.history} />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card-surface p-5">
          <h2 className="text-lg font-extrabold text-white">What&apos;s inside</h2>
          {p.contents.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {p.contents.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-400">The publisher&apos;s contents list for this product isn&apos;t in our data.</p>
          )}
        </section>
        <section className="card-surface p-5">
          <h2 className="text-lg font-extrabold text-white">About {kind.plural.toLowerCase()}</h2>
          <p className="mt-2 text-sm text-slate-300">{kind.about}</p>
          <p className="mt-2 text-sm text-slate-400">
            Prices here are listings, checked once a day: the item price, with postage extra unless an eBay seller states
            it. Check the listing itself before you buy.
          </p>
        </section>
      </div>

      {p.siblings.length > 0 && p.set && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-extrabold text-white">More from {p.set.name}</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {p.siblings.slice(0, 18).map((s) => {
              const thumb = thumbOf(s.imageUrl);
              return (
                <li key={s.slug}>
                  <Link
                    href={`/pokemon/sealed/${s.slug}`}
                    className="card-surface flex items-center gap-3 p-2 text-sm text-slate-200 hover:border-ink-600 hover:text-white"
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded bg-white/95 p-1">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" aria-hidden="true" loading="lazy" className="max-h-full max-w-full object-contain" />
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-2">{s.name}</span>
                      <span className="text-xs text-slate-500">{kindInfo(s.kind).label}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {p.siblings.length > 18 && (
            <p className="mt-2 text-sm">
              <Link href={`/pokemon/sets/${p.set.slug}`} className="text-brand-400 hover:underline">
                All {p.siblings.length + 1} {p.set.name} products →
              </Link>
            </p>
          )}
        </section>
      )}
    </div>
  );
}
