import type { Metadata } from "next";
import Link from "next/link";
import { getSealedGroups } from "@/lib/sealed-import";
import { withLiveStock } from "@/lib/preorder-live-stock";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { COUNTRIES, COUNTRY_LIST } from "@/lib/country";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubFaq } from "@/components/HubFaq";
import { PreorderPriceTable } from "@/components/PreorderPriceTable";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { formatMoney } from "@/lib/format";
import { ebayLabel, ebaySealedQuery, ebaySearchUrl } from "@/lib/affiliate";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { sealedDeals, UNDER_MEDIAN_PCT, UNDER_MSRP_PCT } from "@/lib/black-friday";
import { listRegions, saleDates, saleHeading, saleIntro, saleYear, SALE_SEASONS, type SaleSlug } from "@/lib/sale-seasons";

// The seasonal sale pages: /boxing-day, /january-sales and /lunar-new-year (2026-11-02,
// DECISIONS.md "Seasonal sale pages"). One URL each, kept every year like /black-friday, and
// listing exactly what /black-friday lists: lib/black-friday.ts sealedDeals, in-stock sealed
// products whose cheapest store in the visitor's market is well under the other stores or the
// MSRP today. Never a "was" price or a deadline. The wording names every market we cover, never
// one country, because the visitor's market decides the rows.

export type SalePath = "/boxing-day" | "/january-sales" | "/lunar-new-year";
const SHOWN = 12;

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// Every market RiftCompare prices, in words, for the region-neutral intro.
const REGIONS = listRegions(COUNTRY_LIST.map((c) => c.place));

function faqs(slug: SaleSlug, year: number) {
  const name = SALE_SEASONS[slug].name;
  const day = saleDates(slug, year);
  return [
    {
      q: `Will Riftbound be cheaper in the ${name}${slug === "january-sales" ? "" : " sales"}?`,
      a: `Some stores discount sealed product ${slug === "january-sales" ? `through January ${year}` : `around ${name} (${day ? longDate(day.start) : year})`}, but many Riftbound booster boxes already sell at or under the US$120 MSRP at the cheapest stores. Compare any sale price with the live lowest price here rather than with the MSRP or a crossed-out "was" price.`,
    },
    {
      q: "How does this page pick a deal?",
      a: `A product is listed when its cheapest in-stock store price is at least ${UNDER_MEDIAN_PCT}% under the median of the stores that have it in stock (with at least three stores), or at least ${UNDER_MSRP_PCT}% under its US MSRP. Biggest saving first. eBay sellers are never counted as a store or a deal.`,
    },
    {
      q: "How often are the prices updated?",
      a: `Store prices are re-read every day, and a store that was sold out at our last check is left out. ${name} sales start and end at each store's own time, so confirm the price at checkout.`,
    },
    {
      q: "Does the price include postage?",
      a: "No. Prices are the store's listed item price. A booster box ships as a parcel, so check the store's checkout for postage before you compare two close prices.",
    },
  ];
}

export function saleMetadata(slug: SaleSlug): Metadata {
  const year = saleYear(slug, new Date().toISOString().slice(0, 10));
  const name = SALE_SEASONS[slug].name;
  const path = `/${slug}`;
  return {
    title: { absolute: `Riftbound ${saleHeading(slug, year)}: Sealed Prices` },
    description: `${name} ${year} Riftbound deals: booster boxes and sealed product under the other stores or the MSRP today, in your currency, checked daily across ${REGIONS}.`,
    keywords: [`Riftbound ${name}`, `Riftbound ${SALE_SEASONS[slug].searchName}`, `Riftbound booster box ${name}`, "Riftbound sale"],
    alternates: pageAlternates(path),
    openGraph: pageOpenGraph({
      title: `Riftbound ${saleHeading(slug, year)}`,
      description: "Sealed Riftbound products under the other stores or the MSRP, checked daily.",
      url: path,
    }),
  };
}

export async function SaleSeasonPage({ slug }: { slug: SaleSlug }) {
  const PATH = `/${slug}` as SalePath;
  const name = SALE_SEASONS[slug].name;
  const country = getCountry();
  const info = COUNTRIES[country];
  const currency = getDisplayCurrency(country);
  const year = saleYear(slug, new Date().toISOString().slice(0, 10));
  // Caches itself; never wrap it in another cache (CLAUDE.md).
  const groups = await getSealedGroups(country).catch(() => []);
  // The snapshot's stock is up to a day old, and a deal is usually a store's last
  // few boxes: Eternal Magic's A$350 Origins box led this page for AU after it
  // sold out (owner, 2026-11-01). The likely deals' open offers are re-checked at
  // the store (Shopify's own `available`, held six hours, one-way: it can only
  // close an offer), then the deals are picked again from what is still open.
  const candidates = sealedDeals(groups).slice(0, SHOWN * 2).map((d) => d.group);
  const checked = await withLiveStock(candidates).catch(() => candidates);
  const deals = sealedDeals(checked);
  const shown = deals.slice(0, SHOWN);
  const ebay = ebayLabel(country);
  const qa = faqs(slug, year);

  const ld = ldJson(
    webPage({
      name: `Riftbound ${saleHeading(slug, year)}`,
      href: PATH,
      description: "Riftbound sealed products under the other stores or the MSRP today, checked daily.",
      type: "CollectionPage",
    }),
    faqPage(qa),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <Breadcrumbs trail={[{ name: SALE_SEASONS[slug].linkLabel, href: PATH }]} />

      <header className="rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/10 via-ink-900 to-ink-950 p-5 sm:p-7">
        <div className="max-w-2xl">
          <span className="chip mb-3 inline-flex bg-gold/15 text-[11px] font-bold uppercase tracking-wide text-gold [font-feature-settings:'lnum'_1]">
            {saleWhen(slug, year)}
          </span>
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-4xl">Riftbound {SALE_SEASONS[slug].linkLabel}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {saleIntro(slug, year, REGIONS)} For you, that is sealed Riftbound products whose cheapest {info.adjective} store is well under the other stores or the MSRP
            today, in {currency}, biggest saving first. We re-read every store daily and re-check the cheapest stores
            every few hours; sold-out stores are left out. No
            &ldquo;was&rdquo; prices: only what stores are asking now.
          </p>
        </div>
        {shown.length > 0 && (
          <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {shown.slice(0, 4).map((d) => (
              <li key={d.group.groupKey} className="rounded-xl bg-black/30 p-3">
                <p className="truncate text-xs font-semibold text-slate-300">{d.group.name}</p>
                <p className="num mt-1 text-xl font-extrabold text-gold">{formatMoney(d.cheapestCents, currency)}</p>
                <p className="text-xs text-slate-400">
                  {d.underMedianPct != null && d.underMedianPct >= UNDER_MEDIAN_PCT
                    ? `${d.underMedianPct}% under the median store`
                    : `${d.underMsrpPct}% under MSRP`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </header>

      {shown.length > 0 ? (
        <div className="mt-6">
          <h2 className="sr-only">Riftbound sealed deals by product</h2>
          <PreorderPriceTable groups={shown.map((d) => d.group)} country={country} currency={currency} page={PATH} released />
        </div>
      ) : (
        <div className="card-surface mt-5 p-6">
          <h2 className="font-bold text-white">No standout sealed deals in your market today</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            No tracked store is far enough under the others or the MSRP right now. This page fills in on its own as
            stores cut prices. Meanwhile every sealed product is on the{" "}
            <Link href="/sealed" className="text-brand-400 hover:underline">sealed price comparison</Link>.
          </p>
        </div>
      )}

      {/* "Also on eBay": under the comparison, never in it (2026-09-26 rule). */}
      <EbaySearchPanel
        heading="Also on eBay"
        sub={`Searches of ${ebay}. eBay sellers set their own prices; compare them with the stores above.`}
        country={country}
        pageType={slug.replace(/-/g, "_")}
        className="mt-6"
        links={[
          { label: `Search ${ebay} for Riftbound booster boxes`, href: ebaySearchUrl(country, ebaySealedQuery("Booster Box", "Booster Box"), `${slug}-box`) },
          { label: `Search ${ebay} for Riftbound sealed bundles`, href: ebaySearchUrl(country, "Riftbound (bundle,champion deck,starter)", `${slug}-bundle`) },
        ]}
      />

      <div className="mt-8 flex flex-wrap gap-2 text-sm">
        <Link href="/sealed" className="btn-ghost">All sealed prices</Link>
        <Link href="/black-friday" className="btn-ghost">Black Friday deals</Link>
        <Link href="/sets/radiance" className="btn-ghost">Radiance prices</Link>
        <Link href="/legacy-preorders" className="btn-ghost">Legacy pre-orders</Link>
        <Link href="/release-dates" className="btn-ghost">Release dates</Link>
      </div>

      <HubFaq faqs={qa} />
    </div>
  );
}

function saleWhen(slug: SaleSlug, year: number): string {
  const d = saleDates(slug, year);
  if (!d) return `${SALE_SEASONS[slug].name} ${year}`;
  return d.start === d.end ? `${SALE_SEASONS[slug].name} · ${longDate(d.start)}` : `${SALE_SEASONS[slug].name} · ${longDate(d.start)} to ${longDate(d.end)}`;
}
