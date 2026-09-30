import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { STATIC_PAGE_DATES, staticPageDateLabel } from "@/lib/static-page-dates";
import { USD_TO } from "@/lib/fx";
import { EUR_TO_GBP } from "@/lib/cardmarket";
import { COUNTRIES, COUNTRY_LIST } from "@/lib/country";
import { RETAILER_LIST } from "@/lib/retailers";
import { SHIPPING_SNAPSHOT } from "@/lib/shipping";
import { PACK_SOURCE } from "@/lib/pack-composition";
import { pageAlternates } from "@/lib/seo";
import { guidesForTool } from "@/lib/content/tool-guides";
import { RelatedGuides } from "@/components/RelatedGuides";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Methodology — how our prices, postage and tools work",
  description:
    "Where RiftCompare's Riftbound prices come from, how listings are matched and graded, how currency and postage are handled, how a comparison is ordered, and how Deal Finder, Rising Cards, the Index, Best Basket, Box EV and Demand Finder calculate.",
  alternates: pageAlternates("/methodology"),
};

// ─────────────────────────────────────────────────────────────────────────────
// The one page that explains HOW the numbers are made — sources, matching,
// conditions, currency, postage, ordering, history, and each tool's formula.
// Refresh cadence and how the site is paid stay on /editorial-policy; this page
// links there rather than repeating it.
//
// Every figure below is read from, or pinned to, the code that produces it
// (tests/trust-pages.test.ts): the store count and measured-postage count from
// RETAILER_LIST and the checked-in postage snapshot, the FX table from USD_TO,
// the probe's addresses from the snapshot itself, and each threshold typed here
// is asserted against its constant in lib/arbitrage.ts, lib/market-index.ts,
// lib/rise-predictor.ts, app/market/records and lib/price-history.ts. Extended
// from a condition-and-FX page to the tool explanations on 2026-09-26 ("Blog and
// tools, joined up" in DECISIONS.md). Card.marketPriceCents is synthetic and is
// never cited here.
export default function MethodologyPage() {
  const storeCount = RETAILER_LIST.length;
  const measuredStores = RETAILER_LIST.filter((r) => SHIPPING_SNAPSHOT.stores[r.key]?.status === "measured").length;
  // The probe's own addresses, market by market, from the snapshot it wrote.
  const probeAddresses = COUNTRY_LIST.flatMap((c) => {
    const m = SHIPPING_SNAPSHOT.markets[c.code];
    return m ? [{ market: c.label, places: m.addresses.map((a) => a.label).join(", ") }] : [];
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Methodology",
    url: `${SITE_URL}/methodology`,
    dateModified: STATIC_PAGE_DATES["/methodology"],
    publisher: { "@id": `${SITE_URL}/#org` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Methodology", item: `${SITE_URL}/methodology` },
      ],
    },
  };

  const conditionRows: [source: string, native: string, normalised: string, how: string][] = [
    ["Independent stores", "The store's own variant title, verbatim — e.g. \"Near Mint\", \"NM\", \"Lightly Played\", or \"Default Title\" when the store sells only one condition", "Matched by wording (Near Mint → NM, Lightly Played → LP, etc.); a title with no condition wording is left unlabelled rather than guessed", "Read from the store's own product listing"],
    ["eBay", "eBay's own raw-card condition scale: \"Near Mint or Better\", \"Excellent\", \"Very Good\", \"Poor\"", "Mapped by relative rank onto our scale — Near Mint or Better → NM, Excellent → LP, Very Good → MP, Poor → HP", "Read from eBay's Browse API for each listing"],
    ["TCGplayer (US listing)", "Near Mint only", "NM", "The cheapest in-stock English Near Mint copy of the matching printing, with that seller's own shipping — an ordinary row in the US comparison"],
    ["CardTrader (EU)", "\"Near Mint\" or \"Slightly Played\"", "NM or LP", "The cheapest English, ungraded, in-stock copy from a seller in the EU (or Switzerland, Norway or Iceland); anything below Slightly Played is not recorded"],
    ["TCGplayer market price", "Shown as \"NM\"", "A labelled reference, never a comparison row", "TCGplayer's own market-price aggregate for the card, not one seller's copy — see reference prices below"],
    ["Cardmarket", "Shown as \"NM\"", "A labelled reference, never a comparison row", "The \"low\" figure from Cardmarket's public price guide: a marketplace-wide low, not one graded listing"],
  ];

  const sections: [id: string, label: string][] = [
    ["sources", "Sources"],
    ["matching", "Matching"],
    ["conditions", "Conditions"],
    ["references", "Reference prices"],
    ["currency", "Currency"],
    ["postage", "Postage"],
    ["ordering", "Ordering"],
    ["history", "Price history"],
    ["tools", "The tools"],
  ];

  return (
    <article className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-400">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-white">Home</Link></li>
          <li className="text-ink-700">/</li>
          <li className="text-slate-300" aria-current="page">Methodology</li>
        </ol>
      </nav>

      <h1 className="text-3xl font-extrabold leading-tight text-white">Methodology</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {staticPageDateLabel("/methodology")}</p>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
        How the numbers on {SITE_NAME} are made: where each price comes from, how a listing is tied to
        the right card and condition, when a figure is converted between currencies, how postage is
        worked out, what order a comparison is in, and what each tool calculates. How often each source
        refreshes, and how the site is paid, are on our{" "}
        <Link href="/editorial-policy" className="text-brand-400 hover:underline">editorial &amp; pricing policy</Link>;
        the full list of stores, market by market, is on{" "}
        <Link href="/stores/tracked" className="text-brand-400 hover:underline">stores we track</Link>.
      </p>
      <nav aria-label="On this page" className="mt-4">
        <ul className="flex flex-wrap gap-x-4 text-sm">
          {sections.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="tap-link text-brand-400 hover:underline">{label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-8 space-y-8 border-t border-ink-800 pt-8 text-sm leading-relaxed text-slate-300">
        <section id="sources" className="scroll-mt-header space-y-3">
          <h2 className="text-lg font-bold text-white">Where our data comes from</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white">Independent stores</strong> — the public product catalogue of each
              of the {storeCount} stores we track, the same feed its own storefront publishes, requested with
              the store&rsquo;s market selected so the price is the one a local buyer is charged. Our importer
              honours each store&rsquo;s robots.txt.
            </li>
            <li>
              <strong className="text-white">eBay</strong> — eBay&rsquo;s official Browse API, searched on each
              market&rsquo;s own eBay site.
            </li>
            <li>
              <strong className="text-white">TCGplayer</strong> — TCGplayer&rsquo;s public product search, the
              one its own website uses: the listings behind the US comparison row, and TCGplayer&rsquo;s market
              price for the reference figures.
            </li>
            <li>
              <strong className="text-white">CardTrader</strong> — CardTrader&rsquo;s documented API, for the
              EU marketplace listings in the EU comparison.
            </li>
            <li>
              <strong className="text-white">Cardmarket</strong> — Cardmarket&rsquo;s public price-guide and
              product-catalogue files, used with Cardmarket&rsquo;s written permission, and only as a
              reference figure for the UK and the EU.
            </li>
            <li>
              <strong className="text-white">The cards themselves</strong> — names, types, domains, rarities
              and rules text from Riot Games&rsquo; official card gallery at playriftbound.com and, for the
              earlier sets, the RiftScribe community card database. Card art is Riot Games&rsquo; own, used
              under Riot&rsquo;s &ldquo;Legal Jibber Jabber&rdquo; fan-content policy and served from our
              own copy.
            </li>
            <li>
              <strong className="text-white">Pull rates</strong> — Riot&rsquo;s published pack structure,{" "}
              <a href={PACK_SOURCE.url} className="text-brand-400 hover:underline" target="_blank" rel="noopener noreferrer">
                &ldquo;{PACK_SOURCE.title}&rdquo;
              </a>
              , for Box EV and the pack simulator.
            </li>
            <li>
              <strong className="text-white">Demand</strong> — our own anonymous counts of which cards
              visitors search for and open (see Demand Finder below).
            </li>
          </ul>
          <p>
            Every price in a comparison is the asking price of a copy that was for sale when we read it;
            the reference figures are the marketplaces&rsquo; own aggregates. We don&rsquo;t record what
            individual copies sold for, and nothing on the site forecasts a price.
          </p>
        </section>

        <section id="matching" className="scroll-mt-header space-y-3">
          <h2 className="text-lg font-bold text-white">Matching a listing to a card</h2>
          <p>
            A listing is tied to one printing by its set and collector number, not by the card&rsquo;s name
            alone, so a promo, an alternate art and a Signature print of the same card stay three products
            with three prices. Listings for a non-English printing are dropped rather than priced as the
            English card. When a store offers one card in several conditions we record its best-condition
            copy, then the cheapest at that condition, together with the wording the store used. A
            store&rsquo;s prices are refused if they arrive in a different currency from its market&rsquo;s,
            so a storefront that quietly serves the wrong currency cannot publish a wrong price.
          </p>
        </section>

        <section id="conditions" className="scroll-mt-header space-y-3">
          <h2 className="text-lg font-bold text-white">Condition grading</h2>
          <p>
            There is no official cross-marketplace grading standard for trading cards. eBay, TCGplayer,
            CardTrader and Cardmarket each use their own vocabulary, and independent stores describe
            condition however their storefront lets them. We standardise every listing onto one five-grade
            scale — <strong className="text-white">NM, LP, MP, HP, DMG</strong> — but we never discard
            the source&rsquo;s own wording: every price row on a card page shows our normalised grade
            next to (or hoverable to reveal) exactly what the store or marketplace actually said, so
            you can see the translation rather than trust it blindly.
          </p>
          <div className="card-surface mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-800 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-3">Source</th>
                  <th scope="col" className="px-4 py-3">Native grade</th>
                  <th scope="col" className="px-4 py-3">Normalised to</th>
                  <th scope="col" className="px-4 py-3">How it&rsquo;s obtained</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {conditionRows.map(([source, native, normalised, how]) => (
                  <tr key={source}>
                    <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-300 align-top">{source}</th>
                    <td className="px-4 py-3 text-white align-top">{native}</td>
                    <td className="px-4 py-3 text-white align-top">{normalised}</td>
                    <td className="px-4 py-3 text-slate-400 align-top">{how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            When a listing&rsquo;s condition text doesn&rsquo;t match any known pattern, we show it
            unclassified rather than guess — a wrong condition claim is worse than an unlabelled one. Our{" "}
            <Link href="/guides/riftbound-card-condition-guide" className="text-brand-400 hover:underline">condition guide</Link>{" "}
            explains what each grade means for the copy you receive.
          </p>
        </section>

        {/* Rewritten 2026-09-26: since 2026-09-23 the US "tcgplayer" row is a
            buyable listing (lib/tcgplayer.ts) and the market price moved to the
            reference-only tcgplayer_market key (constants.ts), so only the
            converted non-US TCGplayer figures and Cardmarket are references. */}
        <section id="references" className="scroll-mt-header space-y-3">
          <h2 className="text-lg font-bold text-white">TCGplayer and Cardmarket reference prices</h2>
          <p>
            In the US, TCGplayer is an ordinary row in the comparison: the cheapest in-stock English Near
            Mint copy of that printing, at that seller&rsquo;s price and shipping. Everywhere else, the
            TCGplayer figure is its US market price converted into your currency, and the Cardmarket figure
            is the low from its public price guide (converted to pounds for the UK). Neither is a local
            listing you can buy at that price — nobody sells as &ldquo;TCGplayer Australia&rdquo;, and the
            figure leaves out international postage and import charges — so both are shown below the
            comparison as clearly labelled reference prices and are never counted as a store, never set a
            card&rsquo;s cheapest price and never outrank a real local listing. In the UK and the EU the
            Cardmarket figure leads that reference block.
          </p>
        </section>

        {/* The old copy said we "never convert between currencies"; Canada's
            "eBay US" rows (price-import.ts) and the TCGplayer benchmark
            (lib/arbitrage.ts) both do. Every use is listed instead. */}
        <section id="currency" className="scroll-mt-header space-y-3">
          <h2 className="text-lg font-bold text-white">Currency conversion</h2>
          <p>
            A store comparison is priced in its market&rsquo;s own currency, at the price the store itself
            charges. We convert between currencies only in these places:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-white">Canada&rsquo;s &ldquo;eBay US&rdquo; rows</strong> — eBay listings
              from the US, converted to Canadian dollars, with postage left unquoted because a Canadian buyer
              pays international postage the listing doesn&rsquo;t state.
            </li>
            <li>
              <strong className="text-white">TCGplayer&rsquo;s market price</strong> — converted into your
              currency for the reference block, the Deal Finder, the homepage&rsquo;s savings figures and Box
              EV.
            </li>
            <li>
              <strong className="text-white">Price history</strong> — recorded in US dollars and converted into
              your currency for every chart, the price movers and the RiftCompare Index (see below).
            </li>
            <li>
              <strong className="text-white">Cross-market price gaps</strong> — another market&rsquo;s price
              converted into yours so the two can be compared.
            </li>
            <li>
              <strong className="text-white">UK prices shown in euros</strong> — a visitor in the eurozone
              browsing UK stores can have them shown in EUR, with the pound price beside each one.
            </li>
            <li>
              <strong className="text-white">Cardmarket&rsquo;s UK reference</strong> — its euro low, converted to
              pounds at a fixed rate of {EUR_TO_GBP} (1 EUR = £{EUR_TO_GBP}) set in our Cardmarket import.
            </li>
          </ul>
          <p>
            All of them except Cardmarket&rsquo;s UK reference use one hand-maintained rate table, refreshed
            periodically rather than pulled from a live FX feed:
          </p>
          <div className="card-surface mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-ink-800">
                {Object.entries(USD_TO).map(([ccy, rate]) => (
                  <tr key={ccy}>
                    <th scope="row" className="w-1/2 px-4 py-3 text-left font-semibold text-slate-300">1 USD =</th>
                    <td className="px-4 py-3 text-white">{rate} {ccy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            These rates are indicative only. Real checkout is always billed in the store&rsquo;s own
            currency — any figure converted through this table is a reference, never a quote, and it
            leaves out whatever your card issuer charges to pay in another currency.
          </p>
        </section>

        {/* The measured-postage model (lib/shipping.ts, shipping-rates.json,
            scripts/probe-shipping-rates.ts), described nowhere public until
            2026-09-26. "Delivered cost is always shown" was false: store rows on
            card pages quote postage at checkout. */}
        <section id="postage" className="scroll-mt-header space-y-3">
          <h2 className="text-lg font-bold text-white">Postage and delivered totals</h2>
          <p>
            Most stores do not publish postage on a product page; they quote it at checkout. So a
            card&rsquo;s comparison shows a delivered total only where the listing carries its own postage —
            an eBay listing whose seller states it, and TCGplayer&rsquo;s US listing. Every other row says
            postage is added at checkout rather than treating it as free.
          </p>
          <p>
            Where a whole order is priced — <Link href="/tools/best-basket" className="text-brand-400 hover:underline">Best Basket</Link>,
            a portfolio&rsquo;s replacement cost and each store&rsquo;s own page — we use postage measured at
            the store&rsquo;s own checkout. A probe fills anonymous carts (one card, ten cards, and few-card
            carts worth about 20, 50, 100 and 150 in the local currency) and asks each checkout what it would
            charge to deliver them; it never places an order. {measuredStores} of our {storeCount} stores
            are measured. The addresses it asks about:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {probeAddresses.map((p) => (
              <li key={p.market}>
                <strong className="text-white">{p.market}</strong> — {p.places}
              </li>
            ))}
          </ul>
          <p>An order of any other size is priced from those measured carts, always leaning dearer:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>a cheap letter rate is offered only to orders no bigger, in value and card count, than the ones it was quoted for;</li>
            <li>free postage applies only from a threshold we actually saw a checkout apply, never from a store&rsquo;s advertised round number;</li>
            <li>if we don&rsquo;t know your region, the dearest region&rsquo;s rate is used and the quote says &ldquo;up to&rdquo;; an order bigger than anything measured is quoted &ldquo;from&rdquo;;</li>
            <li>a store we could not measure is charged at least its market&rsquo;s dearest measured one-card rate and labelled &ldquo;est.&rdquo;, so an estimate is never the reason a store looks cheapest;</li>
            <li>a store that doesn&rsquo;t post to you (pickup only, say) is left out of order planning, and the plan says why.</li>
          </ul>
          <p>
            The probe runs again every month, and its results are reviewed before the rates on the site
            change. Rates drift between runs, so the store&rsquo;s own checkout is always the final word.
          </p>
        </section>

        <section id="ordering" className="scroll-mt-header space-y-3">
          <h2 className="text-lg font-bold text-white">How a comparison is ordered</h2>
          <p>
            A card&rsquo;s store comparison lists the in-stock copies in your market cheapest first by item
            price, with the delivered total shown where the store publishes its postage. A store&rsquo;s known
            postage — when we know it — breaks ties between otherwise-equal prices, but it never demotes a
            store below a competitor just because that competitor&rsquo;s postage happens to be known upfront
            and theirs isn&rsquo;t. An eBay row sits at its own price position like any other row, its button
            in eBay&rsquo;s own colour with a &ldquo;Paid link&rdquo; tag; nothing is moved up or down for money.
            Reference prices are never in the list at all. See our{" "}
            <Link href="/editorial-policy" className="text-brand-400 hover:underline">editorial &amp; pricing policy</Link>{" "}
            for how we make money and why it never affects this order.
          </p>
        </section>

        {/* Weekly and GLOBAL since 2026-09-05 (price-import.ts snapshot write,
            HISTORY_MIN_INTERVAL_DAYS in lib/price-history.ts); the break list is
            lib/methodology-breaks.ts. Rising Cards reads across the break by the
            owner's call (lib/rise-predictor.ts, CURRENT-STATE). */}
        <section id="history" className="scroll-mt-header space-y-3">
          <h2 className="text-lg font-bold text-white">Price history and method changes</h2>
          <p>
            Once a week we record each card&rsquo;s cheapest price across the Australian, US, UK and Singapore
            markets, converted to US dollars. That single series is every card&rsquo;s price-history chart in
            every market, converted into your currency, and it is what the{" "}
            <Link href="/movers" className="text-brand-400 hover:underline">price movers</Link> and the Index
            compare week to week. It is a worldwide low, not your own market&rsquo;s history.
          </p>
          <p>
            When the way a price is sourced changes, the step it causes is not a market move. On 23 September
            2026 the US TCGplayer row switched from TCGplayer&rsquo;s market price to its cheapest English
            listing, which is usually lower. Weekly comparisons — movers, 7-day changes, the card-page
            narrative — never compare a point from before that switch with one after it, and the Index
            flattens the step. Rising Cards is an exception, by choice: it still reads across the switch,
            because dropping the older points would leave too few weeks to screen on, so a US-sourced card
            can show one step there. Until any card has a week on the new basis,{" "}
            <Link href="/movers" className="text-brand-400 hover:underline">price movers</Link> shows the last week
            before the switch instead, labelled with its date, so every price it compares is on the old basis.
          </p>
        </section>

        <section id="tools" className="scroll-mt-header space-y-6">
          <h2 className="text-lg font-bold text-white">How each tool works</h2>

          <div id="deal-finder" className="scroll-mt-header space-y-2">
            <h3 className="font-bold text-white">Deal Finder: Underpriced vs TCGplayer</h3>
            <p>
              <Link href="/tools/deal-finder" className="text-brand-400 hover:underline">Deal Finder</Link>{" "}
              lists cards you can buy in your market for less than TCGplayer&rsquo;s US market price, converted
              into your currency. For each card it takes the cheapest price on the buy side you choose — by
              default every store we track in your market plus eBay (in Canada, whose eBay rows are US
              listings with unquoted postage, eBay is off by default). An eBay price includes the postage the
              seller states, or is marked &ldquo;+ postage&rdquo; when the seller states none.
            </p>
            <p>
              <strong className="text-white">% below = (market price − your price) ÷ market price</strong>, to
              one decimal place. A card is listed only if your price is at least 3.00 in your currency and at
              least 1.00 below the market price; anything more than 75% below is dropped as a probable
              mismatch between two different products rather than a real bargain. In the US a card is also
              dropped when TCGplayer&rsquo;s own cheapest listing is no dearer, since that is not a saving. The
              list is ordered by the amount below market, or by the percentage if you choose.
            </p>
          </div>

          <div id="cheapest-on-ebay" className="scroll-mt-header space-y-2">
            <h3 className="font-bold text-white">Deal Finder: Cheapest on eBay</h3>
            <p>
              Deal Finder&rsquo;s free second tab. A card appears there only when its cheapest eBay listing costs less than every source the
              card&rsquo;s own page compares: the stores we track in your market, CardTrader in the EU, and
              TCGplayer&rsquo;s cheapest listing in the US. The eBay figure includes the seller&rsquo;s stated
              postage where there is one, and says so. It must be at least 1.00, at least 0.50 cheaper than
              the cheapest of those sources, and less than 80% cheaper — a copy at a fifth of every
              store&rsquo;s price is almost always a mismatched listing. Cards are ordered by the money saved.
              Canada is left out,
              because its eBay rows carry international postage nobody has quoted.
            </p>
          </div>

          <div id="underpriced-vs-ebay" className="scroll-mt-header space-y-2">
            <h3 className="font-bold text-white">Deal Finder: Underpriced vs eBay</h3>
            <p>
              The mirror of Cheapest on eBay, from the same prices: a card appears when the cheapest in-stock price
              at a store we track in your market (and CardTrader in the EU) is lower than the cheapest in-stock
              eBay listing there. The eBay figure is that listing&rsquo;s asking price, not a sale, with the
              seller&rsquo;s stated postage where there is one; the store figure is the item price, postage extra,
              so the real gap is smaller by the store&rsquo;s postage.{" "}
              <strong className="text-white">% below = (eBay price − store price) ÷ eBay price</strong>. The store
              price must be at least 1.00, at least 0.50 below eBay, and less than 80% below it — a store at a
              fifth of the cheapest eBay copy almost always means that listing is a different product, such as a
              graded card. Equal prices are not listed. Ordered by the amount below eBay, or by the percentage.
              Canada is left out for the same reason as above.
            </p>
          </div>

          <div id="price-gaps" className="scroll-mt-header space-y-2">
            <h3 className="font-bold text-white">Cross-market price gaps</h3>
            <p>
              The gaps board on{" "}
              <Link href="/market/records" className="text-brand-400 hover:underline">market records</Link>{" "}
              compares each card&rsquo;s cheapest in-stock price in your market with every other market&rsquo;s,
              converted into your currency at the rates above. A card qualifies when another market is at
              least 20% cheaper and your own price is at least 3.00; the board shows the ten biggest gaps in
              money, and only those worth at least 5.00. Promos and alternate-art printings are left out. It
              is a price gap, not a saving: international postage, import charges and whether the other
              market&rsquo;s stores ship to you are not included, and on a cheap card they usually cancel it.
            </p>
          </div>

          <div id="rising-cards" className="scroll-mt-header space-y-2">
            <h3 className="font-bold text-white">Rising Cards</h3>
            <p>
              <Link href="/tools/rising" className="text-brand-400 hover:underline">Rising Cards</Link> is a
              screen, not a prediction. It takes up to the 400 most-searched cards with a price in the market
              you pick and scores each against the others on six signals: how often it is searched, how fast
              those searches are rising, how close its price sits to the low of its own recent range, how
              thinly it is stocked, whether its price has started moving week on week, and how much it
              usually moves. A card already up more than 35% on last week is marked down. The weights are
              fixed, and the score shown is the card&rsquo;s percentile among the cards screened. The price
              signals need five weekly points; until a card has them it is scored on searches and stock
              alone, and says so. No track record is published, and prices fall as readily as they rise.
            </p>
          </div>

          <div id="index" className="scroll-mt-header space-y-2">
            <h3 className="font-bold text-white">The RiftCompare Index</h3>
            <p>
              <Link href="/market" className="text-brand-400 hover:underline">The Index</Link> follows the 200
              most-searched cards that have a price in the selected market, each weighted by its searches and
              capped at 20% so no single card can be the Index. It moves once a week, when a new price
              snapshot is recorded: each week&rsquo;s change is worked out only from cards priced in both
              weeks and chained onto the level, which started at 100. The full worked method is in{" "}
              <Link href="/guides/understanding-the-riftcompare-index-methodology" className="text-brand-400 hover:underline">
                our guide to the Index methodology
              </Link>
              .
            </p>
          </div>

          <div id="best-basket" className="scroll-mt-header space-y-2">
            <h3 className="font-bold text-white">Best Basket</h3>
            <p>
              <Link href="/tools/best-basket" className="text-brand-400 hover:underline">Best Basket</Link> is
              the one tool that prices whole orders with measured postage. Given a list, it looks for the
              split across the stores we track in your market with the lowest total including each
              store&rsquo;s postage for your region — often fewer stores than buying every card at its
              cheapest, because each extra store adds its own postage. The search tries adding, dropping and
              swapping stores from several starting points; the plan it returns is never dearer than buying
              each card at its cheapest store or the best single-store order. It does not include eBay or
              marketplaces. A worked example is in{" "}
              <Link href="/guides/best-basket-cheapest-riftbound-deck" className="text-brand-400 hover:underline">
                our Best Basket guide
              </Link>
              .
            </p>
          </div>

          <div id="box-ev" className="scroll-mt-header space-y-2">
            <h3 className="font-bold text-white">Box EV</h3>
            <p>
              <Link href="/tools/box-ev" className="text-brand-400 hover:underline">Box EV</Link> multiplies how
              many cards of each rarity a pack holds, from Riot&rsquo;s published pack structure, by the average
              TCGplayer US market price of every card in that rarity — Signature, overnumbered and alternate-art
              printings as their own pools at their own rates — then by the packs in a box. Cards with no market
              price count as worth nothing rather than being skipped. It compares the result with the cheapest
              in-stock booster box in your market, or a price you type. A converted US market price is a
              consistent yardstick, not local retail, and the average says nothing about the box you open. Our{" "}
              <Link href="/guides/riftbound-booster-box-ev-worth-ripping-or-buying-singles" className="text-brand-400 hover:underline">
                box EV guide
              </Link>{" "}
              covers what it can and cannot tell you.
            </p>
          </div>

          <div id="demand-finder" className="scroll-mt-header space-y-2">
            <h3 className="font-bold text-white">Demand Finder</h3>
            <p>
              <Link href="/tools/demand" className="text-brand-400 hover:underline">Demand Finder</Link> is a
              plain count, with nothing blended in. A search is a card picked from the search box; a view is a
              card opened, either its card page or its quick view. Each browser counts a card once a day, bots are not counted, and the server
              limits how often one address can count the same card. Counts are worldwide, and a 7- or 30-day
              window is the activity since a daily snapshot taken that many days ago.
            </p>
          </div>
        </section>
      </div>

      {/* After the page's own content, per RelatedGuides' placement rule. */}
      <RelatedGuides guides={guidesForTool("/methodology")} />
    </article>
  );
}
