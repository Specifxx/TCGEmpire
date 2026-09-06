import type { Metadata } from "next";
import Link from "next/link";
import { RETAILER_LIST } from "@/lib/retailers";
import { REFERENCE_SOURCES } from "@/lib/constants";
import { COUNTRIES, type Country } from "@/lib/country";
import { SITE_URL } from "@/lib/site";
import { storeSlug } from "@/lib/store-pages";
import { pageAlternates } from "@/lib/seo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Stores we track — every Riftbound retailer in the comparison",
  description:
    "The full list of Riftbound stores RiftCompare compares prices across, by market (Australia, the US, the UK, Singapore, Canada and the EU). Don't see your store? Request it.",
  alternates: pageAlternates("/stores/tracked"),
};

const MARKETS: Country[] = ["AU", "US", "UK", "SG", "CA", "EU"];

const FAQS = [
  {
    q: "How often are Riftbound card prices updated?",
    a: "Prices across all tracked stores refresh daily. Our crawler visits each retailer's live listings once every 24 hours, so if a store changes a price or restocks a card, it shows up in the comparison the following day.",
  },
  {
    q: "Does RiftCompare include postage in the price comparison?",
    a: "Yes, but it isn't the primary sort. The price table on every card page ranks stores by item price first, with a store's known postage only breaking ties between otherwise-equal prices — that way a store isn't penalised in the ranking just because its shipping cost happens to be known upfront when a competitor's isn't. Delivered cost (price plus postage) is always shown alongside the price so you can compare on it yourself, and free-shipping thresholds are factored into that figure automatically.",
  },
  {
    q: "Which countries does RiftCompare cover?",
    a: "RiftCompare covers Australia, the United States, the United Kingdom, Singapore, Canada and the eurozone. Each market shows prices in its local currency (AUD, USD, GBP, SGD, CAD, EUR) from retailers that actually ship to buyers in that region — the EU market pools stores across the single market, since they all price in EUR and ship to each other duty-free. Switch markets using the country selector in the navigation.",
  },
  {
    q: "Can I trust the prices shown on RiftCompare?",
    a: "Prices are pulled directly from each store's public listings and reflect what was on their website at the time of our last crawl (updated daily). Stock and prices can change between our update and when you visit, so always confirm the final price at checkout before buying.",
  },
];

export default function TrackedStoresPage() {
  const byMarket = MARKETS.map((code) => ({
    code,
    info: COUNTRIES[code],
    stores: RETAILER_LIST.filter((r) => (r.country ?? "AU") === code).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((m) => m.stores.length > 0);
  const total = RETAILER_LIST.length;

  // Reference/aggregate sources (Cardmarket) — grouped by display name so its
  // UK (converted) and EU (native) rows read as one entry with two markets,
  // not two identically-named cards. Deliberately kept OUT of `byMarket`/`total`
  // above: those describe real, independently-scraped stores (see the note on
  // RETAILER_LIST in lib/retailers.ts and lib/store-pages.ts), and a marketplace
  // aggregate isn't one — see REFERENCE_SOURCES's own header in lib/constants.ts.
  const referenceSources = [...new Map(REFERENCE_SOURCES.map((r) => [r.name, r])).values()].map((r) => ({
    ...r,
    markets: REFERENCE_SOURCES.filter((x) => x.name === r.name).map((x) => COUNTRIES[x.country as Country].label),
  }));

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${SITE_URL}/stores/tracked`,
    mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Stores we track", item: `${SITE_URL}/stores/tracked` },
    ],
  };

  return (
    <div className="flex flex-col gap-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([faqJsonLd, breadcrumbLd]) }} />

      <div>
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Stores we track</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          RiftCompare compares live prices across <span className="num text-slate-300">{total}</span> Riftbound retailers
          plus eBay, grouped by market below. Every card&apos;s comparison ranks these
          by item price, with delivered cost (price + postage) shown alongside so you can compare on it yourself, and
          prices refresh daily.
        </p>
      </div>

      {byMarket.map((m) => (
        <section key={m.code}>
          <h2 className="mb-3 text-lg font-bold text-white">
            {m.info.flag} {m.info.label}{" "}
            <span className="num text-sm font-normal text-slate-500">({m.stores.length})</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Now links INTERNALLY to each store's own page rather than straight
                out to the retailer. Every store page was previously orphaned —
                nothing on the site linked to one — and an outbound-only directory
                passes crawl budget away instead of distributing it. The outbound
                link still exists, on the store page itself. */}
            {m.stores.map((s) => (
              <Link
                key={s.key}
                href={`/stores/${storeSlug(s.key)}`}
                className="card-surface flex flex-col gap-1 p-4 transition-colors hover:border-brand-500"
              >
                <span className="font-semibold text-white">{s.name}</span>
                <span className="text-xs text-slate-500">{s.shippingNote}</span>
                <span className="mt-1 text-xs text-brand-400">See live prices &amp; stock →</span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {/* Reference/aggregate sources — visually and semantically distinct from the
          real-store grid above: no "N stores" count, no per-store page link, and
          explicit copy explaining it's a marketplace aggregate, not a single
          retailer's listing. See the referenceSources note above. */}
      {referenceSources.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-white">Reference &amp; marketplace sources</h2>
          <p className="mb-3 max-w-3xl text-sm leading-relaxed text-slate-400">
            Beyond the {total} stores above, card pages also show a clearly-labelled reference price from
            marketplace aggregates below where relevant. These are never counted as a store or ranked
            in the price comparison — see our{" "}
            <Link href="/methodology" className="text-brand-400 hover:underline">methodology</Link>.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {referenceSources.map((r) => (
              <div key={r.name} className="card-surface flex flex-col gap-1 p-4">
                <span className="font-semibold text-white">{r.name}</span>
                <span className="text-xs text-slate-500">{r.description}</span>
                <span className="mt-1 text-xs text-slate-500">Shown for: {r.markets.join(" & ")}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FAQ — answers common buyer questions and enables FAQPage rich results */}
      <section className="card-surface divide-y divide-ink-800 overflow-hidden">
        <h2 className="px-6 py-4 text-lg font-extrabold text-white">Frequently asked questions</h2>
        {FAQS.map((f) => (
          <details key={f.q} className="group px-6 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-200 hover:text-white">
              {f.q}
              <span className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden>▾</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
          </details>
        ))}
      </section>

      <section className="card-surface p-6 text-center">
        <h2 className="text-lg font-bold text-white">Don&apos;t see your store?</h2>
        <p className="mx-auto mt-1 max-w-xl text-sm text-slate-400">
          We&apos;re always adding retailers. If there&apos;s a Riftbound store you&apos;d like compared — or you run one —
          suggest it and we&apos;ll look at adding it. Free listing, more customers.
        </p>
        <Link href="/stores/suggest" className="btn-primary mt-4 inline-flex">
          Suggest a store →
        </Link>
      </section>
    </div>
  );
}
