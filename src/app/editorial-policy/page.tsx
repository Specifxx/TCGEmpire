import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";
import { STATIC_PAGE_DATES, staticPageDateLabel } from "@/lib/static-page-dates";
import { RETAILER_LIST, STORE_ROWS_MAX_AGE_H } from "@/lib/retailers";
import { pageAlternates } from "@/lib/seo";

export const revalidate = 86400;


export const metadata: Metadata = {
  title: "Editorial & pricing policy",
  description:
    "Who writes RiftCompare and how, how we collect, refresh and check card prices, how we correct mistakes, how we make money and what none of it buys, and how to report an error.",
  alternates: pageAlternates("/editorial-policy"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Every claim on this page is checkable against the code:
//   • store count            → lib/retailers.ts (RETAILER_LIST)
//   • twice-daily import     → .github/workflows/refresh-prices.yml (07:00 + 19:00 UTC)
//   • eBay cadence           → lib/price-import.ts (EBAY_MIN_VALUE_USD_CENTS,
//                              EBAY_ALWAYS_MARKETS / EBAY_ROTATING_MARKETS, the
//                              20h/10h catalogue and chase gates, Canada's
//                              derived "eBay US" rows)
//   • weekly global history  → lib/price-history.ts (HISTORY_MIN_INTERVAL_DAYS)
//   • page cache windows     → `export const revalidate` on each route
//   • store checks           → lib/store-health.ts, STORE_ROWS_MAX_AGE_H,
//                              lib/offer-currency.ts, lib/sealed-offers.ts
//   • affiliate marking      → outboundRel() in lib/affiliate.ts
//   • what is generated      → lib/content/card-narrative.ts; the one request-
//                              time AI feature is /api/trade-roast
//   • consulting             → app/stores/consulting/page.tsx
// tests/trust-pages.test.ts pins the numbers typed below to those constants.
// The authorship statement is the owner's own wording (2026-09-26, "Blog and
// tools, joined up" in DECISIONS.md) and replaced "written by people".
// Nothing here describes a process we don't actually run.
export default function EditorialPolicyPage() {
  const storeCount = RETAILER_LIST.length;
  const staleDays = Math.round(STORE_ROWS_MAX_AGE_H / 24);

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
        <section id="authorship" className="scroll-mt-header space-y-3">
          <h2 className="text-lg font-bold text-white">Who writes the content, and how</h2>
          <p>
            {SITE_NAME} is built and run by one person, Bill, its founder (
            <Link href="/about#who-runs-riftcompare" className="text-brand-400 hover:underline">more about who runs the site</Link>
            ). Guides and posts are published under his own byline,{" "}
            <Link href="/authors/bill" className="text-brand-400 hover:underline">Bill</Link>, or the
            site&rsquo;s,{" "}
            <Link href="/authors/riftcompare-editorial" className="text-brand-400 hover:underline">RiftCompare</Link>.
          </p>
          <p>
            Articles are drafted with AI assistance, then edited and fact-checked by Bill before
            publishing; prices and figures come from RiftCompare&rsquo;s own price database, never from
            the draft.
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
            We are explicit about this because the distinction matters. Four different things
            appear on this site:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white">Prices and market data</strong> — collected
              automatically from public store listings and marketplace APIs, twice a day. No human
              writes these numbers.
            </li>
            <li>
              <strong className="text-white">Card page analysis</strong> — the &ldquo;About&rdquo;
              section on each card page is assembled programmatically from that card&rsquo;s own
              recorded data: its cross-market spread, its price trajectory, how many stores stock
              it, what its variants cost, where it sits in its set. It is generated by our own code,
              not an AI model, and every statement in it is derived from a figure we have actually
              recorded. Where the data doesn&rsquo;t support an observation, the observation is left
              out rather than guessed at.
            </li>
            <li>
              <strong className="text-white">Guides and posts</strong> — drafted with AI assistance,
              then edited and fact-checked by Bill, as above. The figures they quote are the ones our
              importer recorded.
            </li>
            {/* The only live model call a visitor can trigger: /api/trade-roast
                (lib/ai-insight.ts llmText). AiInsight exists but is rendered on
                no page. tests/ai-labelling.test.ts pins the on-page label. */}
            <li>
              <strong className="text-white">AI-written text while you browse</strong> — one feature
              only: the Trade Gremlin&rsquo;s joke verdict on the{" "}
              <Link href="/trade" className="text-brand-400 hover:underline">trade calculator</Link>,
              which is labelled as AI-generated where it appears. No price, card description or
              article is written by an AI model when you open a page.
            </li>
          </ul>
        </section>

        <section id="collection" className="scroll-mt-header space-y-3">
          <h2 className="text-lg font-bold text-white">How prices are collected</h2>
          <p>
            We track {storeCount} stores across Australia, the United States, the United Kingdom,
            Singapore, Canada and the EU, plus eBay in every market, TCGplayer&rsquo;s listings in the US
            and the CardTrader marketplace in the EU. Prices come from those stores&rsquo; own public
            product listings and from the marketplaces&rsquo; APIs; every source is listed on our{" "}
            <Link href="/methodology#sources" className="text-brand-400 hover:underline">methodology page</Link>.
            We do not accept price submissions from retailers, and no retailer can pay to appear, to
            rank higher, or to have a competitor removed.
          </p>
          <p>
            Each listing is matched to a specific printing — set code and collector number, not just
            a card name — so a promo, an alternate art and a Signature print are tracked as three
            separate products with three separate prices, because that is what they are.
          </p>
        </section>

        <section id="refresh" className="scroll-mt-header space-y-3">
          <h2 className="text-lg font-bold text-white">How often prices refresh</h2>
          <ul className="list-disc space-y-2 pl-5">
            {/* Rewritten 2026-09-26 from the importer itself. The old list said
                the whole catalogue was searched on eBay every 24 hours and that
                history kept a point per card per market per day; neither is what
                lib/price-import.ts does. */}
            <li>
              <strong className="text-white">Store prices and sealed products:</strong> a full import
              runs twice a day, at 07:00 and 19:00 UTC. TCGplayer, CardTrader and Cardmarket are read
              on the same runs.
            </li>
            <li>
              <strong className="text-white">eBay:</strong> once a day we search eBay for every card
              worth at least US$5 at TCGplayer&rsquo;s US market price, plus any card with no TCGplayer
              price yet (usually a new release); base-rarity commons and uncommons are skipped, not the
              whole catalogue searched. Australia and the US are searched every day; the UK, Singapore
              and the EU take turns, one a day, so each is refreshed about every three days. On the
              other daily run, the promo, Signature and overnumbered printings in that day&rsquo;s
              markets are searched again, so those refresh twice a day. Canada&rsquo;s eBay rows are the
              US results converted to Canadian dollars.
            </li>
            <li>
              <strong className="text-white">eBay auctions ending soon:</strong> every four hours.
            </li>
            <li>
              <strong className="text-white">Price history:</strong> once a week we record each
              card&rsquo;s cheapest price across the Australian, US, UK and Singapore markets, in US
              dollars. Every market&rsquo;s chart, the price movers and the RiftCompare Index read that
              one series, converted into the market&rsquo;s own currency — a worldwide low, not your
              market&rsquo;s own history.
            </li>
            <li>
              <strong className="text-white">Card pages:</strong> rebuilt after each import, and never
              cached for more than 24 hours.
            </li>
            <li><strong className="text-white">Homepage:</strong> at most an hour old.</li>
            <li>
              <strong className="text-white">RiftCompare Index:</strong> moves once a week, when a new
              history snapshot is recorded.
            </li>
          </ul>
          <p>
            Every price on the site is the last figure recorded by an import, not one fetched when
            you open the page. Stock sells and shops re-price between imports, so{" "}
            <strong className="text-white">always confirm the price on the retailer&rsquo;s own site
            before you buy</strong>. We say so in the footer of every page for the same reason.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">How prices are verified</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Each import replaces a store&rsquo;s listings with what it lists now. If a store
              can&rsquo;t be read, its previous prices stay for up to {staleDays} days and are then
              removed — so a store&rsquo;s brief outage doesn&rsquo;t wipe it from the comparison, and a
              store that has stopped answering doesn&rsquo;t linger.
            </li>
            <li>
              Twice a day an automated health check flags any store we haven&rsquo;t read in 30 hours,
              whose listing count suddenly drops, or whose prices freeze or jump.
            </li>
            <li>
              A store&rsquo;s prices are refused if they arrive in a different currency from its
              market&rsquo;s. Sealed products count as in stock only while a store shows them open for
              sale.
            </li>
            <li>
              Store comparisons are priced in each market&rsquo;s own currency, at the price the store
              itself charges. The exceptions: in Canada, rows marked &ldquo;eBay US&rdquo; are US
              listings converted to Canadian dollars; a eurozone visitor can see UK store prices in euros,
              with the pound price beside each; and the Deal Finder,
              the homepage&rsquo;s savings figures and the price-history charts convert TCGplayer&rsquo;s
              US price or our US-dollar history at the reference rates published on our{" "}
              <Link href="/methodology#currency" className="text-brand-400 hover:underline">methodology page</Link>.
            </li>
            {/* "Delivered cost ... is always shown" was false — store rows on card
                pages say postage is added at checkout. The sort itself is
                pinned in tests/business-diagnostic-fixes.test.ts. */}
            <li>
              Comparisons list the cheapest item price first, with the delivered total shown where the
              store publishes its postage. A store&rsquo;s known postage breaks ties between
              otherwise-equal prices, but a store is never pushed down just because a competitor&rsquo;s
              postage happens to be known and its own is only quoted at checkout. Never by what we earn.
            </li>
            <li>A consistency audit runs over the card database on demand, checking for duplicate records, broken identifiers, impossible prices and stale listings.</li>
            <li>
              Every wrong-price report is checked and marked confirmed, rejected or fixed; when one is
              fixed, the person who reported it is emailed if they left an address.
            </li>
          </ul>
        </section>

        <section id="corrections" className="scroll-mt-header space-y-3">
          <h2 className="text-lg font-bold text-white">Corrections</h2>
          <p>
            When we find or are told about a wrong price, we fix the underlying data; the affected
            pages show the correction when they are next rebuilt, which happens after every import.
            Where a published guide or post turns out to be wrong rather than merely out of date, we
            correct the text in place and move its last-updated date, so the change is visible
            rather than silent.
          </p>
          {/* Describes the practice of the Phase 25/26 retirements (next.config.js)
              rather than the old "we don't quietly delete pieces" line, which
              those 301s contradicted. */}
          <p>
            When an article&rsquo;s premise has expired — a launch-window piece after the launch, a
            snapshot overtaken by a new set — or it duplicates a better page, we retire it and
            permanently redirect its address to the page that now covers the topic, so links keep
            working and nobody lands on stale advice.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">How to report an error</h2>
          <p>
            For a price, use the &ldquo;Spotted a wrong price? Report it&rdquo; link under the store
            comparison on the card&rsquo;s page: it tells us exactly which listing you mean. For
            anything else, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>{" "}
            or use our <Link href="/contact" className="text-brand-400 hover:underline">contact form</Link>.
            The most useful report includes the page URL, what it says, and what it should say —
            a link to the retailer listing settles almost every pricing question in one step.
          </p>
        </section>

        <section id="money" className="scroll-mt-header space-y-3">
          <h2 className="text-lg font-bold text-white">How we make money, and what it does not buy</h2>
          <p>
            {SITE_NAME} is funded by display advertising (including Google AdSense); affiliate
            commissions — we are a member of the eBay Partner Network, TCGplayer&rsquo;s affiliate
            programme (run through Impact) and the Amazon Associates programme, and as an Amazon
            Associate we earn from qualifying purchases; Plus and Premium subscriptions; and paid
            one-to-one consulting sessions for stores. Outbound links that earn us a commission are
            marked <code className="rounded bg-ink-800 px-1 text-xs">rel=&quot;sponsored&quot;</code> and
            disclosed in plain language next to the link.
          </p>
          {/* 2026-09-26 ("Pushing eBay clicks" in DECISIONS.md): the site now
              promotes eBay beside its comparisons, so the promise is stated as
              what it always meant — the ORDER of a ranked comparison — and the
              promotion is disclosed here rather than left for a reader to find.
              "Price and postage alone" also overstated postage, which only
              breaks ties (tests/business-diagnostic-fixes.test.ts). */}
          <p>
            None of it affects the prices we show or the order of any ranked comparison. Ranking is
            by item price, with known postage breaking ties; a store we earn nothing from outranks
            one we do whenever it is cheaper, which is most of the time. Outside the ranked lists we
            do promote eBay, our main affiliate partner — an &ldquo;Also on eBay&rdquo; box or a
            &ldquo;Search eBay&rdquo; link beside a comparison. Those are labelled as paid links, sit
            apart from the ranking, and never change it. Inside a comparison, an eBay row&apos;s
            button uses eBay&apos;s own colour and carries a &ldquo;Paid link&rdquo; tag; its position
            and price are unchanged. See our{" "}
            <Link href="/privacy" className="text-brand-400 hover:underline">privacy policy</Link>{" "}
            for what advertising and analytics cookies are set and how to opt out.
          </p>
          {/* Paid store consulting (lib/consulting.ts) is the first time a store
              we compare can pay us at all — DECISIONS.md called it "the first real
              conflict this site has had". Disclosed here, with the separation the
              consulting page itself promises (its FAQ and "What this isn't"). */}
          <p>
            <strong className="text-white">Stores can pay us for advice, and that is a potential
            conflict of interest.</strong> We sell stores a one-to-one consulting session on their
            pricing, their position in their market and what to stock (
            <Link href="/stores/consulting" className="text-brand-400 hover:underline">store consulting</Link>
            ), held by Bill. It is the only way an independent store we compare can pay{" "}
            {SITE_NAME} — none of them pays us a commission — so it is kept apart from everything a
            shopper sees: booking a session changes nothing about how that store appears or ranks in
            the comparison, the comparison only ever shows the public prices anyone can see on a
            store&rsquo;s own website, and nothing said on a call is published.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">Independence</h2>
          <p>
            We are not affiliated with, endorsed by, or sponsored by Riot Games. No retailer we
            compare owns any part of {SITE_NAME}, and beyond the affiliate programmes and consulting
            sessions described above we have no commercial arrangement with one. We do not accept
            payment for editorial coverage, and we do not publish sponsored posts.
          </p>
          <p>
            Nothing on this site is financial or investment advice. Trading card prices are volatile
            and can fall as easily as they rise.
          </p>
          <p>
            We also do not market our tools as a way to profit at another buyer&rsquo;s expense. Our
            paid tools exist to answer buying questions — what is the cheapest way to get this list,
            and is today&rsquo;s price a good one. Where a tool reports demand or price-timing
            signals, we say plainly what it measures and where it is uncertain, rather than dressing
            it up as a strategy. See{" "}
            <Link href="/about#who-its-for" className="text-brand-400 hover:underline">
              who RiftCompare is for
            </Link>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
