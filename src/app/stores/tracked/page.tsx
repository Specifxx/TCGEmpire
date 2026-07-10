import type { Metadata } from "next";
import Link from "next/link";
import { RETAILER_LIST } from "@/lib/retailers";
import { COUNTRIES, type Country } from "@/lib/country";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Stores we track — every Riftbound retailer in the comparison",
  description:
    "The full list of Riftbound stores RiftCompare compares prices across, by market (Australia, New Zealand, the US, the UK and Singapore). Don't see your store? Request it.",
  alternates: { canonical: "/stores/tracked" },
};

const MARKETS: Country[] = ["AU", "NZ", "US", "UK", "SG"];

const FAQS = [
  {
    q: "How often are Riftbound card prices updated?",
    a: "Prices across all tracked stores refresh daily. Our crawler visits each retailer's live listings once every 24 hours, so if a store changes a price or restocks a card, it shows up in the comparison the following day.",
  },
  {
    q: "Does RiftCompare include postage in the price comparison?",
    a: "Yes. The price table on every card page ranks stores by total delivered cost — the listed price plus the retailer's estimated postage to your area. Free-shipping thresholds are factored in automatically, so a store with slightly higher card prices but free shipping will often rank above a cheaper store that charges for delivery.",
  },
  {
    q: "Which countries does RiftCompare cover?",
    a: "RiftCompare covers Australia, New Zealand, the United States, the United Kingdom, and Singapore. Each market shows prices in its local currency (AUD, NZD, USD, GBP, SGD) from retailers that actually ship to buyers in that region. Switch markets using the country selector in the navigation.",
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
          plus eBay, grouped by market below. Every card&apos;s comparison ranks these by total delivered cost (price +
          postage), and prices refresh daily.
        </p>
      </div>

      {byMarket.map((m) => (
        <section key={m.code}>
          <h2 className="mb-3 text-lg font-bold text-white">
            {m.info.flag} {m.info.label}{" "}
            <span className="num text-sm font-normal text-slate-500">({m.stores.length})</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {m.stores.map((s) => (
              <a
                key={s.key}
                href={s.base}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="card-surface flex flex-col gap-1 p-4 transition-colors hover:border-brand-500"
              >
                <span className="font-semibold text-white">{s.name}</span>
                <span className="text-xs text-slate-500">{s.shippingNote}</span>
              </a>
            ))}
          </div>
        </section>
      ))}

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
