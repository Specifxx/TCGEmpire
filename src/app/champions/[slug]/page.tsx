import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CardTile } from "@/components/CardTile";
import { cardTileSelect } from "@/lib/cards";
import { COUNTRIES, DEFAULT_COUNTRY, priceField } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { CHAMPIONS, championBySlug, championCardWhere } from "@/lib/champions";
import { META_DECKS, resolveDeck, type ResolvedDeck } from "@/lib/meta-decks";
import { DomainBadge } from "@/components/Badge";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { breadcrumb } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";
import { buildCollectionNarrative } from "@/lib/content/collection-narrative";
import { getSiteMedianCents } from "@/lib/content/site-median";
import { CHAMPION_THIN_THRESHOLD } from "@/lib/champions";

// riftdecks.com's /legends/<champion> pages rank #1 for champion queries with
// build price and win rate in the snippet; ours 404'd entirely. This is the
// cross-set topical hub for "<champion> riftbound" — every printing of every
// card featuring them, priced live, which is the one thing we can do better than
// a deck site: they show one TCGplayer USD figure, we show the cheapest
// delivered price across five markets.
export const revalidate = 86400;

export async function generateStaticParams() {
  return CHAMPIONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const champ = championBySlug(params.slug);
  if (!champ) return {};
  // A hub with a handful of printings is a directory entry, not a page. Below
  // the threshold it stays crawlable and linked but is kept out of the index,
  // matching how the type/rarity/printing facets already behave. Fails OPEN: a
  // count query that throws returns -1 and leaves the page indexable.
  const cardCount = await prisma.card.count({ where: championCardWhere(champ) }).catch(() => -1);
  const title = `${champ.name} Riftbound Cards — All Printings & Live Prices`;
  return {
    title: { absolute: `${title} | RiftCompare` },
    description:
      `Every Riftbound ${champ.name} card across all sets — Legends, units and alternate-art printings — ` +
      `with live prices compared across stores so you can find the cheapest way to build ${champ.name}.`,
    alternates: { canonical: `/champions/${champ.slug}` },
    ...(cardCount >= 0 && cardCount < CHAMPION_THIN_THRESHOLD ? { robots: { index: false, follow: true } } : {}),
    keywords: [
      `${champ.name} riftbound`,
      `riftbound ${champ.name} cards`,
      `${champ.name} riftbound deck`,
      `${champ.name} riftbound price`,
    ],
    openGraph: { title, description: `Every Riftbound ${champ.name} card with live prices.`, url: `${SITE_URL}/champions/${champ.slug}` },
  };
}

export default async function ChampionPage({ params }: { params: { slug: string } }) {
  const champ = championBySlug(params.slug);
  if (!champ) notFound();

  const country = DEFAULT_COUNTRY;
  const field = priceField(country);
  const currency = COUNTRIES[country].currency;
  const where = championCardWhere(champ);

  // A DB OUTAGE MUST NOT LOOK LIKE "this champion has no cards". Those two
  // states are indistinguishable if the error is swallowed into an empty array,
  // and the consequences are opposite: a genuinely card-less champion should
  // 404, but a transient outage that 404s bakes all 82 champion pages as
  // permanent-looking 404s into the deploy (and a real Neon P1001 during a
  // Vercel build is not hypothetical — it happened). So the failure is caught
  // explicitly and flagged, and only a CONFIRMED empty result 404s.
  // Declared as a thunk so the result type is inferred from the actual `select`
  // (cardTileSelect) rather than widening to the full Card model.
  const fetchCards = () =>
    prisma.card.findMany({
      where,
      orderBy: [{ [field]: { sort: "desc", nulls: "last" } }, { setCode: "asc" }, { collectorNumber: "asc" }],
      take: 60,
      select: cardTileSelect(country),
    });
  let cards: Awaited<ReturnType<typeof fetchCards>> = [];
  let dbReachable = true;
  try {
    cards = await fetchCards();
  } catch (e) {
    dbReachable = false;
    console.error(`champions/${champ.slug}: card query failed, rendering without the grid:`, e);
  }

  if (dbReachable && cards.length === 0) notFound();

  // Price stats from the cards we actually rendered — never a separate query
  // that could disagree with the grid. Nulls excluded rather than zero-filled.
  const priced = cards
    .map((c) => (c as unknown as Record<string, number | null>)[field])
    .filter((p): p is number => p != null);
  const cheapest = priced.length ? Math.min(...priced) : null;
  const dearest = priced.length ? Math.max(...priced) : null;
  const buildCost = priced.length ? priced.reduce((a, b) => a + b, 0) : null;

  // Sets this champion appears in, and the Legend printings specifically.
  const sets = Array.from(new Set(cards.map((c) => c.setName)));
  const legends = cards.filter((c) => c.type === "Legend");

  // Real per-champion domain distribution, straight from the rendered card set —
  // not a synergy claim we can't back, just an honest tally of which domain(s)
  // this champion's printings actually belong to. Gives every champion page
  // genuinely different prose instead of the same template with a name swapped.
  const domainCounts = new Map<string, number>();
  for (const c of cards) domainCounts.set(c.domain, (domainCounts.get(c.domain) ?? 0) + 1);
  const domainsByCount = Array.from(domainCounts.entries()).sort((a, b) => b[1] - a[1]);

  // Meta decks whose legend is this champion. Matched through the same alias
  // list as everything else, so the "Master Yi"/"Yi"/"Master" split resolves.
  // Resolved (not just filtered) so the page can show the SAME real build cost
  // and tournament attribution as /decks, rather than a bare name + archetype.
  // Same DB-outage fence as the card query above: a failure here degrades to
  // the un-costed seed data (still real name/tier/domains/source) rather than
  // crashing an otherwise-fine page.
  const unpriced = (d: (typeof META_DECKS)[number]): ResolvedDeck => ({
    ...d, legendCard: null, legendPriceCents: null, items: [],
    totalCards: 0, totalCents: 0, pricedCards: 0, sideboardCards: 0, sideboardCents: 0, imageUrl: null,
  });
  const deckSeeds = META_DECKS.filter((d) =>
    champ.prefixes.some((p) => d.legend.toLowerCase().startsWith(p.toLowerCase() + ","))
  );
  const decks: ResolvedDeck[] = dbReachable
    ? await Promise.all(deckSeeds.map((d) => resolveDeck(d, country))).catch((e) => {
        console.error(`champions/${champ.slug}: deck resolve failed:`, e);
        return deckSeeds.map(unpriced);
      })
    : deckSeeds.map(unpriced);

  // Editorial intro built from this champion's OWN live pool — count, price
  // range, where the value sits, which cards matter, and what that means for
  // someone buying. The audit sampled champion hubs at a median of 164 unique
  // editorial words with a floor of 71, which across 82 URLs is a thin-content
  // pattern rather than a handful of stragglers. See lib/content/
  // collection-narrative.ts and docs/adsense-remediation.md § Phase 7c.
  const siteMedianCents = await getSiteMedianCents(country);
  const intro = buildCollectionNarrative({
    kind: "champion",
    label: champ.name,
    currency,
    place: COUNTRIES[country].place,
    members: cards.map((c) => ({
      name: c.name,
      priceCents: (c as unknown as Record<string, number | null>)[field] ?? null,
      setCode: c.setCode,
      rarity: c.rarity,
      collectorNumber: c.collectorNumber,
    })),
    setCodes: Array.from(new Set(cards.map((c) => c.setCode))),
    siteMedianCents,
  });

  const trail = [
    { name: "Champions", href: "/champions" },
    { name: champ.name, href: `/champions/${champ.slug}` },
  ];
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Riftbound ${champ.name} cards`,
    url: `${SITE_URL}/champions/${champ.slug}`,
    numberOfItems: cards.length,
    itemListElement: cards.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      url: `${SITE_URL}/card/${c.slug ?? c.id}`,
    })),
  };

  return (
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumb(trail), itemListLd]) }}
      />

      <div>
        <Breadcrumbs trail={trail} />
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
          {champ.name} Riftbound cards — all printings &amp; live prices
        </h1>
        <div className="mt-3 max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400">
          <p>
            Every Riftbound card featuring <strong className="text-slate-200">{champ.name}</strong> —{" "}
            {cards.length} printing{cards.length === 1 ? "" : "s"} across {sets.length}{" "}
            {sets.length === 1 ? "set" : "sets"} ({sets.join(", ")})
            {legends.length > 0 && `, including ${legends.length} Legend printing${legends.length === 1 ? "" : "s"}`}.
          </p>
          {intro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {domainsByCount.length > 0 && (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            {domainsByCount.length === 1 ? (
              <>Every tracked {champ.name} printing is a <strong className="text-slate-200">{domainsByCount[0][0]}</strong> card.</>
            ) : (
              <>
                {champ.name}&apos;s printings span {domainsByCount.length} domains —{" "}
                {domainsByCount.map(([d, n], i) => (
                  <span key={d}>
                    {i > 0 && (i === domainsByCount.length - 1 ? " and " : ", ")}
                    <strong className="text-slate-200">{d}</strong> ({n})
                  </span>
                ))}
                {" "}— so a deck built around {champ.name} can pull from any of them.
              </>
            )}
          </p>
        )}
      </div>

      {/* Price stats — the commercial angle riftdecks shows in its snippet, but
          computed from our own multi-store data rather than a single reference. */}
      {cheapest != null && dearest != null && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Printings tracked" value={String(cards.length)} />
          <Stat label="Cheapest printing" value={formatMoney(cheapest, currency)} accent />
          <Stat label="Most valuable" value={formatMoney(dearest, currency)} />
          {buildCost != null && (
            <Stat label="One of each" value={formatMoney(buildCost, currency)} />
          )}
        </div>
      )}

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="text-xl font-extrabold text-white">Every {champ.name} printing</h2>
          <Link href={`/browse?q=${encodeURIComponent(champ.name)}`} className="btn-ghost text-xs shrink-0">
            Sort &amp; filter in Browse →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {cards.map((c) => (
            <CardTile key={c.id} card={c} />
          ))}
        </div>
      </section>

      {decks.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-extrabold text-white">Decks built around {champ.name}</h2>
          <p className="mb-4 max-w-3xl text-xs text-slate-500">
            Real tournament results, not house-made lists — each links to its source event and its live, priced
            buy list.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {decks.map((d) => (
              <Link
                key={d.slug}
                href={`/decks/${d.slug}`}
                className="card-surface group flex flex-col gap-1 p-4 transition-colors hover:border-brand-500"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white group-hover:text-brand-300">{d.name}</span>
                  {d.tier && <span className="chip ml-auto bg-ink-800 text-[10px] text-slate-400">Tier {d.tier}</span>}
                </div>
                <span className="text-xs text-slate-500">{d.archetype}</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {d.domains.map((dm) => (
                    <DomainBadge key={dm} domain={dm} />
                  ))}
                </div>
                {d.pricedCards > 0 && (
                  <span className="num mt-1 text-sm font-bold text-accent">
                    from {formatMoney(d.totalCents, currency)} <span className="text-xs font-normal text-slate-500">({d.pricedCards}/{d.totalCards} priced)</span>
                  </span>
                )}
                {d.source && <span className="mt-1 text-[11px] text-slate-600">{d.source}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Cheapest way to build {champ.name}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          {cheapest != null ? (
            <>
              The cheapest {champ.name} printing currently listed is {formatMoney(cheapest, currency)}. Because each
              printing is its own product with its own price, the base print is usually far cheaper than the
              alternate-art or Signature version of the same card — open any card above to compare every store
              side by side on delivered cost, or use the{" "}
              <Link href="/tools/best-basket" className="text-brand-400 hover:underline">best-basket tool</Link> to
              buy several at once for the least.
            </>
          ) : (
            <>
              No {champ.name} printing has a live price in this market yet. Prices appear here as stores list them —
              check the <Link href="/browse" className="text-brand-400 hover:underline">full database</Link> in the
              meantime.
            </>
          )}
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-white">Other champions</h2>
        <div className="flex flex-wrap gap-2">
          {CHAMPIONS.filter((c) => c.slug !== champ.slug)
            .slice(0, 24)
            .map((c) => (
              <Link key={c.slug} href={`/champions/${c.slug}`} className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">
                {c.name}
              </Link>
            ))}
          <Link href="/champions" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">
            All champions →
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card-surface p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num mt-1 text-lg font-bold ${accent ? "text-accent" : "text-white"}`}>{value}</div>
    </div>
  );
}
