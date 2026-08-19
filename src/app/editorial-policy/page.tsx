import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";
import { STATIC_PAGE_DATES, staticPageDateLabel } from "@/lib/static-page-dates";
import { RETAILER_LIST } from "@/lib/retailers";
import { pageAlternates } from "@/lib/seo";

export const revalidate = 86400;


export const metadata: Metadata = {
  title: "Editorial & pricing policy",
  description:
    "Who writes RiftCompare, how we collect and verify card prices, how often they refresh, how we handle affiliate links, and how to report an error.",
  alternates: pageAlternates("/editorial-policy"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Every claim on this page is checkable against the code:
//   • store count            → lib/retailers.ts (RETAILER_LIST)
//   • daily refresh          → vercel.json cron "0 18 * * *" → /api/cron/refresh-prices
//   • page cache windows     → `export const revalidate` on each route
//   • affiliate marking      → outboundRel() in lib/affiliate.ts
//   • what is generated      → lib/content/card-narrative.ts, lib/content/authors.ts
// Nothing here describes a process we don't actually run.
export default function EditorialPolicyPage() {
  const storeCount = RETAILER_LIST.length;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Editorial & pricing policy",
    url: `${SITE_URL}/editorial-policy`,
    // From the shared table, not a literal. The visible "Last updated" line below
    // already reads staticPageDateLabel("/editorial-policy"); a second hardcoded
    // copy here meant the structured data a crawler consumes could disagree with
    // the date a human reads, and only one of the two would ever get bumped.
    dateModified: STATIC_PAGE_DATES["/editorial-policy"],
    publisher: { "@id": `${SITE_URL}/#org` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Editorial policy", item: `${SITE_URL}/editorial-policy` },
      ],
    },
  };

  return (
    <article className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-400">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-white">Home</Link></li>
          <li className="text-ink-700">/</li>
          <li className="text-slate-300" aria-current="page">Editorial policy</li>
        </ol>
      </nav>

      <h1 className="text-3xl font-extrabold leading-tight text-white">Editorial &amp; pricing policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {staticPageDateLabel("/editorial-policy")}</p>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
        {SITE_NAME} publishes two things: prices we collect ourselves, and writing about the
        Riftbound market. This page explains how both are produced, who is responsible for them,
        what we do when we get something wrong, and how we make money. If anything here does not
        match what you see on the site, that is a bug — please tell us.
      </p>

      <div className="mt-8 space-y-8 border-t border-ink-800 pt-8 text-sm leading-relaxed text-slate-300">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">Who writes the content</h2>
          <p>
            Guides and posts are written by the people who run {SITE_NAME}, publishing under the{" "}
            <Link href="/authors/riftcompare-editorial" className="text-brand-400 hover:underline">RiftCompare</Link>{" "}
            byline. Writing that is generated directly from our price database — index movements,
            price snapshots, set-level distributions — carries a separate{" "}
            <Link href="/authors/riftcompare-markets-desk" className="text-brand-400 hover:underline">RiftCompare Markets Desk</Link>{" "}
            byline instead, so you can always tell which is which.
          </p>
          <p>
            Every guide and post shows its author, its publish date and, where it has been
            substantively revised, its last-updated date. See{" "}
            <Link href="/authors" className="text-brand-400 hover:underline">who writes RiftCompare</Link>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">What is automated, and what isn&rsquo;t</h2>
          <p>
            We are explicit about this because the distinction matters. Three different things
            appear on this site:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white">Prices and market data</strong> — collected
              automatically from public store listings, every day. No human writes these numbers.
            </li>
            <li>
              <strong className="text-white">Card page analysis</strong> — the &ldquo;About&rdquo;
              section on each card page is assembled programmatically from that card&rsquo;s own
              recorded data: its cross-market spread, its price trajectory, how many stores stock
              it, what its variants cost, where it sits in its set. It is generated, and every
              statement in it is derived from a figure we have actually recorded. Where the data
              doesn&rsquo;t support an observation, the observation is left out rather than guessed
              at.
            </li>
            <li>
              <strong className="text-white">Guides and posts</strong> — written by people, and
              researched against the same price database, so the figures quoted are the ones our
              importer recorded.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">How prices are collected</h2>
          <p>
            We track roughly {storeCount} retailers across Australia, New Zealand, the United
            States, the United Kingdom, Singapore and Canada, plus eBay in each market and
            TCGplayer. Prices come from those stores&rsquo; own public product listings and from
            official marketplace APIs. We do not accept price submissions from retailers, and no
            retailer can pay to appear, to rank higher, or to have a competitor removed.
          </p>
          <p>
            Each listing is matched to a specific printing — set code and collector number, not just
            a card name — so a promo, an alternate art and a Signature print are tracked as three
            separate products with three separate prices, because that is what they are.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">How often prices refresh</h2>
          <ul className="list-disc space-y-1 pl-5">
            {/* Twice, not once: .github/workflows/refresh-prices.yml is scheduled at
                07:00 and 19:00 UTC and store prices are imported on BOTH runs (a
                Vercel cron hits /api/cron/refresh-prices as well). Only the eBay
                catalogue pass is held to once a day, by the 20-hour gate in
                lib/price-import.ts. The page claimed 24 hours for everything, which
                understated the store cadence and misdescribed eBay's. */}
            <li><strong className="text-white">Store prices:</strong> a full import runs twice a day.</li>
            <li><strong className="text-white">eBay listings:</strong> the whole catalogue is searched once every 24 hours; the chase printings (promos, signatures and overnumbered prints above a value floor) refresh twice a day.</li>
            <li><strong className="text-white">Price history:</strong> one recorded point per card per market per day, which is what the charts and trend figures are built from.</li>
            <li><strong className="text-white">Card pages:</strong> regenerated at most every 24 hours, and immediately when that card&rsquo;s data changes.</li>
            <li><strong className="text-white">Index and homepage:</strong> hourly.</li>
          </ul>
          <p>
            Every page that quotes a price is showing the last figure we recorded, not a live
            lookup. Stock sells and shops re-price between imports, so{" "}
            <strong className="text-white">always confirm the price on the retailer&rsquo;s own site
            before you buy</strong>. We say so in the footer of every page for the same reason.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">How prices are verified</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>A listing that hasn&rsquo;t been seen in a recent import is marked out of stock rather than left standing as a live price.</li>
            <li>Prices are compared in each market&rsquo;s own currency. We do not convert between currencies to declare a winner, because we would be publishing an exchange rate we can&rsquo;t stand behind.</li>
            <li>Rankings are by item price, with a store&rsquo;s known postage breaking ties between otherwise-equal prices — delivered cost (price plus postage) is always shown alongside the price so you can compare on it yourself, but a store is never penalised in the ranking just because its postage happens to be known when a competitor&rsquo;s isn&rsquo;t. Never by what we earn.</li>
            <li>A consistency audit runs over the card database on demand, checking for duplicate records, broken identifiers, impossible prices and stale listings.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">Corrections</h2>
          <p>
            When we find or are told about an error, we fix the underlying data and let the affected
            pages regenerate — usually within minutes for a single card. Where a published guide
            turns out to be wrong rather than merely out of date, we correct the text and update its
            last-updated date so the change is visible rather than silent. We don&rsquo;t quietly
            delete pieces that turned out to be wrong.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">How to report an error</h2>
          <p>
            Email <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>{" "}
            or use our <Link href="/contact" className="text-brand-400 hover:underline">contact form</Link>.
            The most useful report includes the page URL, what it says, and what it should say —
            a link to the retailer listing settles almost every pricing question in one step.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">How we make money, and what it does not buy</h2>
          <p>
            {SITE_NAME} is funded by advertising (including Google AdSense), affiliate commissions,
            Premium subscriptions and marketplace fees. Outbound links that earn us a commission are
            marked <code className="rounded bg-ink-800 px-1 text-xs">rel=&quot;sponsored&quot;</code> and
            disclosed in plain language next to the link.
          </p>
          <p>
            None of it affects the prices we show or the order results appear in. Ranking is
            computed from price and postage alone; a store we earn nothing from outranks one we do
            whenever it is cheaper, which is most of the time. See our{" "}
            <Link href="/privacy" className="text-brand-400 hover:underline">privacy policy</Link>{" "}
            for what advertising and analytics cookies are set and how to opt out.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">Independence</h2>
          <p>
            We are not affiliated with, endorsed by, or sponsored by Riot Games, and we are not
            owned by or affiliated with any retailer we compare. We do not accept payment for
            editorial coverage, and we do not publish sponsored posts.
          </p>
          <p>
            Nothing on this site is financial or investment advice. Trading card prices are volatile
            and can fall as easily as they rise.
          </p>
        </section>
      </div>
    </article>
  );
}
