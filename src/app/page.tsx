import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { CardTile } from "@/components/CardTile";
import { Logo } from "@/components/Logo";
import { CARD_TILE_SELECT } from "@/lib/cards";
import { SETS, domainInfo, DOMAIN_KEYS } from "@/lib/constants";

export const revalidate = 180;

// Homepage-specific metadata targeting the high-intent search phrases.
export const metadata: Metadata = {
  title: { absolute: "Buy & Compare Riftbound Card Prices in Australia | RiftCompare" },
  description:
    "Compare live Riftbound TCG card prices across Australian stores and find the cheapest place to buy Riftbound cards in Australia. Singles and sealed, prices in AUD, updated daily.",
  keywords: [
    "buy Riftbound cards Australia",
    "Riftbound prices Australia",
    "compare Riftbound card prices Australia",
    "cheapest Riftbound cards Australia",
    "Riftbound singles Australia",
    "Riftbound card prices",
    "Riftbound TCG Australia",
  ],
  alternates: { canonical: "/" },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "Where can I buy Riftbound cards in Australia?",
    a: "RiftCompare compares live Riftbound prices across a wide range of Australian stores plus eBay AU, so you can buy Riftbound cards from whichever shop is cheapest. Search any card to see every store's price and click straight through to buy.",
  },
  {
    q: "How do I find the cheapest Riftbound prices in Australia?",
    a: "Search or browse the card database and each card shows the lowest live price across Australian stores, ranked by total delivered cost (item plus postage). It's the fastest way to find the cheapest Riftbound cards in Australia.",
  },
  {
    q: "Does RiftCompare cover Riftbound singles and sealed products?",
    a: "Yes — compare prices on individual Riftbound singles as well as sealed product like booster boxes, booster packs, Proving Grounds and Nexus Night packs, all priced across Australian retailers.",
  },
  {
    q: "Are the Riftbound prices shown in Australian dollars?",
    a: "Yes. Every price is the live Australian price in AUD, so there are no surprise currency conversions — what you see is what you pay locally.",
  },
];

export default async function HomePage() {
  const [totalCards, pricedCards, valuable, storeGroups] = await Promise.all([
    prisma.card.count(),
    prisma.card.count({ where: { lowestPriceCents: { not: null } } }),
    prisma.card.findMany({
      where: { lowestPriceCents: { not: null } },
      orderBy: { lowestPriceCents: "desc" },
      take: 12,
      select: CARD_TILE_SELECT,
    }),
    prisma.retailerPrice.groupBy({ by: ["retailer"] }),
  ]);
  const storeCount = storeGroups.length;

  return (
    <div className="flex flex-col gap-10">
      {/* Hero */}
      <section className="card-surface animate-fade-up overflow-hidden">
        <div className="relative bg-gradient-to-br from-brand-600/25 via-ink-850 to-gold/15 px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center gap-3">
            <span className="animate-float"><Logo size={56} /></span>
            <span className="text-3xl font-extrabold tracking-tight text-white">
              Rift<span className="text-brand-400">Compare</span>
            </span>
          </div>
          <h1 className="mx-auto max-w-3xl text-2xl font-extrabold text-white sm:text-4xl">
            Compare Riftbound card prices across Australian stores
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
            Find the cheapest place to buy Riftbound TCG cards in Australia — live prices in AUD
            compared across {storeCount} Australian stores, updated daily.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/browse" className="btn-primary">Browse the database</Link>
            <Link href="/decks" className="btn-ghost">Top meta decks</Link>
            <Link href="/deck" className="btn-ghost">Deck builder &amp; pricing</Link>
          </div>

          {/* Stats */}
          <div className="mx-auto mt-8 grid max-w-lg grid-cols-3 gap-4">
            <Stat value={totalCards.toLocaleString()} label="cards" />
            <Stat value={pricedCards.toLocaleString()} label="priced" />
            <Stat value={String(storeCount)} label="AU stores" />
          </div>
        </div>
      </section>

      {/* Marketplace promo */}
      <section className="card-surface flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="chip bg-brand-500/15 text-brand-400">New</span>
            <h2 className="text-lg font-bold text-white">Buy &amp; sell with other AU players</h2>
          </div>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            Post want-to-buy and want-to-sell listings on the community forum, and trade directly with
            other collectors. Grab several cards from one seller and save on postage — singles add up fast.
          </p>
        </div>
        <Link href="/forum" className="btn-primary shrink-0">Open the forum →</Link>
      </section>

      {/* Most valuable — compact horizontal scroll */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-extrabold text-white">Chase cards</h2>
          <Link href="/browse?priced=1&sort=price_desc" className="btn-ghost text-xs">View all →</Link>
        </div>
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {valuable.map((c) => (
            <div key={c.id} className="w-36 shrink-0 sm:w-44">
              <CardTile card={c} />
            </div>
          ))}
        </div>
      </section>

      {/* Browse by set */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Browse by set</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SETS.map((s) =>
            s.comingSoon ? (
              <div
                key={s.code}
                className="card-surface flex flex-col gap-1 p-4 opacity-60"
                aria-disabled
              >
                <span className="flex items-center gap-2 text-lg font-bold text-white">
                  {s.code}
                  <span className="chip bg-gold/20 text-gold">Coming soon</span>
                </span>
                <span className="text-xs text-slate-400">{s.name}</span>
              </div>
            ) : (
              <Link
                key={s.code}
                href={`/browse?set=${s.code}`}
                className="card-surface flex flex-col gap-1 p-4 transition-colors hover:border-brand-500"
              >
                <span className="text-lg font-bold text-white">{s.code}</span>
                <span className="text-xs text-slate-400">{s.name}</span>
              </Link>
            )
          )}
        </div>
      </section>

      {/* Browse by domain */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Browse by domain</h2>
        <div className="flex flex-wrap gap-2">
          {DOMAIN_KEYS.map((k) => {
            const d = domainInfo(k);
            return (
              <Link
                key={k}
                href={`/browse?domain=${k}`}
                className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500"
                style={{ color: d.color }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                {d.label}
              </Link>
            );
          })}
        </div>
      </section>

      {/* About + FAQ — keyword-relevant content for search */}
      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Riftbound prices in Australia, all in one place</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          RiftCompare is a free, independent price-comparison tool for Riftbound: League of Legends
          TCG, built for Australian players. We track live prices for every Riftbound card across
          Australian stores and eBay AU so you can buy Riftbound cards in Australia for less — whether
          you&apos;re chasing singles for a deck or sealed booster boxes.
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {FAQS.map((f) => (
            <div key={f.q}>
              <h3 className="font-semibold text-white">{f.q}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-ink-900/70 p-3">
      <div className="text-xl font-extrabold text-gold">{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
