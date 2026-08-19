import type { Metadata } from "next";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CardTile } from "@/components/CardTile";
import { cardTileSelect } from "@/lib/cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { KEYWORDS, keywordBySlug } from "@/lib/keywords";
import { getArticle } from "@/lib/articles";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

export const revalidate = 86400;

export async function generateStaticParams() {
  return KEYWORDS.map((k) => ({ slug: k.slug }));
}

// Which of the three Vendetta archetype blueprints on /decks builds around this
// keyword — matches decks/page.tsx's "Vendetta spotlight" section exactly (same
// three archetypes, same domain pairings), so this never claims a deck exists
// that isn't actually shown there.
const ARCHETYPE_BY_KEYWORD: Record<string, { name: string; domains: string }> = {
  empower: { name: "Empower Midrange", domains: "Mind + Body" },
  flow: { name: "Flow Value", domains: "Fury + Calm" },
  burn: { name: "Burn / Disruption", domains: "Chaos + Order" },
};

// This page and its matching /guides/<guideSlug> both target the same mechanic —
// they used to also target the same QUERY ("riftbound X explained"), which is
// keyword cannibalisation: two of our own pages competing for one ranking. The
// guide owns "explained" (long-form: how it works, why it's strong, deckbuilding).
// This page owns REFERENCE intent instead: a short definition plus the live card
// list, so it isn't a near-duplicate of the guide it links to.
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const kw = keywordBySlug(params.slug);
  if (!kw) return notFoundMetadata("Keyword");
  const title = `${kw.name} — Riftbound Keyword Reference | RiftCompare`;
  // Lead with the keyword's OWN direct answer rather than a template sentence.
  // The previous description varied only by the keyword's name, so all three
  // keyword pages read as one description (GROWTH-AUDIT.md § 4) — and they all
  // belong to the same set, so there was no other varying fact to add. The
  // directAnswer is per-keyword prose that already exists in lib/keywords.ts,
  // sourced against Riot's Core Rules, so this adds NO new rules claim: it
  // surfaces the definition the page already renders. It is also a better
  // snippet — someone searching "riftbound empower" wants the definition, not a
  // description of the page.
  const answer = kw.directAnswer.replace(/\s+/g, " ").trim();
  const lead = answer.length > 96 ? `${answer.slice(0, answer.lastIndexOf(" ", 96)).replace(/[,;:.]$/, "")}…` : answer;
  const description = `${lead} Plus every card printed with ${kw.name}, live-priced.`;
  return {
    title: { absolute: title },
    description,
    alternates: pageAlternates(`/keywords/${kw.slug}`),
    keywords: [
      `riftbound ${kw.name.toLowerCase()} keyword`,
      `riftbound ${kw.name.toLowerCase()} reference`,
      `riftbound ${kw.name.toLowerCase()} rules`,
      `riftbound ${kw.name.toLowerCase()} cards`,
    ],
    openGraph: pageOpenGraph({ title, description, url: `/keywords/${kw.slug}` }),
  };
}

export default async function KeywordPage({ params }: { params: { slug: string } }) {
  const kw = keywordBySlug(params.slug);
  if (!kw) notFound();

  // Every card actually printed with this keyword — same predicate the matching
  // guide's browseCta/embed already use (description contains the bracket marker,
  // scoped to the set that introduced it), so this list is never invented.
  const cards = await prisma.card.findMany({
    where: { setCode: kw.set, description: { contains: kw.rulesContain } },
    orderBy: [{ rarity: "asc" }, { collectorNumber: "asc" }],
    take: 24,
    select: cardTileSelect(DEFAULT_COUNTRY),
  });

  const archetype = ARCHETYPE_BY_KEYWORD[kw.slug];
  const related = kw.relatedKeywords.map((s) => keywordBySlug(s)).filter((k): k is NonNullable<typeof k> => !!k);
  const guideTitle = getArticle(kw.guideSlug)?.title ?? `Riftbound ${kw.name} Explained`;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Keywords", item: `${SITE_URL}/keywords` },
      { "@type": "ListItem", position: 3, name: kw.name, item: `${SITE_URL}/keywords/${kw.slug}` },
    ],
  };
  // DefinedTerm (not TechArticle/FAQPage) — this page is a glossary entry, not a
  // long-form explainer; the guide at /guides/<guideSlug> is the TechArticle-shaped
  // page for that intent. Keeping the schema TYPE distinct mirrors the page's own
  // distinct angle instead of describing two competing pages the same way.
  const definedTermLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: `${kw.name} (Riftbound keyword)`,
    description: kw.directAnswer,
    url: `${SITE_URL}/keywords/${kw.slug}`,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "Riftbound Keywords & Game Actions Glossary",
      url: `${SITE_URL}/keywords`,
    },
  };

  return (
    <div className="flex flex-col gap-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, definedTermLd]) }}
      />

      <div>
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <Link href="/keywords" className="hover:text-slate-300">Keywords</Link>
          <span>/</span>
          <span className="text-slate-300">{kw.name}</span>
        </nav>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{kw.name} — Riftbound keyword reference</h1>
          <span className="chip shrink-0 bg-ink-800 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Glossary</span>
        </div>
        {/* Concise rules definition — the direct answer, nothing more. The full
            explainer (how it works, why it's strong, how to build around it) lives
            on the guide linked right below. */}
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-200">{kw.directAnswer}</p>
      </div>

      {/* Prominent link to the full guide — this is the primary target for
          "riftbound {kw.name} explained"-style queries; this page just points there. */}
      <Link
        href={`/guides/${kw.guideSlug}`}
        className="card-surface flex flex-wrap items-center justify-between gap-3 border-brand-500/30 bg-brand-500/5 p-4 transition-colors hover:border-brand-500/60"
      >
        <span className="text-sm text-slate-200">
          <span className="font-bold text-white">Want the full breakdown?</span> Read the complete guide — how {kw.name}
          works step by step, why it&apos;s strong, and how to build a deck around it.
        </span>
        <span className="btn-primary shrink-0 whitespace-nowrap text-sm">{guideTitle} →</span>
      </Link>

      {/* Worked example: a real card actually printed with this keyword, not a
          mock-up — the same asset the matching guide's close-up uses. */}
      {cards[0] && (
        <section className="card-surface flex flex-col items-center gap-4 p-5 sm:flex-row">
          <div className="w-32 shrink-0 sm:w-40">
            <CardTile card={cards[0]} />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-brand-400">Worked example</div>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">
              <strong className="text-white">{cards[0].name}</strong> is a real, officially revealed{" "}
              {cards[0].setName} card printed with {kw.name} — open it to see the exact printed rules text
              and its live price across stores.
            </p>
          </div>
        </section>
      )}

      {archetype && (
        <section className="card-surface p-5">
          <h2 className="text-base font-extrabold text-white">Decks that use {kw.name}</h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-400">
            The <strong className="text-white">{archetype.name}</strong> archetype ({archetype.domains}) is
            built around {kw.name} — see the shell on <Link href="/decks" className="text-brand-400 hover:underline">/decks</Link>.
          </p>
        </section>
      )}

      {cards.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="text-xl font-extrabold text-white">Every {kw.name} card</h2>
            <Link
              href={`/browse?rules=${encodeURIComponent(kw.rulesContain)}&rulesSet=${kw.set}`}
              className="btn-ghost text-xs shrink-0"
            >
              Browse &amp; sort by price →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {cards.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-wrap items-center gap-3 border-t border-ink-800 pt-6 text-sm">
        <Link href={`/guides/${kw.guideSlug}`} className="btn-primary">
          Full {kw.name} deckbuilding guide →
        </Link>
        {related.map((r) => (
          <Link key={r.slug} href={`/keywords/${r.slug}`} className="chip bg-ink-800 text-slate-300 hover:bg-ink-700">
            {r.name} keyword →
          </Link>
        ))}
        <Link href="/keywords" className="chip bg-ink-800 text-slate-300 hover:bg-ink-700">
          All keywords →
        </Link>
      </section>
    </div>
  );
}
