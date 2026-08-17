import Link from "next/link";
import { getPopularCards } from "@/lib/cheapest-cards";
import { getHomeStats } from "@/lib/home-stats";
import { COUNTRIES, type Country } from "@/lib/country";
import { COUNTRY_GUIDE_SLUGS } from "@/lib/seo";
import { CinematicHero } from "./CinematicHero";
import { webPage, faqPage, breadcrumb, ldJson } from "@/lib/jsonld";

// Region home pages (/au, /nz, /uk, /sg, /ca — see app/au/page.tsx etc): the
// homepage's own hero/search/stat building blocks, reused rather than
// duplicated, PLUS genuinely region-specific content below the fold (real
// counts from THIS market, a link to that market's own buying guide, a
// region-scoped FAQ). Deliberately NOT a full re-render of every homepage
// section (deals ticker, movers, popular-cards carousel, reviews, partner
// strip, newsletter card, …) — six near-identical copies of that would be
// exactly the near-duplicate-content problem the rest of this site's SEO work
// has been fighting, for a stat block and an H1 as the only real difference.
// This stays a focused, honestly-thinner landing page with its own real facts,
// which is what actually earns a market-specific query rather than just
// declaring a URL for one.
export async function RegionHome({ region }: { region: Country }) {
  const info = COUNTRIES[region];
  const [{ totalCards, statsByCountry, freshness }, trendingCards] = await Promise.all([
    getHomeStats(),
    getPopularCards(6, region),
  ]);
  const stat = statsByCountry[region];
  const storeWord = stat.stores === 1 ? "store" : "stores";
  const guideSlug = COUNTRY_GUIDE_SLUGS[region];

  const faqs = [
    {
      q: `Where can I buy Riftbound cards in ${info.place}?`,
      a: `RiftCompare tracks ${stat.stores} ${info.adjective} ${storeWord} stocking Riftbound: League of Legends TCG singles and sealed product, plus eBay ${region}, and ranks every result by total delivered cost — item price plus ${info.adjective} shipping — so you see what you'd actually pay, not just the sticker price.`,
    },
    {
      q: `Are prices shown in ${info.currency}?`,
      a: `Yes — every price on this page and across the ${info.adjective} store listings is in ${info.currency}, the real currency those stores charge in. No conversion, no surprise exchange-rate markup.`,
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      <CinematicHero
        totalCards={totalCards}
        statsByCountry={statsByCountry}
        trendingCards={trendingCards}
        freshness={freshness}
        region={{ code: region, adjective: info.adjective }}
      />

      <section className="container-app">
        <h2 className="text-xl font-extrabold text-white">Buying Riftbound cards in {info.place}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          RiftCompare compares live prices across {stat.stores} {info.adjective} {storeWord} for Riftbound: League of
          Legends TCG — {stat.priced.toLocaleString()} cards priced so far — ranked by total delivered cost (item plus
          {" "}{info.adjective} shipping), updated daily. It&apos;s the same database and the same ranking logic used
          everywhere else on the site, scoped to what&apos;s actually available in {info.place}.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/browse" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Browse the full database →
          </Link>
          <Link href="/stores/tracked" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            See every store we track →
          </Link>
          <Link href="/sets" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Browse by set →
          </Link>
          <Link href="/decks" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Top meta decks →
          </Link>
          {guideSlug && (
            <Link href={`/blog/${guideSlug}`} className="font-semibold text-brand-300 underline-offset-2 hover:underline">
              Full {info.label} buying guide →
            </Link>
          )}
        </div>

        <div className="mt-6 divide-y divide-ink-800 border-t border-ink-800">
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
          __html: ldJson(
            webPage({
              name: `RiftCompare ${info.label} — Riftbound Card Prices`,
              href: `/${region.toLowerCase()}`,
              description: `Compare live Riftbound TCG card prices across ${info.adjective} stores — total delivered cost including ${info.adjective} shipping, in ${info.currency}.`,
              type: "CollectionPage",
            }),
            breadcrumb([{ name: info.label, href: `/${region.toLowerCase()}` }]),
            faqPage(faqs),
          ),
        }}
      />
    </div>
  );
}
