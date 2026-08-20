import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { SETS, DOMAIN_KEYS, domainInfo } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { pageAlternates } from "@/lib/seo";
import { EbayBuyCta } from "@/components/EbayBuyCta";

// SEO hub for the "Riftbound singles" search intent. Market-neutral, richly
// internally-linked, indexable — funnels searchers into the database / sets /
// domains where the live price comparison lives. Deliberately light on DB reads
// (one cached count) to keep egress negligible.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Buy Riftbound Singles — Compare Prices Across Every Store | RiftCompare" },
  description:
    "The cheapest place to buy Riftbound: League of Legends TCG singles. Compare live prices for every single card across stores in AU, US, UK, Singapore, Canada & Germany — ranked by delivered cost, updated daily. Free.",
  keywords: [
    "Riftbound singles",
    "buy Riftbound singles",
    "cheapest Riftbound singles",
    "Riftbound single cards",
    "Riftbound TCG singles",
    "Riftbound card prices",
    "compare Riftbound singles",
  ],
  alternates: pageAlternates("/singles"),
  openGraph: {
    title: "Buy Riftbound Singles — Compare Prices Across Every Store",
    description:
      "Compare live prices for every Riftbound single across stores in AU, US, UK, Singapore, Canada & Germany — ranked by delivered cost, updated daily. Free.",
    url: `${SITE_URL}/singles`,
  },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "What are Riftbound singles?",
    a: "Riftbound singles are individual cards from the Riftbound: League of Legends TCG, sold one at a time rather than in sealed booster packs or boxes. Buying singles lets you get exactly the cards you need for a deck — champions, spells, gear and runes — without opening packs and hoping.",
  },
  {
    q: "Where can I buy Riftbound singles?",
    a: "RiftCompare compares live singles prices across a wide range of local stores in Australia, the US, the UK, Singapore, Canada and Germany, plus eBay. Search any card to see every store's price for that single, ranked by total delivered cost, and click straight through to buy from whichever store is cheapest.",
  },
  {
    q: "How do I find the cheapest Riftbound singles?",
    a: "Search or browse the card database — every single shows its lowest live price in your market. Open a card to see the full store-by-store comparison ranked by delivered cost (price plus postage, with free-shipping thresholds factored in), so you always buy from the genuinely cheapest seller.",
  },
  {
    q: "Are Riftbound singles cheaper than buying packs?",
    a: "For a specific card you want, singles are almost always cheaper and more reliable than chasing it through packs. Packs are for the fun of opening and for chase-card gambling; singles are how you build a deck efficiently. RiftCompare shows the exact singles price so you can decide.",
  },
  {
    q: "Are the singles prices on RiftCompare accurate?",
    a: "Prices are pulled directly from each store's live public listings and refreshed daily, in each market's local currency. Stock and prices can change between our update and your visit, so always confirm the final price at checkout — but the comparison reflects each store's most recent listed price.",
  },
];

async function getTotal(): Promise<number> {
  return unstable_cache(() => prisma.card.count(), ["singles-total"], { revalidate: 3600, tags: [CONTENT_TAG] })().catch(() => 0);
}

export default async function SinglesPage() {
  const total = await getTotal();

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Riftbound Singles", item: `${SITE_URL}/singles` },
    ],
  };
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Buy Riftbound Singles — Compare Prices",
    url: `${SITE_URL}/singles`,
      // Edges back to the site-level graph in app/layout.tsx. Without them this
      // node is an island and the Organization/WebSite entity signals — sameAs,
      // areaServed, knowsAbout — don't propagate to the page.
      isPartOf: { "@id": `${SITE_URL}/#website` },
      publisher: { "@id": `${SITE_URL}/#org` },
    description: "Compare live prices for every Riftbound single across stores in AU, US, UK and Singapore.",
  };

  return (
    <div className="flex flex-col gap-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([faqLd, breadcrumbLd, collectionLd]) }} />

      {/* Hero */}
      <section className="card-surface relative overflow-hidden">
        <div className="border-l-2 border-brand-500 bg-ink-900 px-6 py-8 sm:px-8 sm:py-10">
          <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-slate-300">Home</Link>
            <span>/</span>
            <span className="text-slate-300">Riftbound Singles</span>
          </nav>
          <h1 className="text-2xl font-extrabold text-white sm:text-4xl">Buy Riftbound singles — for less</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
            RiftCompare is the price comparison for <strong className="text-slate-200">Riftbound: League of Legends TCG
            singles</strong>. Search any card and see every store&apos;s live price side by side — ranked by total
            delivered cost across Australia, the US, the UK, Singapore, Canada and Germany, updated daily. Find the cheapest
            place to buy the exact cards your deck needs.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/browse" className="btn-primary">Browse all singles →</Link>
            <Link href="/browse?priced=1&sort=price_asc" className="btn-ghost">Cheapest singles</Link>
          </div>
          {total > 0 && (
            <p className="mt-4 text-xs text-slate-500">
              <span className="num text-slate-300">{total.toLocaleString()}</span> Riftbound cards in the database, priced daily.
            </p>
          )}
          {/* Widest-selection buy-path — eBay carries every Riftbound single
              (new/used/graded) in every market, so it's the always-available option
              beside the local store comparison. */}
          <EbayBuyCta className="mt-5 max-w-2xl" />
        </div>
      </section>

      {/* Entry points */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Find the single you&apos;re after</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <HubCard href="/browse" title="Full card database" desc="Every Riftbound single, filterable by set, domain, rarity, type and price — with live prices." />
          <HubCard href="/browse?priced=1&sort=price_asc" title="Cheapest singles" desc="The lowest-priced Riftbound cards available right now in your market." />
          <HubCard href="/movers" title="Price movers" desc="Which singles are climbing or cooling this week — buy before a spike." />
          <HubCard href="/market" title="The RiftCompare Index" desc="One number for the whole Riftbound singles market, tracked daily." />
          <HubCard href="/deck" title="Whole-deck pricer" desc="Price an entire deck's singles across every store in one click — the cheapest combined cart." />
          <HubCard href="/stores/tracked" title="Stores we compare" desc="Every Riftbound retailer in the comparison, by market." />
        </div>
      </section>

      {/* By set */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Riftbound singles by set</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SETS.map((s) => (
            <Link
              key={s.code}
              href={`/sets/${s.slug}`}
              className="card-surface flex flex-col gap-1 p-4 transition-colors hover:border-brand-500 hover:bg-ink-800"
            >
              <span className="text-lg font-bold text-white">{s.code}</span>
              <span className="text-xs text-slate-400">{s.name} singles</span>
            </Link>
          ))}
        </div>
      </section>

      {/* By domain */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Riftbound singles by domain</h2>
        <div className="flex flex-wrap gap-2">
          {DOMAIN_KEYS.map((k) => {
            const d = domainInfo(k);
            return (
              <Link
                key={k}
                href={`/domains/${k.toLowerCase()}`}
                className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500 hover:bg-ink-800"
              >
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: d.color }} aria-hidden />
                {d.label}
              </Link>
            );
          })}
        </div>
      </section>

      {/* How to buy for less */}
      <section className="card-surface p-6 sm:p-8">
        <h2 className="text-xl font-extrabold text-white">How to buy Riftbound singles for less</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          <li>
            <div className="text-sm font-bold text-brand-300">1 · Search the card</div>
            <p className="mt-1 text-sm text-slate-400">Find any Riftbound single in the <Link href="/browse" className="text-brand-400 hover:underline">database</Link> — it shows the lowest live price in your market instantly.</p>
          </li>
          <li>
            <div className="text-sm font-bold text-brand-300">2 · Compare every store</div>
            <p className="mt-1 text-sm text-slate-400">Open the card for the full store-by-store table, in stock and ranked by <strong className="text-slate-200">total delivered cost</strong> (price + postage).</p>
          </li>
          <li>
            <div className="text-sm font-bold text-brand-300">3 · Buy from the cheapest</div>
            <p className="mt-1 text-sm text-slate-400">Click straight through to the exact listing at the store charging the least — no hunting across tabs.</p>
          </li>
        </ol>
        <p className="mt-5 text-sm text-slate-400">
          New to buying singles? Read the market guides:{" "}
          <Link href="/blog/buy-riftbound-cards-us" className="text-brand-400 hover:underline">US</Link>,{" "}
          <Link href="/blog/buy-riftbound-cards-australia" className="text-brand-400 hover:underline">Australia</Link>,{" "}
          <Link href="/blog/buy-riftbound-cards-uk" className="text-brand-400 hover:underline">UK</Link> and{" "}
          <Link href="/blog/riftbound-price-comparison-singapore" className="text-brand-400 hover:underline">Singapore</Link>.
        </p>
      </section>

      {/* FAQ */}
      <section className="card-surface divide-y divide-ink-800 overflow-hidden">
        <h2 className="px-6 py-4 text-lg font-extrabold text-white">Riftbound singles — FAQ</h2>
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
    </div>
  );
}

function HubCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="card-surface flex flex-col gap-1 p-5 transition-colors hover:border-brand-500 hover:bg-ink-800">
      <span className="font-bold text-white">{title}</span>
      <span className="text-sm text-slate-400">{desc}</span>
    </Link>
  );
}
