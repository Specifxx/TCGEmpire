import type { Metadata } from "next";
import Link from "next/link";
import { CardQuickLink } from "@/components/CardQuickLink";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense";
import { getUndervalued } from "@/lib/screener";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { PremiumButton } from "@/components/PremiumButton";
import { RegionToggle } from "@/components/RegionToggle";
import { cardImageAlt } from "@/lib/image-alt";
import { pageAlternates } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Value Finder — Undervalued Riftbound Cards | RiftCompare" },
  description:
    "A Premium screener for Riftbound cards trading below their recent average, ranked by how far below their usual price they are — so you can tell whether a card on your want-list is genuinely cheap right now. Just want to check what a card is worth? Use the free value checker.",
  keywords: [
    "undervalued riftbound cards",
    "riftbound card deals",
    "riftbound cards below average price",
    "riftbound value finder",
    "riftbound card investing",
    "riftbound card prices",
  ],
  alternates: pageAlternates("/tools/value-finder"),
  openGraph: { title: "Value Finder — undervalued Riftbound cards", url: `${SITE_URL}/tools/value-finder` },
};

// Public, crawlable explainer so the page isn't thin to search engines behind the
// Premium gate (an anonymous crawler would otherwise see only the paywall card).
const VF_FAQS = [
  {
    q: "What is the Riftbound Value Finder?",
    a: "A screener that surfaces Riftbound cards currently trading below their own recent average price. Cards are ranked by how far below their usual price they sit and how far off their recent high they are, so you can see which of the cards you want are going cheap today rather than checking them one at a time.",
  },
  {
    q: "How is “undervalued” calculated?",
    a: "We compare a card's current lowest price to the mean of its lowest price over the last 30 days. The bigger the gap below that average, the higher it ranks. It's a signal, not advice — thin markets and one-off listings can mislead, so always sanity-check the card page.",
  },
  {
    q: "How can I just check what one card is worth?",
    a: "Search any card in the free card database to see its live market value plus real store prices in your country. The Value Finder is the opposite lens — it scans the whole market for cards trading below their norm.",
  },
  {
    q: "Does undervalued mean the price will go up?",
    a: "Not necessarily. A card below its average can keep falling if demand is genuinely cooling, and nothing here is investment advice. Treat the screen as a starting point, not a guarantee — check the card's price history and current demand on its own page before you buy.",
  },
];

export default async function ValueFinderPage() {
  const user = await getCurrentUser();
  const premium = isPremium(user, "premium");
  const country = getCountry();
  const info = COUNTRIES[country];
  // Members get the full screen; non-members get ONLY the single best pick (the full
  // list never ships, so it can't be un-blurred) as a teaser — the "one row free"
  // pattern converts far better than a blank paywall. The teaser is cached (this page
  // is force-dynamic + public) so anonymous/crawler hits don't each re-run the full
  // ~400-card undervalued scan just to reveal one row.
  const picks = premium ? await getUndervalued(country) : [];
  // getUndervalued caches itself (day-keyed, shared). The teaser used to wrap it
  // in a second unstable_cache, which in Next.js 14.2 disables the inner one —
  // so every free visitor's request could re-run the screener's history read.
  const teaser = premium ? undefined : (await getUndervalued(country, 1))[0];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Value Finder</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Value Finder</h1>
          <RegionToggle />
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          {info.adjective} cards trading <strong className="text-slate-200">below their own recent average</strong> — a
          plain read on which cards are going cheap today. Ranked by how far below their usual price they sit, not just
          today&apos;s movement.
        </p>
      </div>

      {/* ADSENSE REVIEW MODE: while the review is open the Premium gate is
          lifted, so no crawler-reachable page carries blurred or locked
          content — "content behind a paywall or login" is its own AdSense
          rejection reason, and this page is in the sitemap. The Premium CTA
          stays; an ordinary upsell link is fine, a blur overlay standing in
          place of the content is not. Restored by setting
          NEXT_PUBLIC_ADSENSE_REVIEW_MODE=false. See docs/adsense-remediation.md § 9. */}
      {!premium && !ADSENSE_REVIEW_MODE ? (
        <div className="card-surface overflow-x-auto">
          {/* One real pick free, then a locked preview + upsell (arbitrage pattern).
              Below sm both tables are table-fixed with three columns — Card, Now
              (the 30-day average rides under it) and vs avg — because a
              min-w-[620px] table in this card was cut off at every phone width,
              hiding the vs-avg figure the page ranks by (2026-09-23). The card
              scrolls sideways from sm up instead of clipping. The empty state is
              a paragraph, not a colSpan row: with columns hidden, a colSpan=5
              cell adds phantom columns and crushed Card to 39px. */}
          {teaser ? (
          <table className="w-full table-fixed text-sm sm:table-auto sm:min-w-[620px]">
            <thead>
              <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 font-semibold sm:px-4">Card</th>
                <th className="w-[5.5rem] px-2 py-2.5 text-right font-semibold sm:w-auto">Now</th>
                <th className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell">30-day avg</th>
                <th className="w-16 py-2.5 pl-2 pr-3 text-right font-semibold sm:w-auto sm:px-2">vs avg</th>
                <th className="hidden px-4 py-2.5 text-right font-semibold sm:table-cell">off high</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {teaser && (
                <tr className="hover:bg-ink-800">
                  <td className="px-3 py-2 sm:px-4">
                    <CardQuickLink card={teaser.card} className="flex min-w-0 items-center gap-2.5">
                      {teaser.card.imageThumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={teaser.card.imageThumbUrl} alt={cardImageAlt(teaser.card)} width={28} height={39} loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-white">{teaser.card.name}</span>
                        <span className="block text-[11px] text-slate-500">{teaser.card.setCode} · {teaser.card.collectorNumber}</span>
                      </span>
                    </CardQuickLink>
                  </td>
                  <td className="num px-2 py-2 text-right font-semibold text-accent">
                    {formatMoney(teaser.currentCents, info.currency)}
                    <span className="block text-[11px] font-normal text-slate-500 sm:hidden">avg {formatMoney(teaser.avgCents, info.currency)}</span>
                  </td>
                  <td className="num hidden px-2 py-2 text-right text-slate-400 sm:table-cell">{formatMoney(teaser.avgCents, info.currency)}</td>
                  <td className="num py-2 pl-2 pr-3 text-right font-bold text-brand-400 sm:px-2">−{teaser.discountPct}%</td>
                  <td className="num hidden px-4 py-2 text-right text-slate-300 sm:table-cell">{teaser.offHighPct}%</td>
                </tr>
              )}
            </tbody>
          </table>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-slate-500">The market&apos;s near its averages right now — check back as prices move.</p>
          )}
          {/* Locked preview rows + upsell */}
          <div className="relative border-t border-ink-800">
            <ul className="divide-y divide-ink-800 blur-[5px]" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex items-center gap-2.5 px-4 py-3 opacity-60">
                  <div className="h-10 w-7 shrink-0 rounded-sm bg-ink-800" />
                  <div className="flex-1 space-y-1.5"><div className="h-2.5 w-2/5 rounded bg-ink-800" /><div className="h-2 w-1/4 rounded bg-ink-800" /></div>
                  <div className="h-3 w-10 rounded bg-ink-800" />
                </li>
              ))}
            </ul>
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-transparent to-ink-900/60 p-4 text-center">
              <div>
                <p className="text-sm font-bold text-white">Unlock the full Value Finder</p>
                <p className="mx-auto mt-0.5 max-w-sm text-xs text-slate-400">
                  See every card going cheap — ranked by how far below its 30-day average it&apos;s trading — not just the top pick.
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  {user ? (
                    <PremiumButton surface="gate:value-finder" />
                  ) : (
                    <Link href="/login?next=/tools/value-finder" className="btn-primary text-sm">Sign in free</Link>
                  )}
                  <Link href="/browse" className="btn-ghost text-sm">Search the database →</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : picks.length === 0 ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          No clearly-undervalued cards right now — the market&apos;s near its averages. Check back as prices move.
        </div>
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full table-fixed text-sm sm:table-auto sm:min-w-[620px]">
            <thead>
              <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 font-semibold sm:px-4">Card</th>
                <th className="w-[5.5rem] px-2 py-2.5 text-right font-semibold sm:w-auto">Now</th>
                <th className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell">30-day avg</th>
                <th className="w-16 py-2.5 pl-2 pr-3 text-right font-semibold sm:w-auto sm:px-2">vs avg</th>
                <th className="hidden px-4 py-2.5 text-right font-semibold sm:table-cell">off high</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {picks.map((p) => (
                <tr key={p.card.id} className="hover:bg-ink-800">
                  <td className="px-3 py-2 sm:px-4">
                    <CardQuickLink card={p.card} className="flex min-w-0 items-center gap-2.5">
                      {p.card.imageThumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.card.imageThumbUrl} alt={cardImageAlt(p.card)} width={28} height={39} loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-white">{p.card.name}</span>
                        <span className="block text-[11px] text-slate-500">{p.card.setCode} · {p.card.collectorNumber}</span>
                      </span>
                    </CardQuickLink>
                  </td>
                  <td className="num px-2 py-2 text-right font-semibold text-accent">
                    {formatMoney(p.currentCents, info.currency)}
                    <span className="block text-[11px] font-normal text-slate-500 sm:hidden">avg {formatMoney(p.avgCents, info.currency)}</span>
                  </td>
                  <td className="num hidden px-2 py-2 text-right text-slate-400 sm:table-cell">{formatMoney(p.avgCents, info.currency)}</td>
                  <td className="num py-2 pl-2 pr-3 text-right font-bold text-brand-400 sm:px-2">−{p.discountPct}%</td>
                  <td className="num hidden px-4 py-2 text-right text-slate-300 sm:table-cell">{p.offHighPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-3 text-[11px] text-slate-600">
            &quot;vs avg&quot; is how far below the card&apos;s mean lowest price over the last 30 days it&apos;s trading now.
            A signal, not advice — thin markets and one-off listings can mislead; always sanity-check the card page.
          </p>
        </div>
      )}

      {/* Public, always-rendered explainer + FAQ so the page carries real indexable
          content for crawlers regardless of the Premium gate. */}
      <section className="mt-10">
        <h2 className="mb-3 text-xl font-extrabold text-white">How the Value Finder works</h2>
        <div className="card-surface divide-y divide-ink-800">
          {VF_FAQS.map((f) => (
            <div key={f.q} className="px-5 py-4">
              <h3 className="font-bold text-white">{f.q}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: VF_FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
                { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
                { "@type": "ListItem", position: 3, name: "Value Finder", item: `${SITE_URL}/tools/value-finder` },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Riftbound Value Finder",
              url: `${SITE_URL}/tools/value-finder`,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: info.currency },
              description:
                "A screener for Riftbound cards trading below their recent average, ranked by how far below their usual price they sit.",
            },
          ]),
        }}
      />
    </div>
  );
}
