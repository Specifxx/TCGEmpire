import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CardTile } from "@/components/CardTile";
import { cardTileSelect } from "@/lib/cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { KEYWORDS, keywordBySlug } from "@/lib/keywords";
import { SITE_URL } from "@/lib/site";

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

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const kw = keywordBySlug(params.slug);
  if (!kw) return {};
  const title = `${kw.name} in Riftbound — What It Does & How It Works | RiftCompare`;
  return {
    title: { absolute: title },
    description: kw.directAnswer.slice(0, 155),
    alternates: { canonical: `/keywords/${kw.slug}` },
    keywords: [
      `riftbound ${kw.name.toLowerCase()}`,
      `what is ${kw.name.toLowerCase()} in riftbound`,
      `riftbound ${kw.name.toLowerCase()} explained`,
      `riftbound ${kw.name.toLowerCase()} rules`,
    ],
    openGraph: { title, description: kw.directAnswer.slice(0, 200), url: `${SITE_URL}/keywords/${kw.slug}` },
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

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Keywords", item: `${SITE_URL}/keywords` },
      { "@type": "ListItem", position: 3, name: kw.name, item: `${SITE_URL}/keywords/${kw.slug}` },
    ],
  };
  const faqLd =
    kw.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: kw.faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }
      : null;
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `${kw.name} in Riftbound`,
    description: kw.directAnswer,
    mainEntityOfPage: `${SITE_URL}/keywords/${kw.slug}`,
    publisher: { "@type": "Organization", name: "RiftCompare" },
    about: { "@type": "Thing", name: `Riftbound ${kw.name} keyword` },
  };

  return (
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, articleLd, ...(faqLd ? [faqLd] : [])]) }}
      />

      <div>
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <Link href="/keywords" className="hover:text-slate-300">Keywords</Link>
          <span>/</span>
          <span className="text-slate-300">{kw.name}</span>
        </nav>
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{kw.name} in Riftbound — what it does &amp; how it works</h1>
        {/* Direct-answer paragraph, first thing on the page — what Google lifts into
            a featured snippet / AI answer for "what is X in riftbound" queries. */}
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-200">{kw.directAnswer}</p>
      </div>

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

      {kw.sections.map((s) => (
        <section key={s.heading} className="card-surface p-6">
          <h2 className="text-xl font-extrabold text-white">{s.heading}</h2>
          <div className="mt-3 max-w-3xl space-y-2 text-sm leading-relaxed text-slate-300">
            {s.body.split("\n").map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </section>
      ))}

      {archetype && (
        <section className="card-surface p-6">
          <h2 className="text-xl font-extrabold text-white">Decks that use {kw.name}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            The <strong className="text-white">{archetype.name}</strong> archetype ({archetype.domains}) is
            built around {kw.name} — see the shell and full archetype breakdown on{" "}
            <Link href="/decks" className="text-brand-400 hover:underline">/decks</Link> and the{" "}
            <Link href="/guides/best-riftbound-vendetta-decks" className="text-brand-400 hover:underline">
              best Vendetta decks guide
            </Link>.
          </p>
        </section>
      )}

      {cards.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="text-xl font-extrabold text-white">Every {kw.name} card revealed so far</h2>
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

      {kw.faqs.length > 0 && (
        <section className="card-surface p-6">
          <h2 className="text-xl font-extrabold text-white">{kw.name} FAQ</h2>
          <dl className="mt-3 space-y-4">
            {kw.faqs.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold text-white">{f.q}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-400">{f.a}</dd>
              </div>
            ))}
          </dl>
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
