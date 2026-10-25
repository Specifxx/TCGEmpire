import type { Metadata } from "next";
import Link from "next/link";
import { getPreorderGroups, getSealedGroups } from "@/lib/sealed-import";
import type { SealedGroup } from "@/lib/sealed-import";
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
import { setByCode, isPreorderSetCode } from "@/lib/constants";
import { releaseDateLabel } from "@/lib/release-calendar";
import { SITE_URL } from "@/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// /legacy-preorders — Riftbound Set 6, every store's pre-order, before it ships.
// ─────────────────────────────────────────────────────────────────────────────
// Built 2026-10-25, two days after Radiance released (owner: "create the Legacy
// pre-orders webpage as well … just in advance"). The same machinery as
// /radiance-preorders, with none of Radiance's own content (its merch-store
// draw, its product sheet, its card art): getPreorderGroups() returns every
// group whose set is still a pre-order, so this page keeps only LGC's.
//
// Stores were already listing Legacy when this was built (the public sealed
// snapshot had Booster Box, Vault and Champion Deck pre-orders in CA, UK, EU
// and US), but stored SETLESS, because the sealed importer had no word for the
// set. lib/sealed-import.ts maps them to LGC from the same commit, so the rows
// land here after the next sealed import. Until then the empty state below is
// what renders, and it says so plainly: nothing on this page is an estimate.
//
// EVERY PRICE IS A PRE-ORDER until the street date, and the page says so in the
// heading, on each row and in its structured data (schema.org PreOrder). Like
// /radiance-preorders it switches to an in-stock price list on release day by
// itself (isPreorderSetCode), at the same URL.
//
// Product facts are Riot's rundown ("Products and Sets into 2027") and the US
// distributor sheet (PHD Games, 11 Aug 2026), both re-read 2026-10-25. The
// Champion Deck display's MSRP is left out on purpose: the distributor sheet
// and ICv2 disagree, and a wrong RRP is worse than none.
//
// Six hours, the floor for pages buyers act on (CLAUDE.md, 2026-10-14). The
// page reads getCountry() (cookies), so it renders per request anyway.
export const revalidate = 21600;

const SET_CODE = "LGC";
const PATH = "/legacy-preorders";

/** Cheapest and dearest OPEN offer for one product, or null when none is open. */
function openRange(g: SealedGroup | undefined, now: number): { low: number; high: number } | null {
  if (!g) return null;
  const open = g.listings.filter((l) => offerStock(l, now) === "open").map((l) => l.priceCents);
  if (!open.length) return null;
  return { low: Math.min(...open), high: Math.max(...open) };
}

// What Riot and the US distributor have published. US MSRPs only: no other
// market's list price has been announced.
const PRODUCTS: { name: string; msrp?: string; detail: string }[] = [
  {
    name: "Booster Display (booster box)",
    msrp: "US$120",
    detail:
      "24 packs of 14 cards. Each pack: 6 Commons, 3 Uncommons, 1 Legend or Battlefield, 1 foil, 2 Rares or better, 2 Runes or Tokens and 1 insert",
  },
  {
    name: "Vault Bundle",
    msrp: "US$34.99",
    detail: "6 Legacy booster packs, 36 basic runes, 4 full-art foil promo tokens and a reusable storage box",
  },
  {
    name: "Champion Decks: Tryndamere, Ashe, Lux and Garen",
    detail: "Four decks, each with a paper playmat, one Legacy booster pack and a folded deck box. No reliable list price yet",
  },
  {
    name: "Pre-Rift kits",
    detail: "For the Pre-Rift events of 22–28 January 2027. Riot has not published their contents",
  },
];

const FAQS = [
  {
    q: "How much does a Riftbound Legacy booster box cost to pre-order?",
    a: "Each store sets its own pre-order price, and they differ. The US distributor list price for the 24-pack Legacy Booster Display is US$120; Riot has not published a price, and no list price outside the US has been announced. This page compares every tracked store's live pre-order price in your market, in your currency, cheapest first, as stores open them.",
  },
  {
    q: "When does Riftbound Legacy release?",
    a: "29 January 2027, with Pre-Rift events from 22 to 28 January. Legacy is Riftbound's sixth set, code LGC: 239 cards, 93 of them Showcase, and the first set Riot has built for draft.",
  },
  {
    q: "Which Legacy products can I pre-order?",
    a: "Riot has announced booster packs and displays, four Champion Decks (Tryndamere, Ashe, Lux and Garen), a Vault Bundle and Pre-Rift kits. Stores open pre-orders on their own schedules; this page lists whichever of them our tracked stores are taking, and leaves out sold-out stores.",
  },
  {
    q: "What is in a Legacy booster pack?",
    a: "14 cards: 6 Commons, 3 Uncommons, 1 Legend or Battlefield, 1 foil, 2 Rares or better, 2 Runes or Tokens and 1 insert, per the US distributor sheet. The Legend-or-Battlefield slot is new: Riot replaced one Common slot with it, at roughly 50/50, so a Legacy pack has six Commons instead of seven.",
  },
  {
    q: "Are these pre-order prices final?",
    a: "No. A pre-order price is what the store is asking today, and stores do change them before release, up or down, as allocations firm up. We refresh these daily, and nothing here is a commitment from the store or from us. Always confirm the price and the store's pre-order terms at checkout.",
  },
  {
    q: "Is it cheaper to pre-order or to wait until release?",
    a: "It depends on the product. Sealed boxes often sit at or near list price during pre-order and can rise at launch if demand outruns allocation, while singles are almost always cheapest a few weeks after release once supply settles. If you want to open product, pre-ordering at a good price is reasonable; if you want specific cards, waiting and buying singles is usually cheaper.",
  },
  {
    q: "Do you include postage in the price comparison?",
    a: "The prices shown are the store's listed item price. Each store's page lists its postage as measured from its own checkout (singles orders), and the Best Basket tool factors those rates in when you are buying several cards at once. A sealed box usually ships as a parcel, so check the store's checkout for it.",
  },
];

// After the street date the pre-order questions describe a window that has
// closed, so the visible FAQ and its FAQPage JSON-LD switch together.
const RELEASED_FAQS = [
  {
    q: "When did Riftbound Legacy release?",
    a: "29 January 2027. Legacy is Riftbound's sixth set: 239 cards, 93 of them Showcase, and the first set Riot built for draft.",
  },
  {
    q: "How much is a Riftbound Legacy booster box?",
    a: "It depends on the store. This page lists every tracked store with a Legacy booster box, pack, Vault Bundle or Champion Deck in stock in your market, in your currency, cheapest first, refreshed daily; sold-out stores are left out.",
  },
  FAQS[3],
  FAQS[6],
];

export function generateMetadata(): Metadata {
  return isPreorderSetCode(SET_CODE) ? PREORDER_METADATA : RELEASED_METADATA;
}

const PREORDER_METADATA: Metadata = {
  // No price in the title (the page renders in the visitor's currency) and no
  // store count (tests/no-store-count-in-titles), like /radiance-preorders.
  title: { absolute: "Riftbound Legacy Pre-Order Prices" },
  description:
    "Legacy booster box, Vault Bundle and Champion Deck pre-order prices from every tracked store, in your currency, refreshed daily. Out 29 January 2027.",
  keywords: [
    "Riftbound Legacy preorder",
    "Riftbound Legacy pre-order price",
    "Legacy booster box preorder",
    "Riftbound Legacy booster box price",
    "Riftbound Set 6 preorder",
  ],
  alternates: pageAlternates(PATH),
  openGraph: pageOpenGraph({
    title: "Riftbound Legacy Pre-Order Prices — Every Store, Compared",
    description: "Booster boxes, Vault Bundles and Champion Decks: every tracked store's Legacy pre-order price, side by side.",
    url: PATH,
  }),
};

const RELEASED_METADATA: Metadata = {
  title: { absolute: "Riftbound Legacy Booster Box Prices" },
  description:
    "Legacy booster box, pack and Vault Bundle prices, in-stock store offers cheapest first, in your currency, refreshed daily.",
  alternates: pageAlternates(PATH),
  openGraph: pageOpenGraph({
    title: "Riftbound Legacy Booster Box Prices — Every Store",
    description: "Legacy booster boxes, Vault Bundles and Champion Decks compared across every tracked store.",
    url: PATH,
  }),
};

export default async function LegacyPreordersPage() {
  const country = getCountry();
  const info = COUNTRIES[country];
  const currency = getDisplayCurrency(country);
  const set = setByCode(SET_CODE);
  const stillUpcoming = isPreorderSetCode(SET_CODE);
  const when = releaseDateLabel(set?.releasedOn) ?? "29 January 2027";
  // Both loaders cache themselves; never wrap either in another cache (CLAUDE.md).
  const groups = (
    stillUpcoming ? await getPreorderGroups(country).catch(() => []) : await getSealedGroups(country).catch(() => [])
  ).filter((g) => g.setCode === SET_CODE);
  const faqs = stillUpcoming ? FAQS : RELEASED_FAQS;
  // `priced` (an open offer exists) feeds the structured data; `listed` feeds the table.
  const priced = pricedPreorderGroups(groups);
  const listed = preorderTableGroups(groups);
  const ebay = ebayLabel(country);
  const now = Date.now();
  const allListings = listed.flatMap((g) => g.listings);
  const storesOpen = openStoreCount(allListings, now);
  const openOffers = allListings.filter((l) => offerStock(l, now) === "open").length;
  const box = openRange(listed.find((g) => g.productType === "Booster Box"), now);
  const vault = openRange(listed.find((g) => g.productType === "Bundle"), now);

  const ld = ldJson(
    webPage({
      name: stillUpcoming ? "Riftbound Legacy Pre-Order Prices" : "Riftbound Legacy Booster Box Prices",
      href: PATH,
      description: stillUpcoming
        ? "Pre-order price comparison for Riftbound: Legacy sealed products across every tracked store, updated daily."
        : "Riftbound: Legacy sealed product prices across every tracked store, updated daily.",
      type: "CollectionPage",
    }),
    // PreOrder before release, never InStock: none of it has shipped.
    priced.length
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: stillUpcoming ? "Riftbound Legacy pre-orders" : "Riftbound Legacy sealed prices",
          url: `${SITE_URL}${PATH}`,
          itemListElement: priced.slice(0, 30).map((g, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "Product",
              name: g.name,
              ...(g.imageUrl ? { image: g.imageUrl } : {}),
              offers: {
                "@type": "AggregateOffer",
                availability: stillUpcoming ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
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
      <Breadcrumbs trail={[{ name: stillUpcoming ? "Legacy pre-orders" : "Legacy booster box prices", href: PATH }]} />

      <header className="rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/10 via-ink-900 to-ink-950 p-5 sm:p-7">
        <div className="max-w-2xl">
          {/* lnum only, no tnum: see /radiance-preorders ('PRE -ORDER'). */}
          <span className="chip mb-3 inline-flex bg-gold/15 text-[11px] font-bold uppercase tracking-wide text-gold [font-feature-settings:'lnum'_1]">
            {stillUpcoming ? `Pre-order · releases ${when}` : `Out now · released ${when}`}
          </span>
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-4xl">
            {stillUpcoming ? "Riftbound Legacy pre-order prices" : "Riftbound Legacy booster box prices"}
          </h1>
          {stillUpcoming ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Legacy is Riftbound&apos;s sixth set, out {when}. Nothing has shipped, so every store is picking its own
              opening price. Below is every Legacy product our tracked {info.adjective} stores are taking pre-orders on,
              in {currency}: within each product an eBay search first, then open eBay listings (both paid links), then
              the stores taking pre-orders, cheapest first. Sold-out stores are left out.
            </p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Legacy is out. Below is every Legacy product our tracked {info.adjective} stores have in stock, in{" "}
              {currency}, cheapest first. Sold-out stores are left out.
            </p>
          )}
        </div>

        {listed.length > 0 && (
          <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-black/30 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Booster box from</dt>
              <dd className="num mt-1 text-xl font-extrabold text-gold">
                {box ? formatMoney(box.low, currency) : <span className="font-sans text-base text-slate-400">{stillUpcoming ? "None open yet" : "None in stock"}</span>}
              </dd>
            </div>
            <div className="rounded-xl bg-black/30 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Vault Bundle from</dt>
              <dd className="num mt-1 text-xl font-extrabold text-gold">
                {vault ? formatMoney(vault.low, currency) : <span className="font-sans text-base text-slate-400">{stillUpcoming ? "None open yet" : "None in stock"}</span>}
              </dd>
            </div>
            <div className="rounded-xl bg-black/30 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{stillUpcoming ? "Stores taking pre-orders" : "Stores with stock"}</dt>
              <dd className="num mt-1 text-xl font-extrabold text-white">{storesOpen}</dd>
              <dd className="text-xs text-slate-400">in {info.place}</dd>
            </div>
            <div className="rounded-xl bg-black/30 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{stillUpcoming ? "Open pre-orders" : "In-stock offers"}</dt>
              <dd className="num mt-1 text-xl font-extrabold text-white">{openOffers}</dd>
              <dd className="text-xs text-slate-400">across {listed.length} products</dd>
            </div>
          </dl>
        )}
      </header>

      {listed.length > 1 && (
        <nav aria-label="Legacy products" className="mt-4 flex flex-wrap gap-2">
          {listed.map((g) => (
            <a
              key={g.groupKey}
              href={`#${productAnchor(g)}`}
              className="chip bg-ink-800 text-xs text-slate-200 hover:bg-ink-700 [font-feature-settings:'lnum'_1]"
            >
              {g.name.replace(/^(Riftbound[:\s-]*)?Legacy[:\s-]*/i, "") || g.name}
              {g.lowestPriceCents != null && <span className="num ml-1.5 text-gold">{formatMoney(g.lowestPriceCents, currency)}</span>}
            </a>
          ))}
        </nav>
      )}

      {listed.length > 0 ? (
        <div className="mt-4">
          {/* The table's product headings are <h3>; this keeps h1 -> h2 -> h3. */}
          <h2 className="sr-only">Legacy {stillUpcoming ? "pre-order prices" : "prices"} by product</h2>
          <PreorderPriceTable groups={listed} country={country} currency={currency} page="/legacy-preorders" released={!stillUpcoming} />
        </div>
      ) : (
        <div className="card-surface mt-5 p-6">
          <h2 className="font-bold text-white">
            {stillUpcoming ? "No Legacy pre-orders tracked in your market yet" : "No Legacy stock tracked in your market yet"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            {stillUpcoming
              ? "We list pre-orders as our tracked stores publish them, and none are open in your market's feed yet. This page fills in on its own as they appear — nothing here is ever an estimate or a placeholder price."
              : "Legacy has released, so its products are priced alongside every other set on the sealed comparison."}
          </p>
          <p className="mt-3 text-sm text-slate-400">
            In the meantime:{" "}
            <Link href="/release-dates" className="text-brand-400 hover:underline">
              the Legacy release date and countdown
            </Link>{" "}
            ·{" "}
            <Link href="/blog/riftbound-legacy-spoilers-set-6" className="text-brand-400 hover:underline">
              what Riot has shown of Legacy
            </Link>{" "}
            ·{" "}
            <Link href="/sealed" className="text-brand-400 hover:underline">
              sealed products you can buy today
            </Link>
          </p>
        </div>
      )}

      {/* "Also on eBay": under the comparison, never in it (2026-09-26 rule). */}
      <EbaySearchPanel
        heading="Also on eBay"
        sub={`Searches of ${ebay}${listed.length > 0 ? ", separate from the listings above" : ""}. eBay sellers set their own prices and dispatch dates — check both on the listing.`}
        country={country}
        pageType="legacy_preorders"
        className="mt-6"
        links={[
          {
            label: `Search ${ebay} for Legacy booster boxes`,
            href: ebaySearchUrl(country, ebaySealedQuery("Legacy Booster Box", "Booster Box"), "legacy-preorders-box"),
          },
          {
            label: `Search ${ebay} for Legacy Vault Bundles and Champion Decks`,
            href: ebaySearchUrl(country, "Riftbound Legacy (vault,bundle,champion deck)", "legacy-preorders-bundle"),
          },
          {
            label: `Search ${ebay} for booster boxes from released sets`,
            href: ebaySearchUrl(country, "Riftbound booster (box,display) -Legacy", "legacy-preorders-released-sealed"),
            promo: true,
          },
        ]}
      />

      {/* The set release alert (lib/release-alerts.ts): two emails at most —
          when Legacy singles get store prices, and if a sold-out pre-order here
          restocks. Set-generic; the restock email links back to this page. */}
      {set?.comingSoon && (
        <ReleaseAlertSignup setCode={SET_CODE} setName="Legacy" source="preorders" className="mt-6 max-w-lg" />
      )}

      <section className="card-surface mt-8 p-6">
        <h2 className="text-xl font-extrabold text-white">What Riot has announced for Legacy</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          The product list is Riot&apos;s own rundown; contents and list prices are the US distributor sheet. Riot has
          not published a price, no list price outside the US has been announced, and stores may list these products
          under different names — the prices above are what stores are actually asking.
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PRODUCTS.map((p) => (
            <div key={p.name} className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
              <dt className="font-bold text-white">{p.name}</dt>
              {p.msrp && <dd className="mt-0.5 text-xs font-semibold text-gold">US MSRP {p.msrp}</dd>}
              <dd className="mt-1.5 text-sm leading-relaxed text-slate-400">{p.detail}.</dd>
            </div>
          ))}
        </dl>
      </section>

      {stillUpcoming && (
        <section className="card-surface mt-8 p-6">
          <h2 className="text-xl font-extrabold text-white">When to pre-order Legacy — and when to wait</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            Riot&apos;s schedule has three dates that move these prices: the first Legacy previews, at Convergence Fest
            in December 2026 with more in January; <strong className="text-slate-200">Pre-Rift events, 22–28 January
            2027</strong>, when the first singles change hands; and the {when} street date. A store that priced its
            boxes before anyone knew what was in the set often re-prices once the chase cards are known.
          </p>
          <ul className="mt-4 grid gap-2 text-sm leading-relaxed text-slate-400 [font-feature-settings:'lnum'_1]">
            <li>
              <strong className="text-slate-200">Want to open product?</strong> Pre-ordering is reasonable, because
              allocation — not price — is what runs out. It is the same box at every store, so the spread above is the
              whole argument for comparing first.
            </li>
            <li>
              <strong className="text-slate-200">Want specific cards?</strong> Waiting is usually cheaper: singles are
              at their most volatile in Pre-Rift week and typically settle a few weeks after release.
            </li>
            <li>
              <strong className="text-slate-200">Drafting?</strong> Legacy is the first Riftbound set built for draft,
              and its packs change: one Common slot becomes a Legend-or-Battlefield slot.{" "}
              <Link href="/blog/riftbound-legacy-pack-changes-and-card-templating" className="text-brand-300 underline-offset-2 hover:underline">
                What changes in a Legacy pack
              </Link>
              .
            </li>
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            We do not forecast prices and we will not tell you the number is going up. What this page shows is what
            every tracked store is charging right now, in your currency, refreshed daily.
          </p>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-2 text-sm">
        <Link href="/release-dates" className="btn-ghost">Riftbound release dates</Link>
        <Link href="/blog/riftbound-legacy-spoilers-set-6" className="btn-ghost">Legacy spoilers</Link>
        <Link href={`/sets/${set?.slug ?? "legacy"}`} className="btn-ghost">The Legacy set page</Link>
        <Link href="/radiance-preorders" className="btn-ghost">Radiance booster box prices</Link>
        <Link href="/sealed" className="btn-ghost">All sealed prices</Link>
      </div>

      <HubFaq faqs={faqs} />
    </div>
  );
}
