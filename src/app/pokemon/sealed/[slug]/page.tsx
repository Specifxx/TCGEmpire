import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COUNTRY_LIST, DEFAULT_COUNTRY } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { offerStock } from "@/lib/sealed-offers";
import { faqPage, ldJson } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonCatalog, getPokemonProduct } from "@/lib/pokemon/data";
import { allBoards } from "@/lib/pokemon/board";
import { kindInfo } from "@/lib/pokemon/kinds";
import { formatDay, kindNoun, pokemonImageAlt, sourceWord, thumbOf } from "@/lib/pokemon/format";
import { pokemonMeta, productDescription, productIsIndexed, productTitle } from "@/lib/pokemon/seo";
import { productFacts, productFaq, productProse } from "@/lib/pokemon/product-facts";
import type { PkCatalog } from "@/lib/pokemon/types";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PokemonProductBoard } from "@/components/pokemon/PokemonProductBoard";
import { PokemonPriceChart } from "@/components/pokemon/PokemonPriceChart";
import { ProductFacts } from "@/components/pokemon/ProductFacts";
import { ProductFaq } from "@/components/pokemon/ProductFaq";
import { CopyPrices } from "@/components/pokemon/CopyPrices";
import { offersAsOf } from "@/lib/pokemon/share-text";
import { getPokemonPosts } from "@/lib/pokemon/blog/index";
import type { PkKind } from "@/lib/pokemon/kinds";

// One Pokémon sealed product: every market's prices, its market-price history
// and what is inside. ISR like a Riftbound card page, and for the same reasons:
// no cookie or header read anywhere in this tree, every market's board shipped
// and localised client-side (PokemonProductBoard), nothing prerendered at build.
// The reads are getPokemonProduct and, for the comparisons, the US catalogue the
// grid pages share; both are cached for exactly this page's TTL under the
// "pokemon" tag the daily import purges.
export const revalidate = 21600;

// An EMPTY list, as /card/[id] has: it is what makes Next cache each product
// page on its first visit (ISR) instead of rendering every request, while
// prerendering none of them at build (CLAUDE.md: no prewarming).
export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Params = { slug: string };

// Which posts a product page links, by its kind. Filtered through
// getPokemonPosts(), so a draft is never linked; a post's publishing commit
// is also a release, which renders these pages afresh.
const POSTS_BY_KIND: Record<string, readonly PkKind[]> = {
  "booster-box-vs-etb-vs-booster-bundle": ["booster-box", "etb", "pc-etb", "booster-bundle"],
  "pokemon-center-etb-vs-elite-trainer-box": ["etb", "pc-etb"],
};

// FAIL-OPEN (DECISIONS D14): only a product that is not in the catalogue is a
// 404. A read error is thrown, never caught into notFound(): ISR then keeps
// serving the last good page, and a first render fails with a 500, which is
// neither cached for six hours nor read by a crawler as "gone".
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!pokemonEnabled()) return notFoundMetadata();
  const p = await getPokemonProduct(params.slug);
  if (!p) return notFoundMetadata("Product");
  const facts = productFacts(p, null, Date.now());
  return pokemonMeta({
    title: productTitle(p.name),
    description: productDescription(facts),
    path: `/pokemon/sealed/${p.slug}`,
    // The route's own opengraph-image.tsx shows this product's prices.
    ogImage: "colocated",
    robots: productIsIndexed(p) ? undefined : { index: false, follow: true },
  });
}

export default async function PokemonProductPage({ params }: { params: Params }) {
  // Gate here too, not only in the layout: Next renders the layout and the page
  // in parallel, so a page that reads first would fail with a 500 when the
  // section is off rather than 404.
  if (!pokemonEnabled()) notFound();
  const p = await getPokemonProduct(params.slug);
  if (!p) notFound();

  // The comparisons need the US catalogue. It is the grids' own cached read,
  // so a failure here costs only those paragraphs, never the page.
  let usCatalog: PkCatalog | null = null;
  try {
    usCatalog = await getPokemonCatalog("US");
  } catch (e) {
    console.error("[pokemon] US catalogue read failed; product comparisons left out", e);
  }

  const now = Date.now();
  const facts = productFacts(p, usCatalog, now);
  const prose = productProse(facts);
  const faq = productFaq(facts);
  const kind = kindInfo(p.kind);
  const boards = allBoards(p.name, p.offers, { page: `/pokemon/sealed/${p.slug}`, surface: "product", now });
  const base = boards[DEFAULT_COUNTRY];
  const released = formatDay(p.releasedOn);
  const usOpen = base.listings.filter((l) => offerStock(l, now) === "open");
  const guides = getPokemonPosts().filter((post) => POSTS_BY_KIND[post.slug]?.includes(p.kind));

  // Product + AggregateOffer for the default market only, and only when there
  // is an open listing to back it (Google flags a Product with no offers).
  // Without one the page carries BreadcrumbList and FAQPage only.
  const productLd = usOpen.length
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        category: "Trading Card Game Sealed Product",
        brand: { "@type": "Brand", name: "Pokémon" },
        ...(p.imageUrl ? { image: p.imageUrl } : {}),
        ...(p.upc && [8, 12, 13, 14].includes(p.upc.length) ? { gtin: p.upc } : {}),
        url: `${SITE_URL}/pokemon/sealed/${p.slug}`,
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: base.currency,
          lowPrice: (Math.min(...usOpen.map((l) => l.priceCents)) / 100).toFixed(2),
          highPrice: (Math.max(...usOpen.map((l) => l.priceCents)) / 100).toFixed(2),
          offerCount: usOpen.length,
          availability: p.presale ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
        },
      }
    : null;
  const faqLd = faqPage(faq);

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
      {(productLd || faqLd) && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(productLd, faqLd) }} />}
      {/* Wraps: a product name runs to 90-odd characters, and an unwrapped
          trail was cut off at the edge of a phone screen. */}
      <Breadcrumbs trail={trail} className="mb-3 flex-wrap" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div>
          {/* Capped on phones so the price board starts on the first screen. The
              image is out of flow, so its 1000px intrinsic width can never widen
              the page (the invariant tests/hero-image-fit.test.ts records). */}
          <div className="card-surface relative mx-auto grid aspect-square w-full max-w-[15rem] place-items-center overflow-hidden bg-white/95 p-6 lg:max-w-none">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imageUrl}
                alt={pokemonImageAlt(p.name)}
                width={1000}
                height={1000}
                fetchPriority="high"
                decoding="async"
                className="absolute inset-0 h-full w-full object-contain p-6"
              />
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
          {/* break-words: "[Glaceon/Vaporeon/Sylveon/Espeon]" is one unbreakable word wider than a phone. */}
          <h1 className="mt-2 break-words text-2xl font-extrabold leading-tight text-white sm:text-3xl">{p.name}</h1>
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
            {released && <> · TCGplayer lists {released}</>}
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

      <ProductFacts facts={facts} prose={prose} />

      <section className="card-surface mt-6 p-5">
        <h2 className="text-lg font-extrabold text-white">Copy these prices</h2>
        <CopyPrices
          className="mt-3"
          page="pokemon_product"
          product={{ boards, name: p.name, slug: p.slug, packCount: p.packCount, asOf: offersAsOf(p.offers) }}
        />
      </section>

      {guides.length > 0 && (
        <section className="card-surface mt-6 p-5">
          <h2 className="text-lg font-extrabold text-white">Guides</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {guides.map((g) => (
              <li key={g.slug}>
                <Link href={`/pokemon/blog/${g.slug}`} className="tap-link font-semibold text-brand-400 hover:underline">
                  {g.title}
                </Link>
                <span className="block text-slate-400">{g.excerpt}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card-surface mt-6 p-5">
        <h2 className="mb-3 text-lg font-extrabold text-white">TCGplayer market price history (US$)</h2>
        <PokemonPriceChart points={p.history} />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card-surface p-5">
          <h2 className="text-lg font-extrabold text-white">Contents, as TCGplayer lists them</h2>
          {p.contents.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {p.contents.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-400">TCGplayer publishes no contents list for this product.</p>
          )}
        </section>
        <section className="card-surface p-5">
          <h2 className="text-lg font-extrabold text-white">About {kindNoun(kind, 2)}</h2>
          <p className="mt-2 text-sm text-slate-300">{kind.about}</p>
          <p className="mt-2 text-sm text-slate-400">
            Prices here are listings, checked once a day: the item price, with postage extra unless an eBay seller states
            it. Check the listing itself before you buy.
          </p>
        </section>
      </div>

      <ProductFaq faq={faq} />

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
