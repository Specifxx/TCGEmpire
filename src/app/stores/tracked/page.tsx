import type { Metadata } from "next";
import Link from "next/link";
import { RETAILER_LIST } from "@/lib/retailers";
import { REFERENCE_SOURCES } from "@/lib/constants";
import { COUNTRIES, type Country } from "@/lib/country";
import { SITE_URL } from "@/lib/site";
import { storeSlug } from "@/lib/store-pages";
import { pageAlternates } from "@/lib/seo";
import { shippingNoteFor } from "@/lib/shipping";

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
        {/* Jump index (2026-09-23). At 390 this page is ~22,000px of
            single-column store cards: Canada starts ~12,300px down and the EU
            ~18,400px, and the page had no anchors at all. The reference-sources
            section is deliberately not listed, because it isn't a market.
            .min-h-11 is 48px on coarse pointers (globals.css), and the compact
            reset from sm up is scoped to a fine pointer so a touch tablet or
            landscape phone keeps that floor (a bare sm:min-h-0 cancelled it and
            the chips measured 26px there, 2026-09-23). */}
        <nav aria-label="Jump to a market" className="mt-4 flex flex-wrap gap-2">
          {byMarket.map((m) => (
            <a
              key={m.code}
              href={`#market-${m.code.toLowerCase()}`}
              className="chip min-h-11 border border-ink-700 px-3 text-sm text-slate-300 hover:border-brand-500 sm:[@media(pointer:fine)]:min-h-0"
            >
              {m.info.flag} {m.info.label} <span className="num text-slate-500">{m.stores.length}</span>
            </a>
          ))}
        </nav>
      </div>

      {byMarket.map((m) => (
        // scroll-mt-header: the header-aware anchor offset (globals.css), so a
        // jump lands the h2 below the 125px two-row header on phones.
        <section key={m.code} id={`market-${m.code.toLowerCase()}`} className="scroll-mt-header">
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
                {/* Measured postage with its date, or a labelled estimate (lib/shipping.ts) —
                    no longer retailers.ts's hand-typed shippingNote. */}
                <span className="text-xs text-slate-500">{shippingNoteFor(s.key)}</span>
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
          <details key={f.q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-sm font-semibold text-slate-200 hover:text-white [&::-webkit-details-marker]:hidden">
              {f.q}
              <span className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden>▾</span>
            </summary>
            <p className="px-6 pb-4 text-sm leading-relaxed text-slate-400">{f.a}</p>
          </details>
        ))}
      </section>

      <section className="card-surface p-6 text-center">
        <h2 className="text-lg font-bold text-white">Don&apos;t see your store?</h2>
        <p className="mx-auto mt-1 max-w-xl text-sm text-slate-400">
          We&apos;re always adding retailers. If there&apos;s a Riftbound store you&apos;d like compared — or you run one —
          suggest it and we&apos;ll look at adding it. Free listing, more customers.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link href="/stores/suggest" className="btn-primary inline-flex">
            Suggest a store →
          </Link>
          {/* This page's own copy already says "or you run one", and until now
              the only thing offered to that reader was a free listing. The
              retailer side of the site lives at /stores; a store owner reading
              this sentence is the most qualified visitor it gets. */}
          <Link href="/stores" className="btn-ghost inline-flex">
            Run a store? See what we do for retailers
          </Link>
        </div>
      </section>
    </div>
  );
}
