import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getPreorderGroups, getSealedGroups } from "@/lib/sealed-import";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubFaq } from "@/components/HubFaq";
import { PreorderPriceTable, pricedPreorderGroups, preorderTableGroups, productAnchor } from "@/components/PreorderPriceTable";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { ReleaseAlertSignup } from "@/components/ReleaseAlertSignup";
import { offerStock, openStoreCount } from "@/lib/sealed-offers";
import { formatMoney } from "@/lib/format";
import { ebayLabel, ebaySealedQuery, ebaySearchUrl } from "@/lib/affiliate";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { autoPreorderState, releaseDateLabel } from "@/lib/release-calendar";
import type { SetInfo } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// /preorders/<set slug> — the AUTOMATIC pre-order page (2026-11-02).
// ─────────────────────────────────────────────────────────────────────────────
// /radiance-preorders and /legacy-preorders were hand-built, each with Riot's
// product sheet and its own FAQ, and both were the site's top landings in their
// pre-release months. This is the same comparison for every other coming-soon
// set in SETS, with nothing set-specific: adding the set to SETS (which the
// sealed import needs anyway) is the whole job (lib/release-calendar.ts
// autoPreorderState). A set with a hand-built page redirects to it, so writing
// one later never leaves two pages competing for "<set> pre-order".
//
// Only facts the data holds: the name, the street date when SETS has one, and
// the stores' own listings. No list price, no contents, no card count: those need a
// source, and they belong on a hand-built page.
//
// EVERY PRICE IS A PRE-ORDER until the street date (schema.org PreOrder); then
// the same URL lists in-stock prices for 45 days and 308s to the set page.
// Six hours, the floor for pages buyers act on; it reads getCountry() (cookies),
// so it renders per request anyway.
export const revalidate = 21600;

type Params = { params: { slug: string } };

function pageFor(slug: string): { set: SetInfo; upcoming: boolean } {
  const st = autoPreorderState(slug);
  if (st.kind === "missing") notFound();
  if (st.kind === "redirect") permanentRedirect(st.to);
  return st;
}

function faqsFor(name: string, when: string | null, upcoming: boolean): { q: string; a: string }[] {
  if (!upcoming) {
    return [
      { q: `When did Riftbound ${name} release?`, a: `${when ?? "Recently"}. Its full card list with every store's price is on the ${name} set page.` },
      { q: `How much is a Riftbound ${name} booster box?`, a: `It depends on the store. This page lists every tracked store with ${name} sealed product in stock in your market, in your currency, cheapest first, refreshed daily; sold-out stores are left out.` },
    ];
  }
  return [
    { q: `How much does a Riftbound ${name} booster box cost to pre-order?`, a: `Each store sets its own pre-order price, and they differ. This page compares every tracked store's live ${name} pre-order price in your market, in your currency, cheapest first, as stores open them.` },
    { q: `When does Riftbound ${name} release?`, a: when ? `${when}, the street date Riot has announced. Stores sometimes ship a few days either side; each store's listing has its own date.` : "Riot has not announced a street date yet. This page adds each store as soon as its listing appears." },
    { q: "Are these pre-order prices final?", a: "No. A pre-order price is what the store is asking today, and stores do change them before release, up or down, as allocations firm up. We refresh these daily, and nothing here is a commitment from the store or from us. Always confirm the price and the store's pre-order terms at checkout." },
    { q: "Is it cheaper to pre-order or to wait until release?", a: "It depends on the product. Sealed boxes often sit at or near list price during pre-order and can rise at launch if demand outruns allocation, while singles are almost always cheapest a few weeks after release once supply settles. If you want to open product, pre-ordering at a good price is reasonable; if you want specific cards, waiting and buying singles is usually cheaper." },
    { q: "Do you include postage in the price comparison?", a: "The prices shown are the store's listed item price. A sealed box usually ships as a parcel, so check the store's checkout for its postage." },
  ];
}

export function generateMetadata({ params }: Params): Metadata {
  const st = autoPreorderState(params.slug);
  if (st.kind !== "page") return {};
  const { set, upcoming } = st;
  const path = `/preorders/${set.slug}`;
  const when = releaseDateLabel(set.releasedOn);
  // No price in the title (the page renders in the visitor's currency) and no store count (tests/no-store-count-in-titles).
  return upcoming
    ? {
        title: { absolute: `Riftbound ${set.name} Pre-Order Prices` },
        description: `${set.name} booster box and sealed pre-order prices from every tracked store, in your currency, refreshed daily.${when ? ` Out ${when}.` : ""}`,
        keywords: [`Riftbound ${set.name} preorder`, `Riftbound ${set.name} pre-order price`, `${set.name} booster box preorder`, `Riftbound ${set.name} booster box price`],
        alternates: pageAlternates(path),
        openGraph: pageOpenGraph({ title: `Riftbound ${set.name} Pre-Order Prices — Every Store, Compared`, description: `Every tracked store's ${set.name} pre-order price, side by side.`, url: path }),
      }
    : {
        title: { absolute: `Riftbound ${set.name} Booster Box Prices` },
        description: `${set.name} booster box and sealed prices, in-stock store offers cheapest first, in your currency, refreshed daily.`,
        alternates: pageAlternates(path),
        openGraph: pageOpenGraph({ title: `Riftbound ${set.name} Booster Box Prices — Every Store`, description: `${set.name} sealed products compared across every tracked store.`, url: path }),
      };
}

/** Cheapest OPEN offer for the set's booster box, or null when none is open. */
function boxFrom(groups: ReturnType<typeof preorderTableGroups>, now: number): number | null {
  const g = groups.find((x) => x.productType === "Booster Box");
  const open = g?.listings.filter((l) => offerStock(l, now) === "open").map((l) => l.priceCents) ?? [];
  return open.length ? Math.min(...open) : null;
}

export default async function AutoPreorderPage({ params }: Params) {
  const { set, upcoming } = pageFor(params.slug);
  const path = `/preorders/${set.slug}`;
  const name = set.name;
  const country = getCountry();
  const info = COUNTRIES[country];
  const currency = getDisplayCurrency(country);
  const when = releaseDateLabel(set.releasedOn);
  // Both loaders cache themselves; never wrap either in another cache (CLAUDE.md).
  const groups = (upcoming ? await getPreorderGroups(country).catch(() => []) : await getSealedGroups(country).catch(() => [])).filter((g) => g.setCode === set.code);
  const faqs = faqsFor(name, when, upcoming);
  const priced = pricedPreorderGroups(groups);
  const listed = preorderTableGroups(groups);
  const ebay = ebayLabel(country);
  const now = Date.now();
  const allListings = listed.flatMap((g) => g.listings);
  const storesOpen = openStoreCount(allListings, now);
  const openOffers = allListings.filter((l) => offerStock(l, now) === "open").length;
  const box = boxFrom(listed, now);
  const strip = new RegExp(`^(Riftbound[:\\s-]*)?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[:\\s-]*`, "i");

  const ld = ldJson(
    webPage({
      name: upcoming ? `Riftbound ${name} Pre-Order Prices` : `Riftbound ${name} Booster Box Prices`,
      href: path,
      description: upcoming ? `Pre-order price comparison for Riftbound: ${name} sealed products across every tracked store, updated daily.` : `Riftbound: ${name} sealed product prices across every tracked store, updated daily.`,
      type: "CollectionPage",
    }),
    // PreOrder before release, never InStock: none of it has shipped.
    priced.length
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: upcoming ? `Riftbound ${name} pre-orders` : `Riftbound ${name} sealed prices`,
          url: `${SITE_URL}${path}`,
          itemListElement: priced.slice(0, 30).map((g, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "Product",
              name: g.name,
              ...(g.imageUrl ? { image: g.imageUrl } : {}),
              offers: {
                "@type": "AggregateOffer",
                availability: upcoming ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
                priceCurrency: currency,
                lowPrice: ((g.lowestPriceCents ?? 0) / 100).toFixed(2),
                offerCount: g.storeCount,
              },
            },
          })),
        }
      : null,
    faqPage(faqs),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <Breadcrumbs trail={[{ name: upcoming ? `${name} pre-orders` : `${name} booster box prices`, href: path }]} />

      <header className="rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/10 via-ink-900 to-ink-950 p-5 sm:p-7">
        <div className="max-w-2xl">
          <span className="chip mb-3 inline-flex bg-gold/15 text-[11px] font-bold uppercase tracking-wide text-gold [font-feature-settings:'lnum'_1]">
            {upcoming ? `Pre-order${when ? ` · releases ${when}` : ""}` : `Out now${when ? ` · released ${when}` : ""}`}
          </span>
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-4xl">
            {upcoming ? `Riftbound ${name} pre-order prices` : `Riftbound ${name} booster box prices`}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {upcoming
              ? `${name} is Riftbound's next set${when ? `, out ${when}` : ""}. Nothing has shipped, so every store is picking its own opening price. Below is every ${name} product our tracked ${info.adjective} stores are taking pre-orders on, in ${currency}: within each product an eBay search first, then open eBay listings (both paid links), then the stores taking pre-orders, cheapest first. Sold-out stores are left out.`
              : `${name} is out. Below is every ${name} product our tracked ${info.adjective} stores have in stock, in ${currency}, cheapest first. Sold-out stores are left out.`}
          </p>
        </div>

        {listed.length > 0 && (
          <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-black/30 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Booster box from</dt>
              <dd className="num mt-1 text-xl font-extrabold text-gold">
                {box != null ? formatMoney(box, currency) : <span className="font-sans text-base text-slate-400">{upcoming ? "None open yet" : "None in stock"}</span>}
              </dd>
            </div>
            <div className="rounded-xl bg-black/30 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{upcoming ? "Stores taking pre-orders" : "Stores with stock"}</dt>
              <dd className="num mt-1 text-xl font-extrabold text-white">{storesOpen}</dd>
              <dd className="text-xs text-slate-400">in {info.place}</dd>
            </div>
            <div className="rounded-xl bg-black/30 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{upcoming ? "Open pre-orders" : "In-stock offers"}</dt>
              <dd className="num mt-1 text-xl font-extrabold text-white">{openOffers}</dd>
              <dd className="text-xs text-slate-400">across {listed.length} products</dd>
            </div>
          </dl>
        )}
      </header>

      {listed.length > 1 && (
        <nav aria-label={`${name} products`} className="mt-4 flex flex-wrap gap-2">
          {listed.map((g) => (
            <a key={g.groupKey} href={`#${productAnchor(g)}`} className="chip bg-ink-800 text-xs text-slate-200 hover:bg-ink-700 [font-feature-settings:'lnum'_1]">
              {g.name.replace(strip, "") || g.name}
              {g.lowestPriceCents != null && <span className="num ml-1.5 text-gold">{formatMoney(g.lowestPriceCents, currency)}</span>}
            </a>
          ))}
        </nav>
      )}

      {listed.length > 0 ? (
        <div className="mt-4">
          <h2 className="sr-only">{name} {upcoming ? "pre-order prices" : "prices"} by product</h2>
          <PreorderPriceTable groups={listed} country={country} currency={currency} page={`/preorders/${set.slug}`} released={!upcoming} />
        </div>
      ) : (
        <div className="card-surface mt-5 p-6">
          <h2 className="font-bold text-white">{upcoming ? `No ${name} pre-orders tracked in your market yet` : `No ${name} stock tracked in your market yet`}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            {upcoming
              ? "We list pre-orders as our tracked stores publish them, and none are open in your market's feed yet. This page fills in on its own as they appear — nothing here is ever an estimate or a placeholder price."
              : `${name} has released, so its products are priced alongside every other set on the sealed comparison.`}
          </p>
          <p className="mt-3 text-sm text-slate-400">
            In the meantime:{" "}
            <Link href="/release-dates" className="text-brand-400 hover:underline">the release calendar</Link> ·{" "}
            <Link href="/sealed" className="text-brand-400 hover:underline">sealed products you can buy today</Link>
          </p>
        </div>
      )}

      {/* "Also on eBay": under the comparison, never in it (2026-09-26 rule). */}
      <EbaySearchPanel
        heading="Also on eBay"
        sub={`Searches of ${ebay}${listed.length > 0 ? ", separate from the listings above" : ""}. eBay sellers set their own prices and dispatch dates — check both on the listing.`}
        country={country}
        pageType="preorders"
        className="mt-6"
        links={[
          { label: `Search ${ebay} for ${name} booster boxes`, href: ebaySearchUrl(country, ebaySealedQuery(`${name} Booster Box`, "Booster Box"), "preorders-box") },
          { label: `Search ${ebay} for booster boxes from released sets`, href: ebaySearchUrl(country, `Riftbound booster (box,display) -${name.split(/\s+/)[0]}`, "preorders-released-sealed"), promo: true },
        ]}
      />

      {upcoming && <ReleaseAlertSignup setCode={set.code} setName={name} source="preorders" className="mt-6 max-w-lg" />}

      {upcoming && (
        <section className="card-surface mt-8 p-6">
          <h2 className="text-xl font-extrabold text-white">When to pre-order {name}, and when to wait</h2>
          <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-slate-400 [font-feature-settings:'lnum'_1]">
            <li>
              <strong className="text-slate-200">Want to open product?</strong> Pre-ordering is reasonable, because allocation, not price, is what runs out. It is the same box at every store, so the spread above is the whole argument for comparing first.
            </li>
            <li>
              <strong className="text-slate-200">Want specific cards?</strong> Waiting is usually cheaper: singles are at their most volatile in Pre-Rift week and typically settle a few weeks after release.
            </li>
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            We do not forecast prices and we will not tell you the number is going up. What this page shows is what every tracked store is charging right now, in your currency, refreshed daily.
          </p>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-2 text-sm">
        <Link href="/release-dates" className="btn-ghost">Riftbound release dates</Link>
        <Link href={`/sets/${set.slug}`} className="btn-ghost">The {name} set page</Link>
        <Link href="/sealed" className="btn-ghost">All sealed prices</Link>
      </div>

      <HubFaq faqs={faqs} />
    </div>
  );
}
