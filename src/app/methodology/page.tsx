import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { STATIC_PAGE_DATES, staticPageDateLabel } from "@/lib/static-page-dates";
import { USD_TO } from "@/lib/fx";
import { pageAlternates } from "@/lib/seo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Methodology — condition grading, FX and comparison rules",
  description:
    "How RiftCompare maps condition grades across eBay, TCGplayer, Cardmarket and independent stores, how currency conversion is handled, and how the price comparison is ranked.",
  alternates: pageAlternates("/methodology"),
};

// ─────────────────────────────────────────────────────────────────────────────
// This page states the two things nothing else on the site states today: the
// condition mapping (four marketplaces, four incompatible grading scales, no
// official cross-marketplace mapping) and the FX policy. Everything else it
// needs is already published elsewhere — coverage at /stores/tracked, refresh
// cadence and how we're paid at /editorial-policy — so this LINKS rather than
// duplicates.
export default function MethodologyPage() {
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
    ["Independent stores (Shopify)", "The store's own variant title, verbatim — e.g. \"Near Mint\", \"NM\", \"Lightly Played\", or \"Default Title\" when the store sells only one condition", "Matched by wording (Near Mint → NM, Lightly Played → LP, etc.); a title with no condition wording is left unclassified rather than guessed", "Read directly from the product listing"],
    ["eBay", "eBay's own raw-card condition scale: \"Near Mint or Better\", \"Excellent\", \"Very Good\", \"Poor\"", "Mapped by relative rank onto our scale — Near Mint or Better → NM, Excellent → LP, Very Good → MP, Poor → HP", "Read from eBay's Browse API for each listing"],
    ["TCGplayer", "Always shown as \"NM\"", "Shown as a labelled reference price, not folded into the store comparison", "This is TCGplayer's algorithmic all-condition Market Price, not a graded Near Mint price — see the price note below"],
    ["Cardmarket", "Always shown as \"NM\"", "Shown as a labelled reference price, not folded into the store comparison", "Same shape as TCGplayer — a market-wide low converted to GBP, not a single graded listing"],
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
        This page explains two things precisely: how a card&rsquo;s condition is represented when
        four different marketplaces describe it four different ways, and how currency conversion is
        handled. For what we cover, how often prices refresh and how we&rsquo;re paid, see our{" "}
        <Link href="/editorial-policy" className="text-brand-400 hover:underline">editorial &amp; pricing policy</Link>{" "}
        and the full list of{" "}
        <Link href="/stores/tracked" className="text-brand-400 hover:underline">stores we track</Link>.
      </p>

      <div className="mt-8 space-y-8 border-t border-ink-800 pt-8 text-sm leading-relaxed text-slate-300">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">Condition grading</h2>
          <p>
            There is no official cross-marketplace grading standard for trading cards. eBay, TCGplayer
            and Cardmarket each use their own vocabulary, and independent stores describe condition
            however their storefront lets them. We standardise every listing onto one five-grade
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
            unclassified rather than guess — a wrong condition claim is worse than an unlabelled one.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">TCGplayer and Cardmarket reference prices</h2>
          <p>
            TCGplayer publishes one algorithmic Market Price per card — a blend across all conditions
            currently listed, not a single seller&rsquo;s Near Mint price. Cardmarket&rsquo;s figure is
            the same shape, converted from EUR. Neither is a real local listing you can buy at that
            exact price, so we never fold either into the store comparison or count it as a
            &ldquo;store&rdquo; — it&rsquo;s shown separately, clearly labelled as a reference price.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">Currency conversion</h2>
          <p>
            Every market&rsquo;s store comparison is ranked and priced in that market&rsquo;s own
            currency — we never convert between currencies to declare a cross-border winner, because
            that would mean publishing an exchange rate we can&rsquo;t stand behind as a live quote.
            Where a converted figure does appear (the TCGplayer/Cardmarket reference price above, or an
            optional secondary EUR display), it uses a hand-maintained rate table, refreshed
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
            currency — any figure converted through this table is a reference, never a quote.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">How the comparison is ranked</h2>
          <p>
            Stores are ranked by item price. A store&rsquo;s postage — when we know it — breaks ties
            between otherwise-equal prices, but it never demotes a store below a competitor just
            because that competitor&rsquo;s postage happens to be known upfront and theirs isn&rsquo;t
            (many stores only calculate postage at checkout). Delivered cost — price plus postage — is
            always shown alongside the price on every row, so you can compare on the total yourself.
            See our{" "}
            <Link href="/editorial-policy" className="text-brand-400 hover:underline">editorial &amp; pricing policy</Link>{" "}
            for how we make money and why it never affects this ranking.
          </p>
        </section>
      </div>
    </article>
  );
}
