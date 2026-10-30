import type { Metadata } from "next";
import Link from "next/link";
import { getSealedGroups } from "@/lib/sealed-import";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubFaq } from "@/components/HubFaq";
import { PreorderPriceTable } from "@/components/PreorderPriceTable";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { formatMoney } from "@/lib/format";
import { ebayLabel, ebaySealedQuery, ebaySearchUrl } from "@/lib/affiliate";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { blackFriday, cyberMonday, sealedDeals, UNDER_MEDIAN_PCT, UNDER_MSRP_PCT } from "@/lib/black-friday";

// ─────────────────────────────────────────────────────────────────────────────
// /black-friday — Riftbound sealed deals through Black Friday and Cyber Monday.
// ─────────────────────────────────────────────────────────────────────────────
// Built 2026-10-30 by the weekly growth review (DECISIONS.md, "A Black Friday
// deals page on RiftCompare"). One URL kept all year, so it gathers links and
// history before each season. What it lists is lib/black-friday.ts sealedDeals:
// in-stock sealed products whose cheapest store is well under the other stores
// or the MSRP, today. Never a "was" price or a deadline.
//
// Six hours, the floor for pages buyers act on (CLAUDE.md, 2026-10-14). The
// page reads getCountry() (cookies), so it renders per request anyway.
export const revalidate = 21600;

const PATH = "/black-friday";
const SHOWN = 12;

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function season(): { year: number; bf: string; cm: string } {
  const now = new Date();
  let year = now.getUTCFullYear();
  if (now.toISOString().slice(0, 10) > cyberMonday(year)) year += 1;
  return { year, bf: blackFriday(year), cm: cyberMonday(year) };
}

function faqs(bf: string, cm: string) {
  return [
    {
      q: "Will Riftbound be cheaper on Black Friday?",
      a: `Some stores discount sealed product for Black Friday (${longDate(bf)}) and Cyber Monday (${longDate(cm)}), but many Riftbound booster boxes already sell at or under the US$120 MSRP at the cheapest stores. Compare any Black Friday price with the live lowest price here rather than with the MSRP or a crossed-out "was" price.`,
    },
    {
      q: "How does this page pick a deal?",
      a: `A product is listed when its cheapest in-stock store price is at least ${UNDER_MEDIAN_PCT}% under the median of the stores that have it in stock (with at least three stores), or at least ${UNDER_MSRP_PCT}% under its US MSRP. Biggest saving first. eBay sellers are never counted as a store or a deal.`,
    },
    {
      q: "How often are the prices updated?",
      a: "Store prices are re-read every day, and a store that was sold out at our last check is left out. Black Friday sales start and end at each store's own time, so confirm the price at checkout.",
    },
    {
      q: "Does the price include postage?",
      a: "No. Prices are the store's listed item price. A booster box ships as a parcel, so check the store's checkout for postage before you compare two close prices.",
    },
  ];
}

export function generateMetadata(): Metadata {
  const { year } = season();
  return {
    title: { absolute: `Riftbound Black Friday Deals ${year}: Sealed Prices` },
    description: `Riftbound booster boxes and sealed product under the other stores or the MSRP today, in your currency, checked daily through Black Friday and Cyber Monday ${year}.`,
    keywords: ["Riftbound Black Friday", "Riftbound Black Friday deals", "Riftbound booster box Black Friday", "Riftbound Cyber Monday", "Riftbound sale"],
    alternates: pageAlternates(PATH),
    openGraph: pageOpenGraph({
      title: `Riftbound Black Friday Deals ${year}`,
      description: "Sealed Riftbound products under the other stores or the MSRP, checked daily.",
      url: PATH,
    }),
  };
}

export default async function BlackFridayPage() {
  const country = getCountry();
  const info = COUNTRIES[country];
  const currency = getDisplayCurrency(country);
  const { year, bf, cm } = season();
  // Caches itself; never wrap it in another cache (CLAUDE.md).
  const groups = await getSealedGroups(country).catch(() => []);
  const deals = sealedDeals(groups);
  const shown = deals.slice(0, SHOWN);
  const ebay = ebayLabel(country);
  const qa = faqs(bf, cm);

  const ld = ldJson(
    webPage({
      name: `Riftbound Black Friday deals ${year}`,
      href: PATH,
      description: "Riftbound sealed products under the other stores or the MSRP today, checked daily.",
      type: "CollectionPage",
    }),
    faqPage(qa),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <Breadcrumbs trail={[{ name: "Black Friday deals", href: PATH }]} />

      <header className="rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/10 via-ink-900 to-ink-950 p-5 sm:p-7">
        <div className="max-w-2xl">
          <span className="chip mb-3 inline-flex bg-gold/15 text-[11px] font-bold uppercase tracking-wide text-gold [font-feature-settings:'lnum'_1]">
            Black Friday {longDate(bf)} · Cyber Monday {longDate(cm)}
          </span>
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-4xl">Riftbound Black Friday deals</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Sealed Riftbound products whose cheapest {info.adjective} store is well under the other stores or the MSRP
            today, in {currency}, biggest saving first. We re-read every store daily; sold-out stores are left out. No
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
          <PreorderPriceTable groups={shown.map((d) => d.group)} country={country} currency={currency} page="/black-friday" released />
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
        pageType="black_friday"
        className="mt-6"
        links={[
          { label: `Search ${ebay} for Riftbound booster boxes`, href: ebaySearchUrl(country, ebaySealedQuery("Booster Box", "Booster Box"), "black-friday-box") },
          { label: `Search ${ebay} for Riftbound sealed bundles`, href: ebaySearchUrl(country, "Riftbound (bundle,champion deck,starter)", "black-friday-bundle") },
        ]}
      />

      <div className="mt-8 flex flex-wrap gap-2 text-sm">
        <Link href="/sealed" className="btn-ghost">All sealed prices</Link>
        <Link href="/sets/radiance" className="btn-ghost">Radiance prices</Link>
        <Link href="/legacy-preorders" className="btn-ghost">Legacy pre-orders</Link>
        <Link href="/release-dates" className="btn-ghost">Release dates</Link>
      </div>

      <HubFaq faqs={qa} />
    </div>
  );
}
