import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CardTile } from "@/components/CardTile";
import { CountryHeroToggle } from "@/components/CountryHeroToggle";
import { Partners } from "@/components/Partners";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { getPopularCards } from "@/lib/cheapest-cards";
import { getPriceMovers } from "@/lib/price-history";
import { PriceWatch } from "@/components/PriceWatch";
import { CountUp } from "@/components/CountUp";
import { Reveal } from "@/components/Reveal";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, priceField, type CountryInfo } from "@/lib/country";
import { SETS, domainInfo, DOMAIN_KEYS } from "@/lib/constants";
import { getTopDeals } from "@/lib/top-deals";
import { TodaysTopDeals } from "@/components/TodaysTopDeals";

// ISR while AU-only; becomes dynamic per-request when NZ mode is enabled (getCountry
// then reads the country cookie).
export const revalidate = 180;

// Market-neutral metadata (no country in the title) so search results aren't biased
// to one country — the visible page below is still tailored to the visitor's market.
export const metadata: Metadata = {
  title: { absolute: "Buy & Compare Riftbound Card Prices | RiftCompare" },
  description:
    "Compare live Riftbound TCG card prices across stores in Australia, New Zealand, the United States and the United Kingdom, and find the cheapest place to buy Riftbound singles and sealed. Updated daily.",
  keywords: [
    "buy Riftbound cards",
    "Riftbound prices",
    "compare Riftbound card prices",
    "cheapest Riftbound cards",
    "Riftbound singles",
    "Riftbound TCG",
    "Riftbound card prices",
  ],
  alternates: { canonical: "/" },
};

// eBay marketplace label per market (NZ has no eBay).
function ebayLabel(country: string): string | null {
  return country === "AU" ? "eBay AU" : country === "US" ? "eBay US" : country === "UK" ? "eBay UK" : null;
}

// FAQ content tailored to the visitor's market. Uses `place` after "in" (so US
// reads "in the United States") and `adjective` before nouns ("Australian stores").
function faqsFor(info: CountryInfo, ebay: string | null): { q: string; a: string }[] {
  const { adjective, place, currency } = info;
  return [
    {
      q: `Where can I buy Riftbound cards in ${place}?`,
      a: `RiftCompare compares live Riftbound prices across a wide range of ${adjective} stores${ebay ? ` plus ${ebay}` : ""}, so you can buy Riftbound cards from whichever shop is cheapest. Search any card to see every store's price and click straight through to buy.`,
    },
    {
      q: `How do I find the cheapest Riftbound prices in ${place}?`,
      a: `Search or browse the card database and each card shows the lowest live price across ${adjective} stores, ranked by total delivered cost (item plus shipping). It's the fastest way to find the cheapest Riftbound cards in ${place}.`,
    },
    {
      q: "Does RiftCompare cover Riftbound singles and sealed products?",
      a: `Yes — compare prices on individual Riftbound singles as well as sealed products like booster boxes, booster packs, Proving Grounds and Nexus Night packs, all priced across ${adjective} retailers.`,
    },
    {
      q: `Are the Riftbound prices shown in ${currency}?`,
      a: `Yes. Every price is the live ${adjective} price in ${currency}, so there are no surprise currency conversions — what you see is what you pay locally.`,
    },
  ];
}

export default async function HomePage() {
  const country = getCountry();
  const info = COUNTRIES[country];
  const ebay = ebayLabel(country);
  const faqs = faqsFor(info, ebay);
  const field = priceField(country);
  const [totalCards, pricedCards, inStockUnits, popularCards, storeGroups, movers, topDeals] = await Promise.all([
    prisma.card.count(),
    prisma.card.count({ where: { [field]: { not: null } } }),
    // Live, in-stock store listings analysed in this market — the real units we
    // compared (the market-guide reference rows are not a buyable unit, so excluded).
    prisma.retailerPrice.count({ where: { country, inStock: true, NOT: { retailer: { startsWith: "marketguide" } } } }),
    // Most-searched singles (ties → more expensive card) — the cards people most want.
    getPopularCards(12, country),
    // Stores serving the selected market (eBay excluded from the count).
    prisma.retailerPrice.groupBy({ by: ["retailer"], where: { country, NOT: { retailer: { startsWith: "ebay" } } } }),
    // This week's biggest price movers (viewer's market). The cookie read makes this
    // page per-request, so cache the heavy 35-day aggregation server-side per market
    // (prices only change on the ~3-hourly import anyway).
    unstable_cache(() => getPriceMovers(country), ["price-movers", country], { revalidate: 600 })(),
    // Today's Top Deals blends four signals; cache per-market like the movers above.
    unstable_cache(() => getTopDeals(country), ["top-deals", country], { revalidate: 600 })(),
  ]);
  const storeCount = storeGroups.length;
  const storeWord = storeCount === 1 ? "store" : "stores";

  return (
    <div className="flex flex-col gap-10">
      {/* Hero */}
      <section className="card-surface animate-fade-up relative overflow-hidden">
        {/* Animated ambient background: blurred brand/gold "aurora" blobs + a soft
            dotted texture. Decorative only, so hidden from assistive tech. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-24 -top-28 h-80 w-80 rounded-full bg-brand-500/25 blur-3xl animate-blob" />
          <div className="absolute -right-20 -top-4 h-72 w-72 rounded-full bg-gold/15 blur-3xl animate-blob [animation-delay:3s]" />
          <div className="absolute -bottom-28 left-1/3 h-80 w-80 rounded-full bg-brand-400/20 blur-3xl animate-blob [animation-delay:6s]" />
          <div className="hero-dots absolute inset-0 opacity-60" />
        </div>

        <div className="relative bg-gradient-to-br from-brand-600/20 via-ink-850/40 to-gold/10 px-6 py-14 text-center">
          <div className="mx-auto mb-5 flex items-center justify-center">
            <div className="relative animate-float">
              {/* Gentle glow halo behind the mark. */}
              <div className="absolute inset-0 -z-10 rounded-full bg-brand-500/30 blur-2xl animate-glow-pulse" aria-hidden />
              {/* Above-the-fold LCP candidate: explicit size (no CLS) + high fetch priority. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-r-green.png" alt="RiftCompare" width={359} height={353} fetchPriority="high" className="h-16 w-auto drop-shadow-[0_8px_24px_rgba(52,209,126,0.35)] sm:h-20" />
            </div>
          </div>

          {/* Live badge */}
          <div className="animate-fade-in [animation-delay:60ms]">
            <span className="chip mb-4 border border-brand-500/30 bg-brand-500/10 text-brand-300">
              <span className="relative mr-0.5 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
              </span>
              Live prices · updated daily
            </span>
          </div>

          <h1 className="animate-fade-in [animation-delay:120ms] mx-auto max-w-3xl text-3xl font-extrabold text-white sm:text-5xl">
            Compare <span className="brand-shimmer">Riftbound</span> card prices across {info.adjective} stores
          </h1>
          <p className="animate-fade-in [animation-delay:200ms] mx-auto mt-4 max-w-2xl text-sm text-slate-300 sm:text-base">
            Find the cheapest place to buy Riftbound TCG cards in {info.place} — live prices in{" "}
            {info.currency} compared across {storeCount} {info.adjective} {storeWord}, updated daily.
          </p>

          <div className="animate-fade-in [animation-delay:280ms] mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/browse" className="btn-primary cta-shine">Browse the database</Link>
            <Link href="/decks" className="btn-ghost">Top meta decks</Link>
            <Link href="/deck" className="btn-ghost">Deck builder &amp; pricing</Link>
            <Link href="/learn" className="btn-ghost">🎓 New to Riftbound?</Link>
          </div>

          {/* Country / market toggle */}
          <div className="animate-fade-in [animation-delay:340ms]">
            <CountryHeroToggle />
          </div>

          {/* Stats */}
          <div className="animate-fade-in [animation-delay:420ms] mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat value={totalCards} label="cards" />
            <Stat value={pricedCards} label="priced" />
            <Stat value={inStockUnits} label="in-stock listings" />
            <Stat value={storeCount} label={`${info.code} ${storeWord}`} />
          </div>
        </div>
      </section>

      {/* Official partner programs — credibility strip (approved affiliates). */}
      <Reveal>
        <Partners country={country} />
      </Reveal>

      {/* Most popular cards — the most-searched Riftbound singles right now */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-white">Most popular Riftbound cards</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              The most-searched cards right now — compare {storeCount} {info.adjective} {storeWord} for every one to find the best price.
            </p>
          </div>
          <Link href="/browse" className="btn-ghost text-xs shrink-0">View all →</Link>
        </div>
        <Reveal stagger className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {popularCards.map((c) => (
            <div key={c.id} className="w-36 shrink-0 sm:w-44">
              <CardTile card={c} />
            </div>
          ))}
        </Reveal>
      </section>

      {/* Today's Top Deals — the best live opportunities across four signals
          (premium columns reveal only the top pick). Hidden if no market has data. */}
      {topDeals.hasAny && (
        <Reveal>
          <TodaysTopDeals deals={topDeals} country={country} currency={info.currency} place={info.place} />
        </Reveal>
      )}

      {/* TCGplayer affiliate banner — billboard on desktop, 300x250 rectangle on
          phones (the strongest mobile in-content unit). */}
      <TcgplayerAd size="billboard" mobile="rect" country={country} />

      {/* Price Watch — this week's movers in the viewer's market */}
      <Reveal>
        <PriceWatch movers={movers} currency={info.currency} place={info.place} />
      </Reveal>

      {/* Browse by set */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Browse by set</h2>
        <Reveal stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SETS.map((s) =>
            // Fully unreleased (no cards, no sealed) → disabled tile. Vendetta has
            // sealed live, so it links through with a "Cards soon · Sealed now" cue.
            s.comingSoon && !s.sealedAvailable ? (
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
                href={`/sets/${s.slug}`}
                className="card-surface flex flex-col gap-1 p-4 transition-all duration-200 hover:-translate-y-1 hover:border-brand-500 hover:shadow-glow"
              >
                <span className="flex flex-wrap items-center gap-1.5 text-lg font-bold text-white">
                  {s.code}
                  {s.comingSoon && s.sealedAvailable && (
                    <>
                      <span className="chip bg-gold/20 text-gold">Cards soon</span>
                      <span className="chip bg-brand-500/15 text-brand-300">Sealed now</span>
                    </>
                  )}
                </span>
                <span className="text-xs text-slate-400">{s.name}</span>
              </Link>
            )
          )}
        </Reveal>
      </section>

      {/* Browse by domain */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Browse by domain</h2>
        <Reveal stagger className="flex flex-wrap gap-2">
          {DOMAIN_KEYS.map((k) => {
            const d = domainInfo(k);
            return (
              <Link
                key={k}
                href={`/domains/${k.toLowerCase()}`}
                className="chip border border-ink-700 px-3 py-1.5 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 hover:border-brand-500"
                style={{ color: d.color }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                {d.label}
              </Link>
            );
          })}
        </Reveal>
      </section>

      {/* Second TCGplayer banner — far enough from the first that it never
          shares a viewport with it. */}
      <TcgplayerAd size="leaderboard" country={country} />

      {/* About + FAQ — keyword-relevant content for search */}
      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Riftbound prices in {info.place}, all in one place</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          RiftCompare is a free, independent price-comparison tool for Riftbound: League of Legends
          TCG, built for {info.adjective} players. We track live prices for every Riftbound card across
          {" "}{info.adjective} stores{ebay ? ` and ${ebay}` : ""} so you can buy Riftbound cards in {info.place} for
          less — whether you&apos;re chasing singles for a deck or sealed booster boxes.
        </p>
        {/* Collapsible FAQ — tidy on mobile; answers still in the DOM for SEO. */}
        <div className="mt-5 divide-y divide-ink-800 border-t border-ink-800">
          {faqs.map((f) => (
            <details key={f.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold text-white [&::-webkit-details-marker]:hidden">
                <span>{f.q}</span>
                <svg
                  className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <p className="pb-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-ink-700/50 bg-ink-900/70 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/40">
      <div className="text-xl font-extrabold text-gold sm:text-2xl">
        <CountUp value={value} />
      </div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
