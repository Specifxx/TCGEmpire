import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { SETS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { cardDisplayName } from "@/lib/card-name";

// ─────────────────────────────────────────────────────────────────────────────
// /cards/all — every card page on the site, as plain links, on one page
// ─────────────────────────────────────────────────────────────────────────────
// Asked for directly: "maybe make a page or sitemap contain every single card
// page so I can index them on google search."
//
// THE SITEMAP HALF ALREADY EXISTED and is complete — /sitemaps/cards.xml carries
// all 1,431 card URLs (verified live 2026-09-17, right after the change that
// stopped withholding priceless cards from it). What did NOT exist is an HTML
// index: a page a crawler reaches by following links, rather than by parsing a
// submitted XML file. The two are different discovery paths and Google uses
// both, so this is additive rather than duplicative.
//
// WHY IT IS NOT A HUB OF HUBS. /cards already indexes the FACETS (type, rarity,
// printing, domain) and /sets indexes the sets. Every one of those caps what it
// renders — facet pages at 60 tiles, galleries at 500, set pages at 100 per
// page — so following them all is the only way to see the whole catalogue, and
// "follow fourteen paginated pages" is a crawl path with a real drop-off rate.
// This page is the flat, complete, single-hop version of that.
//
// GROUPED BY SET, NOT ALPHABETICAL, and the anchor text carries the printing.
// Hundreds of cards share a name across printings — "Fury Rune" occurs 31 times
// — so an A-Z list would be hundreds of identical anchors pointing at different
// URLs, which is worse than useless for crawling: identical anchor text is how
// you tell a crawler two pages are the same page. cardDisplayName() adds the
// credentials it already adds everywhere else ("(Showcase, Signature)"), and the
// collector number follows, so every one of the 1,431 anchors is distinct.
//
// EGRESS: ONE query, seven short columns, cached for as long as the page itself
// (see the rules at the top of lib/db.ts). No per-card lookup, no image fields,
// no prices — a directory needs a name and a URL and nothing else. At ~1,431
// rows of short strings this is comparable to what the sitemap already reads
// once a day, and `revalidate` here equals the route's own, never lower.
export const revalidate = 86400;

const PATH = "/cards/all";

type IndexCard = {
  slug: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  variant: string | null;
  isPromo: boolean;
};

const getEveryCard = unstable_cache(
  async (): Promise<IndexCard[]> => {
    try {
      return await prisma.card.findMany({
        orderBy: [{ setCode: "asc" }, { collectorNumber: "asc" }],
        select: {
          slug: true,
          name: true,
          setCode: true,
          collectorNumber: true,
          // Only so the anchor text can say WHICH printing — see the header.
          rarity: true,
          variant: true,
          isPromo: true,
        },
      });
    } catch {
      // Fail OPEN to an empty list, the same rule every other card surface
      // follows: a database blip renders a thin page, never a 500 on an
      // indexable URL.
      return [];
    }
  },
  ["cards-all-index"],
  { revalidate, tags: [CONTENT_TAG] },
);

export const metadata: Metadata = {
  title: { absolute: "Every Riftbound Card — Full A-Z Card List | RiftCompare" },
  description:
    "The complete list of every Riftbound card we track, grouped by set, each linking to its own price-comparison page across every store in six markets.",
  alternates: pageAlternates(PATH),
  openGraph: pageOpenGraph({
    title: "Every Riftbound card | RiftCompare",
    description: "The complete card list, grouped by set, every one linked to live prices.",
    url: PATH,
  }),
};

export default async function AllCardsPage() {
  const cards = await getEveryCard();

  // Group in memory off the one query — SETS gives the display order and names,
  // and anything whose set code is not in SETS (a collector product like T1S)
  // still gets a section rather than being silently dropped.
  const bySet = new Map<string, IndexCard[]>();
  for (const c of cards) {
    const list = bySet.get(c.setCode);
    if (list) list.push(c);
    else bySet.set(c.setCode, [c]);
  }
  const known = SETS.filter((s) => bySet.has(s.code)).map((s) => ({
    code: s.code,
    name: s.name,
    slug: s.slug,
    cards: bySet.get(s.code)!,
  }));
  const knownCodes = new Set(known.map((s) => s.code));
  const other = [...bySet.entries()]
    .filter(([code]) => !knownCodes.has(code))
    .map(([code, list]) => ({ code, name: code, slug: null as string | null, cards: list }));
  const groups = [...known, ...other];

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Cards", item: `${SITE_URL}/cards` },
      { "@type": "ListItem", position: 3, name: "Every card", item: `${SITE_URL}${PATH}` },
    ],
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <nav aria-label="Breadcrumb" className="mb-3 text-xs text-slate-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-slate-300">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href="/cards" className="hover:text-slate-300">Cards</Link></li>
          <li aria-hidden="true">/</li>
          <li className="text-slate-300" aria-current="page">Every card</li>
        </ol>
      </nav>

      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Every Riftbound card</h1>
      <p className="mt-1 font-mono text-xs text-slate-500">
        {cards.length.toLocaleString()} cards · {groups.length} {groups.length === 1 ? "set" : "sets"}
      </p>

      {/* Editorial context. A page of links and nothing else is the definition of
          a low-value page, and this one is indexable, so it has to answer what a
          visitor landing on it actually wants to know. */}
      <div className="mt-3 max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400">
        <p>
          This is the complete index of every Riftbound printing RiftCompare tracks, grouped by the set it
          belongs to and ordered by collector number. Every entry links to that printing&apos;s own page, where the
          same card is priced across every store we monitor in Australia, the United States, the United Kingdom,
          Singapore, Canada and the EU, in each market&apos;s own currency rather than a converted estimate.
        </p>
        <p>
          Each printing gets its own line because each printing is its own product with its own market. A Signature,
          an alternate art, an overnumbered reprint and a Nexus Night promo of the same card share a name and
          nothing else — they are pulled at different rates, they trade at different prices, and a collector
          looking for one of them does not want the others. That is why the labels below carry the printing and the
          collector number as well as the name, and why the counts here are higher than the number of distinct card
          names in the game.
        </p>
        <p>
          If you would rather narrow down than scroll, the{" "}
          <Link href="/browse" className="text-brand-400 hover:underline">filterable database</Link> takes domain,
          type, rarity, printing and price range together, the{" "}
          <Link href="/cards" className="text-brand-400 hover:underline">facet index</Link> lists every way to slice
          the catalogue, and each set also has a{" "}
          <Link href="/sets" className="text-brand-400 hover:underline">set page and a visual gallery</Link>.
        </p>
      </div>

      {/* Jump links: 1,431 anchors is a long page on a phone, and a set list at
          the top costs nothing and makes it navigable. */}
      {groups.length > 1 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {groups.map((g) => (
            <a
              key={g.code}
              href={`#set-${g.code.toLowerCase()}`}
              className="chip border border-ink-700 text-slate-300 hover:border-brand-500 hover:bg-ink-800"
            >
              {g.name} <span className="num text-slate-500">{g.cards.length}</span>
            </a>
          ))}
        </div>
      )}

      {cards.length === 0 && (
        <p className="card-surface mt-6 p-5 text-sm text-slate-400">
          The card list is briefly unavailable. The{" "}
          <Link href="/browse" className="text-brand-400 hover:underline">filterable database</Link> is the same
          catalogue and is unaffected.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.code} id={`set-${g.code.toLowerCase()}`} className="mt-8 scroll-mt-24">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-extrabold text-white">
              {g.name} <span className="font-mono text-xs font-normal text-slate-500">({g.code})</span>
            </h2>
            {g.slug && (
              <Link href={`/sets/${g.slug}`} className="text-sm text-brand-400 hover:underline">
                {g.name} set page &amp; prices →
              </Link>
            )}
          </div>
          <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {g.cards.map((c) => (
              <li key={c.slug ?? `${c.setCode}-${c.collectorNumber}-${c.name}`} className="min-w-0">
                {/* A card with no slug is not linkable — it serves on its raw id
                    and those URLs 308 to the slug once one is backfilled, so
                    linking it here would publish a redirect. Rare enough to be
                    worth listing as plain text rather than omitting the row. */}
                {c.slug ? (
                  <Link href={`/card/${c.slug}`} className="tap-link text-slate-300 hover:text-brand-400">
                    {cardDisplayName(c.name, c)}{" "}
                    <span className="font-mono text-xs text-slate-500">{c.collectorNumber}</span>
                  </Link>
                ) : (
                  <span className="text-slate-500">
                    {cardDisplayName(c.name, c)}{" "}
                    <span className="font-mono text-xs">{c.collectorNumber}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
