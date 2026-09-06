import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense";
import { getTopDemand, type DemandPick } from "@/lib/demand";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, pickPrice, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { PremiumButton } from "@/components/PremiumButton";
import { CardQuickLink } from "@/components/CardQuickLink";
import { cardImageAlt } from "@/lib/image-alt";
import { pageAlternates } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Demand Finder — Most Searched & Viewed Riftbound Cards | RiftCompare" },
  description:
    "A Premium leaderboard of the Riftbound cards RiftCompare visitors are actually searching for and opening right now — raw demand, not a derived score. Ranked by searches and views, windowed to 7/30 days or all time.",
  keywords: [
    "riftbound demand",
    "riftbound most searched cards",
    "riftbound trending cards",
    "riftbound popular cards",
    "what riftbound cards to buy",
  ],
  alternates: pageAlternates("/tools/demand"),
  openGraph: { title: "Demand Finder — most searched & viewed Riftbound cards", url: `${SITE_URL}/tools/demand` },
};

const DEMAND_FAQS = [
  {
    q: "What is Demand Finder?",
    a: "A leaderboard of the Riftbound cards RiftCompare visitors are actually searching for and opening, ranked by real traffic — not a derived buy signal. Searches (typed into the search box) are the purest demand metric; views (any card page open) are broader.",
  },
  {
    q: "How is this different from Rising Cards?",
    a: "Rising Cards blends demand with price-timing into one composite score built to flag cards that haven't re-rated yet — a card with huge demand that already spiked scores lower there. Demand Finder is the unblended number: whatever is getting searched and viewed most, full stop, with no price-timing filter applied.",
  },
  {
    q: "What do the time windows mean?",
    a: "Searches and views are cumulative counters, so a window (7d/30d) is measured against a daily snapshot — the activity that accrued since then. All time is the running total since the card was added. If a window can't be measured yet (not enough snapshot history), the list falls back to all time and says so.",
  },
  {
    q: "Does high demand mean a card's price will rise?",
    a: "Not by itself — that is exactly the gap Rising Cards' price-timing component exists to fill. A card can be heavily searched because everyone already owns it, or because it just spiked and people are checking the damage. Treat Demand Finder as raw interest, not a prediction.",
  },
];

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "all", label: "All time", days: null },
];
const DEFAULT_RANGE = "7";

function DemandRow({ p, rank, metric, country, currency }: { p: DemandPick; rank: number; metric: "searches" | "views"; country: Country; currency: string }) {
  const price = pickPrice(p.card, country);
  return (
    <tr className="hover:bg-ink-800">
      <td className="px-3 py-2 text-slate-500">{rank}</td>
      <td className="px-3 py-2">
        <CardQuickLink card={p.card} className="flex items-center gap-2.5">
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
      <td className={`num px-2 py-2 text-right ${metric === "searches" ? "font-extrabold text-brand-300" : "text-slate-400"}`}>
        {p.searches.toLocaleString()}
      </td>
      <td className={`num px-2 py-2 text-right ${metric === "views" ? "font-extrabold text-brand-300" : "text-slate-400"}`}>
        {p.views.toLocaleString()}
      </td>
      <td className="num px-4 py-2 text-right text-slate-200">{price != null ? formatMoney(price, currency) : "—"}</td>
    </tr>
  );
}

export default async function DemandFinderPage({ searchParams }: { searchParams: { view?: string; range?: string } }) {
  const user = await getCurrentUser();
  const premium = isPremium(user) || ADSENSE_REVIEW_MODE;
  const country = getCountry();
  const info = COUNTRIES[country];

  const view = searchParams.view === "viewed" ? "viewed" : "searched";
  const range = RANGES.find((r) => r.key === searchParams.range) ?? RANGES.find((r) => r.key === DEFAULT_RANGE)!;

  const result = await getTopDemand(country, range.days, 25);
  const rows = view === "viewed" ? result.byView : result.bySearch;
  const metric: "searches" | "views" = view === "viewed" ? "views" : "searches";
  const top = result.bySearch[0];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <Link href="/tools" className="hover:text-slate-300">Tools</Link>
          <span>/</span>
          <span className="text-slate-300">Demand Finder</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Demand Finder</h1>
          {premium && (
            <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
              {RANGES.map((r) => {
                const active = r.key === range.key;
                return (
                  <Link
                    key={r.key}
                    href={`/tools/demand?view=${view}&range=${r.key}`}
                    className={`rounded-md px-2.5 py-1 text-sm ${active ? "bg-brand-500 font-medium text-white" : "text-slate-400 hover:text-white"}`}
                  >
                    {r.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          The {info.adjective} cards RiftCompare visitors are actually{" "}
          <strong className="text-slate-200">searching for and opening</strong> right now — raw demand, not a derived
          buy signal. Searches are the purest signal; views are broader.
        </p>
        {premium && (
          <div className="mt-3 flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1 sm:inline-flex">
            {[{ key: "searched", label: "Most searched" }, { key: "viewed", label: "Most viewed" }].map((t) => {
              const active = t.key === view;
              return (
                <Link
                  key={t.key}
                  href={`/tools/demand?view=${t.key}&range=${range.key}`}
                  className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm sm:flex-none sm:px-4 ${
                    active ? "bg-brand-500 font-medium text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ADSENSE REVIEW MODE: see tools/value-finder/page.tsx's identical note —
          the Premium gate lifts during review so no crawler-reachable page
          carries blurred/locked content. */}
      {!premium && !ADSENSE_REVIEW_MODE ? (
        <div className="card-surface overflow-hidden">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 font-semibold">#</th>
                <th className="px-3 py-2.5 font-semibold">Card</th>
                <th className="px-2 py-2.5 text-right font-semibold">Searches</th>
                <th className="px-2 py-2.5 text-right font-semibold">Views</th>
                <th className="px-4 py-2.5 text-right font-semibold">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {top ? (
                <DemandRow p={top} rank={1} metric="searches" country={country} currency={info.currency} />
              ) : (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">Not enough search activity yet — check back soon.</td></tr>
              )}
            </tbody>
          </table>
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
                <p className="text-sm font-bold text-white">Unlock the full Demand Finder</p>
                <p className="mx-auto mt-0.5 max-w-sm text-xs text-slate-400">
                  See the top 25 by searches and by views, with 7-day, 30-day and all-time windows — not just the top pick.
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  {user ? <PremiumButton /> : <Link href="/login?next=/tools/demand" className="btn-primary text-sm">Sign in free</Link>}
                  <Link href="/movers" className="btn-ghost text-sm">Free price movers →</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          Not enough {view === "viewed" ? "view" : "search"} activity in this window yet — check back soon.
        </div>
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 font-semibold">#</th>
                <th className="px-3 py-2.5 font-semibold">Card</th>
                <th className="px-2 py-2.5 text-right font-semibold">Searches</th>
                <th className="px-2 py-2.5 text-right font-semibold">Views</th>
                <th className="px-4 py-2.5 text-right font-semibold">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {rows.map((p, i) => <DemandRow key={p.card.id} p={p} rank={i + 1} metric={metric} country={country} currency={info.currency} />)}
            </tbody>
          </table>
          <p className="p-3 text-[11px] text-slate-600">
            {result.windowUsable
              ? `Searches/views shown are activity in the last ${result.coveredDays ?? range.days} day${(result.coveredDays ?? range.days) === 1 ? "" : "s"}.`
              : "Not enough snapshot history for a windowed view yet — showing all-time totals instead."}{" "}
            A demand signal, not a price prediction — always sanity-check the card&apos;s own price history.
          </p>
        </div>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-xl font-extrabold text-white">How Demand Finder works</h2>
        <div className="card-surface divide-y divide-ink-800">
          {DEMAND_FAQS.map((f) => (
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
              mainEntity: DEMAND_FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
                { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
                { "@type": "ListItem", position: 3, name: "Demand Finder", item: `${SITE_URL}/tools/demand` },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Riftbound Demand Finder",
              url: `${SITE_URL}/tools/demand`,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: info.currency },
              description: "A leaderboard of the most searched and viewed Riftbound cards, windowed to 7/30 days or all time.",
            },
          ]),
        }}
      />
    </div>
  );
}
