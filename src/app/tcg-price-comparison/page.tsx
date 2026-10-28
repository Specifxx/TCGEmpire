import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { SISTER_SITES } from "@/lib/sister-sites";
import { FamilySearchForm } from "./FamilySearchForm";

// The one page for "compare TCG card prices" (2026-10-28, project thread
// "Decide whether to unify all compare sites"): every card game the Compare
// Empire family covers, with a search box that sends the words to that game's
// site. Instead of a separate hub domain, it lives on the family's strongest
// site, and it is the ONLY such page: the sister sites link here rather than
// each carrying a copy, so the family never competes with itself for the query.
// No database read; the list is lib/sister-sites.ts.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "TCG Card Price Comparison — Every Game We Compare",
  description:
    "Compare trading card prices across stores for Riftbound, Pokémon, Magic: The Gathering, One Piece, Yu-Gi-Oh!, Disney Lorcana and Gundam. Free, updated daily, in your currency.",
  alternates: pageAlternates("/tcg-price-comparison"),
};

const RIFTBOUND = {
  key: "rift",
  name: "RiftCompare",
  game: "Riftbound",
  url: SITE_URL,
  search: `${SITE_URL}/browse?q={q}`,
  what: "Riftbound: League of Legends TCG singles and sealed prices across stores in the US, Australia, the UK, Canada, Singapore and the EU",
  links: [
    { label: "Riftbound card list and prices", href: "/browse" },
    { label: "Riftbound sealed prices", href: "/sealed" },
    { label: "Where to buy Riftbound cards", href: "/guides/where-to-buy-riftbound-cards" },
  ],
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "TCG price comparison", item: `${SITE_URL}/tcg-price-comparison` },
  ],
};

export default function TcgPriceComparisonPage() {
  const sisters = SISTER_SITES.filter((s) => !s.notTcg && s.search);
  const games = [RIFTBOUND, ...sisters.map((s) => ({ key: s.key, name: s.name, game: s.game, url: s.url, search: s.search!, what: s.what, links: s.links }))];
  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <h1 className="text-3xl font-extrabold text-white">TCG card price comparison</h1>
      <p className="mt-3 leading-relaxed text-slate-300">
        RiftCompare is one of seven free price comparison sites, one per trading card game, all built the same way. Each one
        reads the prices of independent card stores, TCGplayer and eBay every day and lines them up cheapest first, in your
        own currency, so you can see where a card or a booster box costs least before you buy. Pick your game below, or search
        any card or product.
      </p>
      <section className="card-surface mt-6 p-4">
        <h2 className="text-lg font-extrabold text-white">Search any game</h2>
        <FamilySearchForm sites={games.map(({ key, name, game, search }) => ({ key, name, game, search }))} />
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-extrabold text-white">The games we compare</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {games.map((g) => {
            const own = g.key === "rift";
            return (
              <li key={g.key} className="card-surface p-4">
                <h3 className="font-bold text-white">
                  {own ? (
                    <Link href="/browse" className="tap-link text-brand-400 hover:underline">{g.game} prices · {g.name}</Link>
                  ) : (
                    <a href={g.url} target="_blank" rel="noopener" className="tap-link text-brand-400 hover:underline">{g.game} prices · {g.name}</a>
                  )}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{g.what}.</p>
                <ul className="mt-2 grid gap-1 text-sm">
                  {g.links.map((l) => (
                    <li key={l.href}>
                      {own ? (
                        <Link href={l.href} className="tap-link text-slate-300 hover:text-brand-400">{l.label} →</Link>
                      ) : (
                        <a href={l.href} target="_blank" rel="noopener" className="tap-link text-slate-300 hover:text-brand-400">{l.label} →</a>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="mt-8 text-sm leading-relaxed text-slate-400">
        <h2 className="text-lg font-extrabold text-white">How the comparison works</h2>
        <p className="mt-2">
          Every site checks the same kinds of sources: independent stores that publish their stock, TCGplayer&apos;s market price,
          and eBay listings, read at least once a day. A store row shows that store&apos;s own item price; postage is shown
          beside it, never added in, because it depends on the basket. Store listings are matched to one exact card or product,
          and a listing we can&apos;t match with confidence is left out rather than guessed. The sites are free and earn from
          affiliate links, which never change the order of the prices.
        </p>
      </section>
    </div>
  );
}
