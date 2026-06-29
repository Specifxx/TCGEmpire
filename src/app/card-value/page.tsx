import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchBar } from "@/components/SearchBar";
import { CardTile } from "@/components/CardTile";
import { AdSlot } from "@/components/AdSlot";
import { getValuableCards } from "@/lib/cheapest-cards";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { SITE_URL } from "@/lib/site";

// Public value-checker lander — the consumer counterpart to the Premium
// /tools/value-finder screener. Targets the biggest evergreen query family for a
// young TCG: "riftbound card value / prices / what are my cards worth". The product
// behind it is the same database; this page frames it for that intent. ISR (like the
// homepage) so crawlers get fast, cached HTML — no force-dynamic.
export const revalidate = 180;

export const metadata: Metadata = {
  title: { absolute: "Riftbound Card Value Checker — What Are Your Cards Worth?" },
  description:
    "Check what your Riftbound cards are worth, free: search any card to see its live market value plus real store prices across Australia, New Zealand, the US and the UK. Base prints to Signature chases — updated daily, no signup.",
  keywords: [
    "riftbound card value",
    "riftbound card prices",
    "how much are my riftbound cards worth",
    "riftbound card price checker",
    "riftbound card worth",
    "riftbound price guide",
    "most valuable riftbound cards",
  ],
  alternates: { canonical: "/card-value" },
  openGraph: { title: "Riftbound Card Value Checker — what are your cards worth?", url: `${SITE_URL}/card-value` },
};

const FACTORS = [
  { t: "Rarity & printing", d: "Base prints are cheap and play identically. Alt-art / Showcase, overnumbered and Signature (★) printings are where the value lives — same card, collector pricing." },
  { t: "Condition", d: "Near Mint sets the benchmark every price assumes. Visible wear should always cost less — be honest grading your own copies." },
  { t: "The card itself", d: "Chase Legends and their Champions hold value; the cards everyone wants to build around carry a premium that bulk Units and Runes never will." },
  { t: "Demand & the meta", d: "Format staples rise when their deck is winning and cool off when it rotates out of favour. Demand, not just rarity, sets the live price." },
];

const FAQS = [
  {
    q: "How much are my Riftbound cards worth?",
    a: "Search the card's name (and collector number, e.g. 112/298) in the checker above. You'll see its live market value plus what real stores are charging for it right now in your country — market value is what it trades for, store prices are what you can actually buy or benchmark a sale against.",
  },
  {
    q: "What makes a Riftbound card valuable?",
    a: "Four things: the printing (Signature ★, overnumbered and alt-art / Showcase copies command big premiums over the base print), condition (Near Mint leads), the card itself (chase Legends and Champions people build around), and demand (format staples rise with the meta). A base-print Unit is pennies — and that's normal.",
  },
  {
    q: "Is this Riftbound value checker free?",
    a: "Completely free, no account or signup. Values refresh daily from live prices across the stores we track in Australia, New Zealand, the US and the UK. (Our Premium Value Finder is a separate tool that screens for cards trading below their recent average.)",
  },
  {
    q: "How do I find the most valuable Riftbound cards?",
    a: "Browse the database sorted by price, or read our rundown of the chase cards and why they cost what they do. Every card links through to its live value across stores.",
  },
  {
    q: "Are the values shown in my currency?",
    a: "Yes. Every figure is the live local price in your market's currency (AUD, NZD, USD or GBP), so there are no surprise conversions — what you see is what you'd pay or sell for locally.",
  },
];

export default async function CardValuePage() {
  const country = getCountry();
  const info = COUNTRIES[country];
  const valuable = await getValuableCards(12, country);

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
      { "@type": "ListItem", position: 2, name: "Card Value Checker", item: `${SITE_URL}/card-value` },
    ],
  };
  const appLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Riftbound Card Value Checker",
    url: `${SITE_URL}/card-value`,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: info.currency },
    description:
      "Free Riftbound card value checker: search any card for its live market value and real store prices across AU, NZ, US and UK.",
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([faqLd, breadcrumbLd, appLd]) }} />

      {/* Hero — search-first */}
      <section className="card-surface overflow-hidden">
        <div className="bg-gradient-to-br from-brand-600/25 via-ink-850 to-gold/15 px-6 py-10 text-center">
          <h1 className="mx-auto max-w-2xl font-display text-3xl font-extrabold text-white sm:text-4xl">
            Riftbound card value checker
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Type any card to see <strong className="text-white">what it&apos;s worth right now</strong> — live market
            value plus real {info.adjective} store prices, free and updated daily.
          </p>
          <div className="mx-auto mt-6 max-w-xl">
            <Suspense fallback={<div className="input" />}>
              <SearchBar />
            </Suspense>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Tip: include the collector number (e.g. &ldquo;Jinx 112/298&rdquo;) to land on the exact printing.
          </p>
        </div>
      </section>

      {/* What drives a card's value */}
      <section>
        <h2 className="mb-3 text-xl font-extrabold text-white">What makes a Riftbound card valuable</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FACTORS.map((x) => (
            <div key={x.t} className="card-surface p-4">
              <h3 className="font-bold text-white">{x.t}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      <AdSlot height={100} />

      {/* Live proof — the most valuable cards in their market */}
      {valuable.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-white">The most valuable cards right now</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Live {info.adjective} prices — click any card for its full value breakdown across stores.
              </p>
            </div>
            <Link href="/browse?priced=1&sort=price_desc" className="btn-ghost shrink-0 text-xs">View all →</Link>
          </div>
          <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
            {valuable.map((c) => (
              <div key={c.id} className="w-36 shrink-0 sm:w-44">
                <CardTile card={c} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Routes deeper into value content */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Link href="/guides/most-valuable-riftbound-cards" className="card-surface p-4 transition-colors hover:border-brand-500/60">
          <div className="text-sm font-extrabold text-white">Most valuable cards, explained</div>
          <p className="mt-1 text-xs text-slate-400">The chase cards and why they cost what they do.</p>
        </Link>
        <Link href="/movers" className="card-surface p-4 transition-colors hover:border-brand-500/60">
          <div className="text-sm font-extrabold text-white">Price movers</div>
          <p className="mt-1 text-xs text-slate-400">What&apos;s rising and falling across the market this week.</p>
        </Link>
        <Link href="/tools/value-finder" className="card-surface p-4 transition-colors hover:border-brand-500/60">
          <div className="text-sm font-extrabold text-white">Value Finder <span className="text-[10px] font-bold uppercase text-gold">Premium</span></div>
          <p className="mt-1 text-xs text-slate-400">Screen for cards trading below their recent average.</p>
        </Link>
      </section>

      {/* FAQ (matches the FAQPage JSON-LD) */}
      <section>
        <h2 className="mb-3 text-xl font-extrabold text-white">Riftbound card value — FAQ</h2>
        <div className="card-surface divide-y divide-ink-800">
          {FAQS.map((f) => (
            <div key={f.q} className="px-5 py-4">
              <h3 className="font-bold text-white">{f.q}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-slate-600">
        Riftbound is a trademark of Riot Games. RiftCompare is an independent community price-comparison site —
        values are sourced from public store listings and may be out of date; always confirm on the retailer&apos;s site.
      </p>
    </div>
  );
}
