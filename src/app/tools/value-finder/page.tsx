import type { Metadata } from "next";
import Link from "next/link";
import { CardQuickLink } from "@/components/CardQuickLink";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getUndervalued } from "@/lib/screener";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { PremiumButton } from "@/components/PremiumButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Value Finder — Undervalued Riftbound Cards | RiftCompare" },
  description:
    "A Premium screener for Riftbound cards trading below their recent average — a mean-reversion signal for value buyers and flippers, ranked by how far below their usual price they are. Just want to check what a card is worth? Use the free value checker.",
  keywords: [
    "undervalued riftbound cards",
    "riftbound card deals",
    "riftbound cards below average price",
    "riftbound value finder",
    "riftbound card investing",
    "riftbound card prices",
  ],
  alternates: { canonical: "/tools/value-finder" },
  openGraph: { title: "Value Finder — undervalued Riftbound cards", url: `${SITE_URL}/tools/value-finder` },
};

// Public, crawlable explainer so the page isn't thin to search engines behind the
// Premium gate (an anonymous crawler would otherwise see only the paywall card).
const VF_FAQS = [
  {
    q: "What is the Riftbound Value Finder?",
    a: "A screener that surfaces Riftbound cards currently trading below their own recent average price — a mean-reversion signal for value buyers and flippers. Cards are ranked by how far below their usual price they sit and how far off their recent high they are.",
  },
  {
    q: "How is “undervalued” calculated?",
    a: "We compare a card's current lowest price to the mean of its lowest price over the last 30 days. The bigger the gap below that average, the higher it ranks. It's a signal, not advice — thin markets and one-off listings can mislead, so always sanity-check the card page.",
  },
  {
    q: "How can I just check what one card is worth?",
    a: "Use the free Riftbound card value checker: search any card to see its live market value plus real store prices in your country. The Value Finder is the opposite lens — it scans the whole market for cards trading below their norm.",
  },
  {
    q: "Does undervalued mean the price will go up?",
    a: "Not necessarily. A card below its average can keep falling if demand is genuinely cooling. Treat the screen as a starting point for research, not a guarantee — check the card's price history and current demand before buying to flip.",
  },
];

export default async function ValueFinderPage() {
  const user = await getCurrentUser();
  const premium = isPremium(user);
  const country = getCountry();
  const info = COUNTRIES[country];
  const picks = premium ? await getUndervalued(country) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Value Finder</span>
        </nav>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Value Finder</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          {info.adjective} cards trading <strong className="text-slate-200">below their own recent average</strong> — a
          mean-reversion signal for value buyers and flippers. Ranked by how far below their usual price they sit, not just
          today&apos;s movement.
        </p>
      </div>

      {!premium ? (
        <div className="card-surface p-6 text-center">
          <h2 className="text-lg font-extrabold text-white">Value Finder is a Premium tool</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            Premium members get the screener: the cards trading furthest below their 30-day average right now, with the
            discount and how far off their recent high each one is.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {user ? (
              <PremiumButton />
            ) : (
              <Link href="/register?next=/tools/value-finder" className="btn-primary text-sm">Create a free account</Link>
            )}
            <Link href="/card-value" className="btn-ghost text-sm">Free value checker →</Link>
          </div>
          <p className="mx-auto mt-3 max-w-md text-xs text-slate-500">
            Just want to know what a card is worth? The free{" "}
            <Link href="/card-value" className="font-semibold text-brand-400 hover:underline">Riftbound card value checker</Link>{" "}
            shows any card&apos;s live value and store prices — no account needed.
          </p>
        </div>
      ) : picks.length === 0 ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          No clearly-undervalued cards right now — the market&apos;s near its averages. Check back as prices move.
        </div>
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Card</th>
                <th className="px-2 py-2.5 text-right font-semibold">Now</th>
                <th className="px-2 py-2.5 text-right font-semibold">30-day avg</th>
                <th className="px-2 py-2.5 text-right font-semibold">vs avg</th>
                <th className="px-4 py-2.5 text-right font-semibold">off high</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {picks.map((p) => (
                <tr key={p.card.id} className="hover:bg-ink-800">
                  <td className="px-4 py-2">
                    <CardQuickLink card={p.card} className="flex items-center gap-2.5">
                      {p.card.imageThumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.card.imageThumbUrl} alt="" aria-hidden="true" width={28} height={39} loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-white">{p.card.name}</span>
                        <span className="block text-[11px] text-slate-500">{p.card.setCode} · {p.card.collectorNumber}</span>
                      </span>
                    </CardQuickLink>
                  </td>
                  <td className="num px-2 py-2 text-right font-semibold text-accent">{formatMoney(p.currentCents, info.currency)}</td>
                  <td className="num px-2 py-2 text-right text-slate-400">{formatMoney(p.avgCents, info.currency)}</td>
                  <td className="num px-2 py-2 text-right font-bold text-brand-400">−{p.discountPct}%</td>
                  <td className="num px-4 py-2 text-right text-slate-300">{p.offHighPct}%</td>
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
                "A screener for Riftbound cards trading below their recent average — a mean-reversion signal for value buyers and flippers.",
            },
          ]),
        }}
      />
    </div>
  );
}
