import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL, TIER_NAMES } from "@/lib/site";
import { STATIC_PAGE_DATES } from "@/lib/static-page-dates";
import { RETAILER_LIST, retailerCountry } from "@/lib/retailers";
import { COUNTRY_LIST } from "@/lib/country";
import { pageAlternates } from "@/lib/seo";
import { HowItWorks } from "@/components/home/HowItWorks";

// This page had no DB read at all before HowItWorks (below) needed a live
// card count for its subhead — a daily revalidation window is plenty fresh
// for a number that only grows by a set's worth of cards every few weeks,
// same convention /sets already uses for its own per-set counts.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "About RiftCompare",
  description:
    "RiftCompare is an independent price-comparison and database for Riftbound: League of Legends TCG — how it started, how it works, and who's behind it.",
  alternates: pageAlternates("/about"),
};

// The founder facts are the owner's own (2026-09-26, "Blog and tools, joined
// up" in DECISIONS.md): one person, Bill, builds and runs the site. Nothing is
// added about him beyond what the repo shows — no surname, photo, location or
// credentials — the same rule authors.ts states for bylines.
const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "About", item: `${SITE_URL}/about` },
  ],
};
const aboutLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: `About ${SITE_NAME}`,
  url: `${SITE_URL}/about`,
  description:
    "How RiftCompare sources Riftbound: League of Legends TCG prices, the stores and markets it covers, how it earns money, and who's behind it.",
  dateModified: STATIC_PAGE_DATES["/about"],
  // The site-wide Organization node (layout.tsx), extended here with its
  // founder — the same Person node, by @id, that authorJsonLd() puts on the
  // articles under his byline (lib/content/authors.ts).
  mainEntity: {
    "@type": "Organization",
    "@id": `${SITE_URL}/#org`,
    name: SITE_NAME,
    url: SITE_URL,
    founder: { "@type": "Person", "@id": `${SITE_URL}/authors/bill#author`, name: "Bill", url: `${SITE_URL}/authors/bill` },
  },
  publisher: { "@id": `${SITE_URL}/#org` },
};

export default async function AboutPage() {
  const totalCards = await prisma.card.count();
  // Counted from the store list the importer reads, never typed: it changes
  // whenever a store is added or retired.
  const storeCount = RETAILER_LIST.length;
  const storesByMarket = COUNTRY_LIST.map((c) => ({
    place: c.place,
    count: RETAILER_LIST.filter((r) => retailerCountry(r.key) === c.code).length,
  })).filter((m) => m.count > 0);

  return (
    <article className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, aboutLd]) }}
      />
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <span className="text-slate-300">About</span>
      </nav>
      <h1 className="text-3xl font-extrabold leading-tight text-white">About {SITE_NAME}</h1>
      <p className="mt-2 text-sm text-slate-500">An independent project for Riftbound players, built and run by one person.</p>

      <div className="mt-6 space-y-6 border-t border-ink-800 pt-6 text-sm leading-relaxed text-slate-300">
        {/* "dozens of stores", "live prices" and "no account required" were
            all out of date: the count is RETAILER_LIST's, prices are snapshots
            from two imports a day, and Deal Finder / Rising Cards need an
            account (CURRENT-STATE, "Signed-out visitors get nothing"). */}
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">What RiftCompare is</h2>
          <p>
            {SITE_NAME} is a price-comparison site and card database for{" "}
            <strong className="text-white">Riftbound: League of Legends TCG</strong>. It records Riftbound
            card prices from {storeCount} stores across Australia, the United States, the United Kingdom,
            Singapore, Canada and the EU, plus eBay, TCGplayer in the US and CardTrader in the EU, and shows
            you the cheapest place to buy each card in your market — alongside price history, set
            checklists, sealed-product prices, deck pricing and more. Prices are recorded twice a day, so
            the store&rsquo;s own checkout always has the final word.
          </p>
          <p>
            The price comparison, the card database, price history, the RiftCompare Index and email price
            alerts are free and need no account. A free account adds a watchlist, a collection portfolio and
            the top three picks in Deal Finder and Rising Cards; the paid {TIER_NAMES.plus} and{" "}
            {TIER_NAMES.premium} plans unlock the full versions of those tools, as set out on the{" "}
            <Link href="/premium" className="text-brand-400 hover:underline">Premium page</Link>.
          </p>
        </section>

        {/* The homepage's old three-step "search → compare → buy" explainer,
            unchanged — moved here per the homepage-redesign brief (the
            homepage itself now proves the same point with a live example,
            ProofStrip, instead of describing it). This is the one place on
            the site that still spells the mechanic out for a first-time
            visitor who lands directly on /about rather than the homepage. */}
        <HowItWorks totalCards={totalCards} />

        <section id="who-runs-riftcompare" className="scroll-mt-header space-y-2">
          <h2 className="text-lg font-bold text-white">Who runs RiftCompare</h2>
          <p>
            {SITE_NAME} is built and run by one person: <strong className="text-white">Bill</strong>, its
            founder. There is no team behind the name and no separate support desk. Bill keeps the price
            imports running, looks after the tools, takes the store consulting sessions and reads what is
            sent to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>.
            Where this site says &ldquo;we&rdquo;, that is who it means.
          </p>
          <p>
            Articles are drafted with AI assistance, then edited and fact-checked by Bill before
            publishing; prices and figures come from RiftCompare&rsquo;s own price database, never from
            the draft. The guides under his own byline are listed on{" "}
            <Link href="/authors/bill" className="text-brand-400 hover:underline">his author page</Link>, and
            how every piece is produced and corrected is set out in our{" "}
            <Link href="/editorial-policy" className="text-brand-400 hover:underline">editorial policy</Link>.
          </p>
        </section>

        {/* Only what the code supports: retailers.ts still defaults a store to
            "AU" "for the original stores", and the launch post
            (/blog/welcome-to-riftcompareau) 301s here (next.config.js). The EU
            date is the launch post's (/blog/riftcompare-launches-in-the-eu). */}
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">How it started</h2>
          <p>
            Riftbound is a young game, and the same card can cost very different amounts from shop to shop,
            with stock and prices changing daily. Checking a dozen stores by hand is tedious, and an overseas
            store&rsquo;s price is easy to misread in the wrong currency. {SITE_NAME} was built to do that
            legwork, so players can spend less time hunting and more time playing.
          </p>
          <p>
            It began as a comparison of Australian stores. It has since added stores in the United States,
            the United Kingdom, Singapore and Canada, and on 24 August 2026 the EU, priced in euros. Today it
            tracks {storeCount} stores:{" "}
            {storesByMarket.map((m, i) => (
              <span key={m.place}>
                {m.count} in {m.place}
                {i < storesByMarket.length - 2 ? ", " : i === storesByMarket.length - 2 ? " and " : ""}
              </span>
            ))}
            . Each one is listed, market by market, on{" "}
            <Link href="/stores/tracked" className="text-brand-400 hover:underline">stores we track</Link>.
          </p>
        </section>

        {/* WHO THIS IS FOR — the stated position, added 2026-09-14 (see
            DECISIONS.md). The site previously had no written answer to "what is
            RiftCompare for?" beyond the sentence above, and the Premium pitch had
            drifted into selling an advantage over other buyers. This is the
            paragraph that reframe is anchored to, so the tone has somewhere to
            return to rather than drifting again. */}
        <section id="who-its-for" className="scroll-mt-header space-y-2">
          <h2 className="text-lg font-bold text-white">Who it&rsquo;s for</h2>
          <p>
            {SITE_NAME} is built for people who want to <strong className="text-slate-200">buy the cards
            they want without overpaying</strong> — a deck they&rsquo;re assembling, a want-list, a set
            they&rsquo;re completing. Every paid tool exists to answer a buying question: what is the
            cheapest way to get this whole list, and is today&rsquo;s price on it a good one.
          </p>
          <p>
            Some of those tools show demand and price-timing signals, and we publish them honestly —
            including where they are uncertain. But we don&rsquo;t market {SITE_NAME} as a way to profit
            at another player&rsquo;s expense, and we don&rsquo;t want to be the reason a card gets harder
            for someone to buy. Card prices fall as readily as they rise, and nothing here is investment
            advice. If you want to track Riftbound cards as an asset, that&rsquo;s what our sister site{" "}
            <a
              href="https://riftboundstocks.com"
              className="text-brand-400 hover:underline"
              target="_blank"
              rel="noopener"
            >
              RiftboundStocks.com
            </a>{" "}
            is for.
          </p>
        </section>

        {/* Twice a day and weekly, not "several times a day" and "daily
            snapshots": refresh-prices.yml runs at 07:00 and 19:00 UTC, and
            PriceHistory is one global point per card per week. */}
        <section id="methodology" className="scroll-mt-header space-y-2">
          <h2 className="text-lg font-bold text-white">How the prices work</h2>
          <p>
            Twice a day, at 07:00 and 19:00 UTC, we read the public product listings of every store we
            track, along with TCGplayer and CardTrader, match each listing to the exact card and printing,
            and record the cheapest in-stock price in each market. eBay is searched once a day: Australia
            and the US every day, and the UK, Singapore and the EU in turn (the full schedule is in our{" "}
            <Link href="/editorial-policy#refresh" className="text-brand-400 hover:underline">editorial policy</Link>
            ). A card&rsquo;s comparison lists
            the cheapest item price first, with the delivered total shown where the store publishes its
            postage. We always request each store&rsquo;s local price, in its market&rsquo;s currency.
          </p>
          <p>
            Every day we also record each card&rsquo;s cheapest price across the Australian, US, UK and
            Singapore markets, in US dollars. That daily series powers
            the <Link href="/movers" className="text-brand-400 hover:underline">price movers</Link>, the{" "}
            <Link href="/market" className="text-brand-400 hover:underline">RiftCompare Index</Link> and
            every card&rsquo;s price-history chart. Our{" "}
            <Link href="/methodology" className="text-brand-400 hover:underline">methodology page</Link>{" "}
            explains every source, how postage is worked out and how each of the{" "}
            <Link href="/tools" className="text-brand-400 hover:underline">tools</Link> calculates.
          </p>
        </section>

        {/* Every revenue source, including the ones the old "How we stay free"
            left out: subscriptions and paid store consulting. The "cheapest
            option comes first, full stop" sentence and the eBay one after it
            are pinned by tests/ebay-clicks-funnel.test.ts. */}
        <section id="how-it-earns" className="scroll-mt-header space-y-2">
          <h2 className="text-lg font-bold text-white">How RiftCompare earns money</h2>
          <p>
            {SITE_NAME} is paid for by display advertising from Google AdSense; by affiliate commissions from
            eBay (through the eBay Partner Network), TCGplayer (through Impact) and Amazon (as an Amazon
            Associate), which we may earn when you buy through one of our links, at no extra cost to you; by{" "}
            {TIER_NAMES.plus} and {TIER_NAMES.premium} subscriptions; and by paid one-to-one{" "}
            <Link href="/stores/consulting" className="text-brand-400 hover:underline">consulting sessions for stores</Link>.
          </p>
          <p>
            None of that money buys a position. It never changes the prices we show or the order of a
            price comparison: in every ranked list the cheapest option comes first,
            full stop. We also link to eBay outside those lists, always labelled. A store that books a
            consulting session is paying for advice, not placement, and it appears exactly where its prices
            put it. The details are in our{" "}
            <Link href="/editorial-policy#money" className="text-brand-400 hover:underline">editorial policy</Link>{" "}
            and our <Link href="/privacy" className="text-brand-400 hover:underline">privacy policy</Link>.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Read more</h2>
          <p>
            The <Link href="/guides" className="text-brand-400 hover:underline">guides</Link> cover buying,
            deck building and how the game&rsquo;s printings and rarities work; the{" "}
            <Link href="/blog" className="text-brand-400 hover:underline">blog</Link> carries news and market
            updates. For how the Index is built, start with{" "}
            <Link href="/guides/understanding-the-riftcompare-index-methodology" className="text-brand-400 hover:underline">
              our Index methodology guide
            </Link>
            ; for what Plus and Premium add, read{" "}
            <Link href="/blog/riftcompare-premium-explained" className="text-brand-400 hover:underline">
              Premium explained
            </Link>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Independent &amp; community-made</h2>
          <p>
            {SITE_NAME} is an independent project, not affiliated with or endorsed by Riot Games or any
            store we compare. Card names and artwork are the property of Riot Games and are used under
            Riot&rsquo;s &ldquo;Legal Jibber Jabber&rdquo; policy to identify the cards being priced. We also
            run a sister site,{" "}
            <a href="https://dexcompare.app" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">DexCompare</a>,
            for the Pokémon TCG.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Get in touch</h2>
          <p>
            Spotted a wrong price, want your store added, or have an idea? We genuinely want to hear it —
            email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>{" "}
            or use the <Link href="/contact" className="text-brand-400 hover:underline">contact page</Link>.
          </p>
        </section>
      </div>
    </article>
  );
}
