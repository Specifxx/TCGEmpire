import type { Metadata } from "next";
import Link from "next/link";
import { getSealedGroups } from "@/lib/sealed-import";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/country";
import { gbpCentsToEur } from "@/lib/fx";
import { affiliateUrl, ebayAffiliateUrl } from "@/lib/affiliate";
import { OutboundLink } from "@/components/OutboundLink";
import { Reveal } from "@/components/Reveal";
import { SealedFilters } from "@/components/SealedFilters";
import { SealedSort } from "@/components/SealedSort";
import { SealedTile } from "@/components/SealedTile";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

interface SealedParams {
  q?: string | string[];
  type?: string | string[];
  set?: string | string[];
  min?: string | string[];
  max?: string | string[];
  instock?: string | string[];
  atmsrp?: string | string[];
  sort?: string | string[];
}
const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] ?? "" : v ?? "");
const csvParam = (v?: string | string[]) => one(v).split(",").map((s) => s.trim()).filter(Boolean);
const isFilteredParams = (sp: SealedParams) =>
  Boolean(one(sp.q) || one(sp.type) || one(sp.set) || one(sp.min) || one(sp.max) || one(sp.instock) || one(sp.atmsrp));

// Marketplace hosts per site market (NZ has no local eBay/Amazon — the AU sites
// are the closest and ship there).
const MARKETPLACE_HOSTS: Record<string, { ebay: string; amazon: string }> = {
  AU: { ebay: "ebay.com.au", amazon: "amazon.com.au" },
  NZ: { ebay: "ebay.com.au", amazon: "amazon.com.au" },
  US: { ebay: "ebay.com", amazon: "amazon.com" },
  UK: { ebay: "ebay.co.uk", amazon: "amazon.co.uk" },
};
const SEALED_SEARCHES = [
  { label: "Vendetta sealed", q: "Riftbound Vendetta sealed" },
  { label: "Booster boxes", q: "Riftbound booster box" },
  { label: "Booster packs", q: "Riftbound booster pack" },
  { label: "Proving Grounds kits", q: "Riftbound Proving Grounds" },
  { label: "All sealed Riftbound", q: "Riftbound TCG sealed" },
];

// Internal search-result views (?q=) are noindex'd (Google/Bing discourage indexing
// site-search results); every variant canonicalises to the clean /sealed so crawl
// signals concentrate on the one page we want ranked. Mirrors browse/page.tsx.
export async function generateMetadata({ searchParams }: { searchParams: SealedParams }): Promise<Metadata> {
  const q = one(searchParams.q).trim();
  return {
    title: q
      ? `${q} — Riftbound sealed products`
      : "Riftbound Sealed Prices — Boxes, Packs & Sets",
    description:
      "Compare live prices on Riftbound booster boxes, packs, bundles & Proving Grounds across AU, NZ, US, UK & SG stores — find the cheapest sealed. Updated daily.",
    alternates: { canonical: "/sealed" },
    robots: isFilteredParams(searchParams) ? { index: false, follow: true } : undefined,
  };
}

export default async function SealedPage({ searchParams }: { searchParams: SealedParams }) {
  const country = getCountry();
  const info = COUNTRIES[country];
  // Sealed data is sourced per market (AU/NZ stores + US TCGplayer). For a market
  // with no rows of its own (e.g. UK), fall back to the default market so the page
  // is never blank — and price it in that market's currency so the currency stays
  // honest.
  //
  // The fallback was AU, chosen when AU was the default market. US is now both the
  // default AND the market with the broadest sealed coverage (TCGplayer), so an
  // unserved visitor lands somewhere fuller rather than in AUD for no reason.
  let all = await getSealedGroups(country);
  let priceCountry = country;
  if (all.length === 0 && country !== DEFAULT_COUNTRY) {
    all = await getSealedGroups(DEFAULT_COUNTRY);
    priceCountry = DEFAULT_COUNTRY;
  }
  const usingFallback = priceCountry !== country;
  const q = one(searchParams.q).trim();
  const ql = q.toLowerCase();
  const typesSel = csvParam(searchParams.type);
  const setsSel = csvParam(searchParams.set);
  const minCents = one(searchParams.min) ? Math.round(parseFloat(one(searchParams.min)) * 100) : null;
  const maxCents = one(searchParams.max) ? Math.round(parseFloat(one(searchParams.max)) * 100) : null;
  const instock = one(searchParams.instock) === "1";
  const atMsrpOnly = one(searchParams.atmsrp) === "1";
  const sort = one(searchParams.sort);
  const isFiltered = isFilteredParams(searchParams);

  // Facet options — only the product types / sets that actually exist in the feed.
  const typeOptions = [...new Set(all.map((g) => g.productType))].sort((a, b) => a.localeCompare(b));
  const setOptions = [...new Set(all.map((g) => g.setCode).filter((c): c is string => !!c))]
    .sort()
    .map((code) => ({ code, name: code }));

  let groups = all;
  if (typesSel.length) groups = groups.filter((g) => typesSel.includes(g.productType));
  if (setsSel.length) groups = groups.filter((g) => g.setCode != null && setsSel.includes(g.setCode));
  if (instock) groups = groups.filter((g) => g.storeCount > 0);
  if (atMsrpOnly) groups = groups.filter((g) => g.atMsrp);
  if (minCents != null) groups = groups.filter((g) => g.lowestPriceCents != null && g.lowestPriceCents >= minCents);
  if (maxCents != null) groups = groups.filter((g) => g.lowestPriceCents != null && g.lowestPriceCents <= maxCents);
  if (ql)
    groups = groups.filter(
      (g) =>
        g.name.toLowerCase().includes(ql) ||
        g.productType.toLowerCase().includes(ql) ||
        (g.setCode ?? "").toLowerCase().includes(ql)
    );

  if (sort === "price_asc") groups = [...groups].sort((a, b) => (a.lowestPriceCents ?? Infinity) - (b.lowestPriceCents ?? Infinity));
  else if (sort === "price_desc") groups = [...groups].sort((a, b) => (b.lowestPriceCents ?? -1) - (a.lowestPriceCents ?? -1));
  else if (sort === "name") groups = [...groups].sort((a, b) => a.name.localeCompare(b.name));
  else
    // Default: float the freshly-live Vendetta (VEN) sealed to the top via a stable
    // sort, leaving every other group in its (already-filtered) order.
    groups = groups
      .map((g, i) => [g, i] as const)
      .sort((a, b) => {
        const av = a[0].setCode === "VEN" ? 0 : 1;
        const bv = b[0].setCode === "VEN" ? 0 : 1;
        return av - bv || a[1] - b[1];
      })
      .map(([g]) => g);

  // Show the "Vendetta is here" callout only on the unfiltered view, and only when
  // Vendetta sealed actually exists in the feed.
  const hasVendetta = !isFiltered && all.some((g) => g.setCode === "VEN");

  // Structured data: BreadcrumbList (mirrors the visible nav) + an ItemList of the
  // rendered groups. Google requires a Product to carry "offers", "review", or
  // "aggregateRating" — a Product without any of these is a Search Console error
  // (flagged live: every currently-out-of-stock Champion Deck etc. was emitting a
  // bare Product with no offers). So a group only gets a ListItem at all when it
  // has a live price AND ≥1 in-stock listing to back a real AggregateOffer;
  // out-of-stock/unpriced groups are omitted from the structured data entirely
  // (they still render as a normal, visible "out of stock" tile on the page).
  const currency = COUNTRIES[priceCountry].currency;
  // A European shopper browsing the UK market's real GBP sealed listings sees them
  // converted to EUR for display — the JSON-LD above stays in the REAL currency
  // (what Google/the offer actually is), only the visible tiles/filters convert.
  const displayCurrency = getDisplayCurrency(priceCountry);
  const showEur = priceCountry === "UK" && displayCurrency === "EUR";
  const displayGroups = showEur
    ? groups.map((g) => ({
        ...g,
        lowestPriceCents: g.lowestPriceCents != null ? gbpCentsToEur(g.lowestPriceCents) : null,
        listings: g.listings.map((l) => ({ ...l, priceCents: gbpCentsToEur(l.priceCents) })),
      }))
    : groups;
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Sealed", item: `${SITE_URL}/sealed` },
    ],
  };
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Riftbound Sealed Products",
    url: `${SITE_URL}/sealed`,
      // Edges back to the site-level graph in app/layout.tsx. Without them this
      // node is an island and the Organization/WebSite entity signals — sameAs,
      // areaServed, knowsAbout — don't propagate to the page.
      isPartOf: { "@id": `${SITE_URL}/#website` },
      publisher: { "@id": `${SITE_URL}/#org` },
    itemListElement: groups
      .filter((g) => g.lowestPriceCents != null && g.listings.some((l) => l.inStock))
      .map((g, i) => {
        const inStockCount = g.listings.filter((l) => l.inStock).length;
        return {
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "Product",
            name: g.name,
            category: "Trading Card Game Sealed Product",
            ...(g.imageUrl ? { image: g.imageUrl.startsWith("http") ? g.imageUrl : `${SITE_URL}${g.imageUrl}` } : {}),
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: currency,
              lowPrice: (g.lowestPriceCents! / 100).toFixed(2),
              offerCount: inStockCount,
              availability: "https://schema.org/InStock",
            },
          },
        };
      }),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, itemListLd]) }}
      />
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <span className="text-slate-300">Sealed</span>
      </nav>

      {/* Compact hero: flat panel with a brand accent rule. */}
      <section className="card-surface animate-fade-up mb-5 overflow-hidden border-l-2 border-brand-500 bg-ink-900">
        <div className="px-6 py-8">
          <h1 className="text-2xl font-extrabold text-white">Sealed Products</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Booster boxes, packs, Proving Grounds, bundles and other sealed Riftbound
            products — priced across {info.adjective} stores so you can find the cheapest.
            Wondering if a box is worth ripping?{" "}
            <Link href="/tools/box-ev" className="text-brand-400 hover:underline">Run the EV calculator →</Link>
          </p>
          {usingFallback && (
            <p className="mt-2 text-xs text-slate-500">
              We don&apos;t track {info.adjective} sealed stores yet — showing Australian listings (prices in AUD). Boxes ship internationally.
            </p>
          )}
          {q && (
            <p className="mt-2 text-sm text-slate-400">
              Showing matches for <span className="text-brand-400">“{q}”</span>.{" "}
              <Link href="/sealed" className="text-brand-400 hover:underline">Show all</Link>
            </p>
          )}
        </div>
      </section>

      {/* Freshly-live Vendetta sealed callout — only on the default (unfiltered) view. */}
      {hasVendetta && (
        <div className="card-surface mb-5 flex flex-wrap items-center gap-3 border-l-2 border-brand-500 bg-ink-900 px-5 py-4">
          <span className="chip bg-gold/20 font-semibold text-gold">NEW</span>
          <p className="min-w-0 flex-1 text-sm text-slate-300">
            <span className="font-semibold text-white">Vendetta sealed is here</span> — booster
            boxes &amp; packs available now, priced across stores.
          </p>
          <Link href="/sealed?q=vendetta" className="btn-primary px-3 py-1.5 text-xs">
            Shop Vendetta →
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <SealedFilters types={typeOptions} sets={setOptions} currency={displayCurrency} />
        <section className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              <span className="num font-semibold text-white">{groups.length.toLocaleString()}</span>{" "}
              {groups.length === 1 ? "product" : "products"}
              {q && <> for <span className="text-brand-400">&ldquo;{q}&rdquo;</span></>}
            </p>
            <SealedSort />
          </div>
          {groups.length === 0 ? (
            <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
              <div>
                <p className="text-lg font-semibold text-white">
                  {isFiltered ? "No sealed products match your filters" : "No sealed products yet"}
                </p>
                <p className="mt-1 text-sm">
                  {isFiltered ? (
                    <Link href="/sealed" className="text-brand-400 hover:underline">Clear filters</Link>
                  ) : (
                    "Our feeds refresh regularly — check back soon."
                  )}
                </p>
              </div>
            </div>
          ) : (
            <Reveal stagger className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {displayGroups.map((g) => (
                <SealedTile key={g.groupKey} group={g} currency={displayCurrency} />
              ))}
            </Reveal>
          )}
        </section>
      </div>

      {/* High-AOV marketplace searches: sealed boxes are the biggest baskets on the
          site, and eBay/Amazon both carry them. Affiliate-tagged per market. */}
      <section className="card-surface mt-8 p-5">
        <h2 className="text-lg font-extrabold text-white">More sealed deals on the big marketplaces</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Boxes sell out and restock constantly — eBay and Amazon often have stock (or better
          prices) when stores don&apos;t. Worth a look before you buy.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {SEALED_SEARCHES.map((x) => {
            const mkt = MARKETPLACE_HOSTS[country] ?? MARKETPLACE_HOSTS.AU;
            return (
              <div key={x.q} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2.5">
                <span className="text-sm font-semibold text-white">{x.label}</span>
                <span className="flex gap-1.5">
                  <OutboundLink
                    href={ebayAffiliateUrl(`https://www.${mkt.ebay}/sch/i.html?_nkw=${encodeURIComponent(x.q)}`)}
                    retailer="ebay_sealed_search"
                    country={country}
                    kind="sealed"
                    className="btn-ghost px-2.5 py-1 text-xs"
                  >
                    eBay →
                  </OutboundLink>
                  <OutboundLink
                    href={affiliateUrl(`https://www.${mkt.amazon}/s?k=${encodeURIComponent(x.q)}`, "amazon_sealed")}
                    retailer="amazon_sealed_search"
                    country={country}
                    kind="sealed"
                    className="btn-ghost px-2.5 py-1 text-xs"
                  >
                    Amazon →
                  </OutboundLink>
                </span>
              </div>
            );
          })}
        </div>
      </section>


      <div className="mt-6 text-center">
        <p className="text-[11px] text-slate-500">
          Sealed prices are collected from public store listings and may change.
        </p>
        <AffiliateDisclosure partner="both" tight />
      </div>
    </div>
  );
}
