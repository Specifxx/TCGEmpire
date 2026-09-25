import type { Metadata } from "next";
import Link from "next/link";
import { getPriceMovers, recentMethodologyBreak } from "@/lib/price-history";
import { getTopDemand, FREE_DEMAND_ROWS } from "@/lib/demand";
import { MostSearchedStrip } from "@/components/MostSearchedStrip";
import { PriceWatch } from "@/components/PriceWatch";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/country";
import { SETS } from "@/lib/constants";
import { AnswerBox } from "@/components/AnswerBox";
import { HubFaq } from "@/components/HubFaq";
import { faqPage } from "@/lib/jsonld";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { AdSlot } from "@/components/AdSlot";
import { MoversToolsCta } from "@/components/MoversToolsCta";
import { NewsletterSignup } from "@/components/NewsletterSignup";

// ISR: PriceHistory gains one snapshot a WEEK (HISTORY_MIN_INTERVAL_DAYS), and
// the price-refresh workflow purges this path after every import, so a 24-hour
// window keeps the page fresh without recomputing the aggregation per request.
//
// No inner unstable_cache may declare a shorter TTL than this — see the note on
// getPriceMovers below. One used to say 600, which quietly made this page
// regenerate 144× a day instead of once, defeating the sentence above.
export const revalidate = 86400;

// Market-neutral metadata (no country in the title) so the page can rank globally;
// the body is the AU-baseline market the cached page is built from.
export const metadata: Metadata = {
  title: { absolute: "Riftbound Price Movers — Top Risers & Drops | RiftCompare" },
  description:
    "This week's biggest Riftbound card price movers — top risers, biggest drops and best-value deals — plus the cards most searched this week. Updated weekly.",
  keywords: [
    "Riftbound price movers",
    "Riftbound card prices going up",
    "Riftbound price drops",
    "Riftbound best deals",
    "Riftbound cards spiking",
    "Riftbound trending cards",
  ],
  alternates: pageAlternates("/movers"),
  openGraph: {
    title: "Riftbound Price Movers — Top Risers & Drops",
    description:
      "This week's biggest Riftbound card price movers — top risers, biggest drops and best-value deals — plus the cards most searched this week. Updated weekly.",
    url: `${SITE_URL}/movers`,
  },
};

// The free top 10 most searched this week. Demand Finder (/tools/demand,
// Premium) shows anyone below Premium exactly these rows and no more — one
// constant for both (lib/demand.ts FREE_DEMAND_ROWS).
const MOST_SEARCHED_ROWS = FREE_DEMAND_ROWS;

// What every figure on this page is. Not a market's own store prices: the
// weekly PriceHistory snapshot is the cheapest price found across AU, US, UK and
// SG that week, converted — so it says so, everywhere the page describes it.
const PRICE_BASIS = "the cheapest tracked price across AU/US/UK/SG, converted";

export default async function MoversPage() {
  // DEFAULT_COUNTRY baseline, no cookie read: a getCountry() call would force this
  // route dynamic and kill the revalidate above, so the page is genuinely static.
  const country = DEFAULT_COUNTRY;
  const info = COUNTRIES[country];

  // Deeper list than the homepage teaser. getPriceMovers caches ITSELF — one
  // week-keyed entry per market, shared with the homepage, /games and the
  // digests — so it is called directly here.
  //
  // It used to be wrapped in a second unstable_cache on this page. Two things
  // were wrong with that, one known and one not:
  //   • TTL. That wrapper once said 600, and an inner TTL is not private: Next
  //     sets `store.revalidate = options.revalidate` unless the store's is
  //     already smaller, so the SHORTEST inner TTL becomes the whole SEGMENT's.
  //     600 on an 86400 page re-ran the aggregation, and every uncached query
  //     beside it, 144× a day. Same mechanism that cost ~2 GB/day via
  //     EbayCardPanel on /card/[id] until 2026-08-14 (egress rules, lib/db.ts).
  //   • NESTING. Even at 86400 the wrapper was worse than nothing: Next.js 14.2
  //     bypasses a cache invoked from inside another unstable_cache callback,
  //     so getPriceMovers' own weekly entry was never read from here — the
  //     whole-market history scan re-ran on every regeneration of this page
  //     (egress rule #6 in lib/db.ts; tests/nested-cache.test.ts).
  //
  // getPriceMovers' own TTL (8 days) is longer than this page's, so it cannot
  // undercut the segment. Freshness comes from the price importer POSTing
  // /api/revalidate at the end of every run, which purges this path outright.
  //
  // Every row it computed (MOVERS_MAX, 50 per list), not a 20-row slice: the
  // aggregation is the same either way, and this is the page for the whole list.
  //
  // getTopDemand (the "Most searched this week" strip) is the same kind of
  // loader — self-cached, day-keyed, 172800s TTL, so it cannot undercut this
  // page's revalidate either — and is called here, at the top level, for the
  // same reason: never from inside another cache (tests/movers-most-searched.test.ts).
  const [movers, demand] = await Promise.all([getPriceMovers(country, 50), getTopDemand(7, MOST_SEARCHED_ROWS)]);
  const mostSearched = demand.windowUsable ? demand.bySearch.map((p) => ({ card: p.card, searches: p.searches })) : [];
  const pricingBreak = recentMethodologyBreak();

  const hasAny = movers.spiking.length || movers.plummeting.length || movers.value.length;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Price Movers", item: `${SITE_URL}/movers` },
    ],
  };
  // ItemList of the cards actually rendered (risers → drops → value), deduplicated
  // so a card appearing in two lists is listed once, ranked positionally.
  const renderedCards = [...movers.spiking, ...movers.plummeting, ...movers.value].map((m) => m.card);
  const seenIds = new Set<string>();
  const uniqueCards = renderedCards.filter((c) => (seenIds.has(c.id) ? false : (seenIds.add(c.id), true)));
  const FAQS = [
    {
      q: "Which Riftbound cards are going up in price right now?",
      a: `The risers list above is the answer, refreshed weekly: it ranks Riftbound singles by how much ${PRICE_BASIS} to ${info.currency}, has moved over roughly the last seven days.`,
    },
    {
      q: "How often are Riftbound price movers updated?",
      a: "Weekly. RiftCompare records one price for every tracked card each week — the cheapest across the stores it tracks in Australia, the US, the UK and Singapore, converted to one currency — so a move shows up after the next weekly snapshot.",
    },
    {
      q: "How does RiftCompare calculate a price move?",
      a: "Each card's latest weekly price is compared with its price about seven days earlier. Cards below a minimum value are excluded so a few cents on a bulk common can't top the list, and extreme outliers are filtered out. Prices are only compared on one pricing basis: when the way a price is sourced changes, as it did on 23 September 2026 when the US TCGplayer price moved from market price to the cheapest English listing, a card sits out until it has two weekly prices on the new basis.",
    },
    {
      q: "What does 'best value' mean on this page?",
      a: "The best-value list compares a card's current price against its recent high rather than against last week — so it surfaces cards that are cheap relative to where they have actually traded, not just cards that fell today.",
    },
    {
      q: "Should I buy a card that is spiking?",
      a: "Usually not immediately. A spike often reflects a single tournament result and settles once the meta adjusts. Check whether the demand looks durable, and set a price alert at the number you would actually pay rather than chasing.",
    },
  ];

  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Riftbound Price Movers",
    url: `${SITE_URL}/movers`,
    description: "This week's biggest Riftbound card price movers — risers, drops and best-value buys — and the most searched cards.",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    ...(uniqueCards.length > 0
      ? {
          mainEntity: {
            "@type": "ItemList",
            itemListElement: uniqueCards.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: c.name,
              url: `${SITE_URL}/card/${c.slug ?? c.id}`,
            })),
          },
        }
      : {}),
  };

  const liveSets = SETS.filter((s) => !s.comingSoon);

  return (
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumb, collection, faqPage(FAQS)].filter(Boolean)) }}
      />

      {/* Breadcrumb + hero */}
      <div>
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Price Movers</span>
        </nav>
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
          Riftbound price movers — this week
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          The Riftbound cards moving the most this week: which singles are{" "}
          <strong className="text-slate-200">spiking</strong>, which are seeing the{" "}
          <strong className="text-slate-200">biggest drops</strong>, and where the{" "}
          <strong className="text-slate-200">best value</strong> is off a card&apos;s recent high. Every
          figure is {PRICE_BASIS} to {info.currency}, updated weekly. Tap any card for its full
          price-history chart
          {mostSearched.length > 0 ? (
            <>
              , or see <a href="#most-searched" className="text-brand-400 hover:underline">what people are searching for</a>
            </>
          ) : null}
          .
        </p>
        <AnswerBox className="mt-4">
          <p>
            Riftbound price movers are the cards whose price has changed most in the past week. This page ranks them
            weekly in three lists — biggest risers, biggest drops, and best value against a card&apos;s recent high —
            using {PRICE_BASIS} to {info.currency}.
          </p>
        </AnswerBox>
      </div>

      {pricingBreak && (
        <p className="-mt-4 max-w-3xl rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-xs leading-relaxed text-slate-400">
          <strong className="text-slate-200">Fewer movers than usual for a couple of weeks.</strong> On{" "}
          {new Date(pricingBreak.from).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })} the US
          TCGplayer price we track changed from TCGplayer&apos;s market price to the cheapest English listing. A change
          across that date would measure the switch, not the market, so each card rejoins these lists once it has two weekly
          prices on the new basis.
        </p>
      )}

      {hasAny ? (
        <>
          <PriceWatch movers={movers} currency={info.currency} place={info.place} showHeader={false} />

          <MostSearchedStrip rows={mostSearched} coveredDays={demand.coveredDays} />

          {/* Turn habitual price-checkers into the Premium funnel (client island → the
              page stays static). */}
          <MoversToolsCta />

          {/* Owned-channel capture: the page people revisit ~5×/week never offered to
              email them. Now it does. */}
          <NewsletterSignup
            siteName={SITE_NAME}
            source="movers"
            variant="card"
            heading="🔔 Get the week's biggest movers in your inbox"
            cta="Email me the movers"
            done="✓ Done — you'll get the movers digest each week."
          />
        </>
      ) : (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">No notable movers yet</p>
            <p className="mt-1 text-sm">
              A move needs two weekly prices on the same basis. Check back after the next weekly update, or
              browse the full database in the meantime.
            </p>
            <Link href="/browse" className="btn-primary mt-4">Card database</Link>
          </div>
        </div>
      )}

      {/* With no movers the strip still shows — it is its own data, and old
          links to #most-searched land on it. */}
      {!hasAny && <MostSearchedStrip rows={mostSearched} coveredDays={demand.coveredDays} />}

      {/* Internal links (crawl + discovery) */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-white">Browse Riftbound prices by set</h2>
        <div className="flex flex-wrap gap-2">
          {liveSets.map((s) => (
            <Link
              key={s.slug}
              href={`/sets/${s.slug}`}
              className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600"
            >
              {s.name}
            </Link>
          ))}
          <Link href="/market" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">
            RiftCompare Index →
          </Link>
          <Link href="/browse" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">
            All cards →
          </Link>
          <Link href="/sealed" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-600">
            Sealed products →
          </Link>
        </div>
      </section>

      <AdSlot height={100} />

      <HubFaq faqs={FAQS} className="" />

      {/* Keyword-relevant copy for search */}
      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">How RiftCompare tracks price movers</h2>
        <div className="mt-2 max-w-3xl space-y-3 text-sm leading-relaxed text-slate-400">
          <p>
            Once a week, RiftCompare records one price for every Riftbound card: {PRICE_BASIS} to{" "}
            {info.currency}. The movers above compare each card&apos;s latest weekly price against its price
            about seven days earlier to surface the biggest <strong className="text-slate-200">risers</strong> and{" "}
            <strong className="text-slate-200">fallers</strong> of the week, and against its recent high to
            highlight the <strong className="text-slate-200">best-value</strong> buys.
          </p>
          <p>
            It&apos;s the quickest way to see which Riftbound singles are heating up, which have cooled off,
            and which cards players are looking up most. Click any card to compare every store&apos;s live
            price in your market, ranked by total delivered cost, and to see its full price-history chart.
          </p>
        </div>
      </section>
    </div>
  );
}
