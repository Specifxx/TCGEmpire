import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { DOMAINS, DOMAIN_KEYS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { AdSlot } from "@/components/AdSlot";
import { DomainExplorer, type DomainInfoProp } from "@/components/learn/DomainExplorer";
import { DeckAnatomy } from "@/components/learn/DeckAnatomy";
import { GameFlow } from "@/components/learn/GameFlow";
import { LegendQuiz, type QuizLegend } from "@/components/learn/LegendQuiz";

export const metadata: Metadata = {
  title: "Learn Riftbound — Interactive New-Player Guide",
  description:
    "Learn Riftbound, the League of Legends TCG, the interactive way: step through how a game flows, explore the six domains with real cards, see exactly what goes in a deck, and test yourself with a quiz. Free, no signup.",
  keywords: [
    "learn Riftbound",
    "how to play Riftbound",
    "Riftbound rules",
    "Riftbound for beginners",
    "Riftbound domains",
    "Riftbound deck building",
    "League of Legends TCG how to play",
  ],
  alternates: { canonical: "/learn" },
};

// Everything on this page is data-backed (live counts + real example cards) or
// links out to the official rules — we deliberately don't paraphrase rules text we
// can't verify. Free community resource: no signup, no gating.
const getLearnData = unstable_cache(
  async () => {
    const [domainCounts, typeCounts, legends, typeExamples] = await Promise.all([
      prisma.card.groupBy({ by: ["domain"], where: { variant: null, isPromo: false }, _count: true }),
      prisma.card.groupBy({ by: ["type"], where: { variant: null, isPromo: false }, _count: true }),
      prisma.card.findMany({
        where: { type: "Legend", variant: null, isPromo: false, imageThumbUrl: { not: null } },
        select: { name: true, slug: true, id: true, domain: true, imageThumbUrl: true },
        orderBy: { name: "asc" },
      }),
      // One good-looking example per card type (most viewed = most recognisable).
      prisma.card.findMany({
        where: { variant: null, isPromo: false, imageThumbUrl: { not: null } },
        select: { name: true, slug: true, id: true, type: true, imageThumbUrl: true },
        orderBy: { viewCount: "desc" },
        take: 400,
      }),
    ]);
    const exampleByDomain = new Map<string, { name: string; href: string; img: string | null }>();
    for (const l of legends) {
      if (!exampleByDomain.has(l.domain))
        exampleByDomain.set(l.domain, { name: l.name, href: `/card/${l.slug ?? l.id}`, img: l.imageThumbUrl });
    }
    const exampleByType = new Map<string, { name: string; href: string; img: string | null }>();
    for (const c of typeExamples) {
      if (!exampleByType.has(c.type))
        exampleByType.set(c.type, { name: c.name, href: `/card/${c.slug ?? c.id}`, img: c.imageThumbUrl });
    }
    return {
      domains: Object.fromEntries(domainCounts.map((d) => [d.domain, d._count])),
      types: typeCounts.sort((a, b) => b._count - a._count),
      exampleByDomain: Object.fromEntries(exampleByDomain),
      exampleByType: Object.fromEntries(exampleByType),
      quizLegends: legends.map((l) => ({
        name: l.name,
        img: l.imageThumbUrl,
        domain: l.domain,
        href: `/card/${l.slug ?? l.id}`,
      })) satisfies QuizLegend[],
    };
  },
  ["learn-data-v2"],
  { revalidate: 3600 }
);

// Original, flavour-level identities for each domain — play-style colour, not
// rules claims. The exact mechanics live in the official tutorial.
const DOMAIN_BLURBS: Record<string, string> = {
  Fury: "Aggression and fire. Fury decks hit fast and hit hard, looking to end the game before slower plans come online.",
  Calm: "Patience and growth. Calm rewards setting up, out-valuing your opponent and striking when the moment is right.",
  Mind: "Knowledge and control. Mind bends games its way with spells, answers and information advantage.",
  Body: "Strength and discipline. Body fights fair and wins anyway — efficient units and relentless, honest combat.",
  Chaos: "Risk and explosiveness. Chaos embraces variance for spectacular, swingy turns your opponent can't plan around.",
  Order: "Structure and command. Order builds wide, coordinated boards that overwhelm through teamwork.",
  Colorless: "The cards that fit anywhere — Colorless slots into any deck, whatever its domains.",
};

const TYPE_BLURBS: Record<string, string> = {
  Unit: "The cards that fight for you on battlefields — champions included.",
  Spell: "One-shot effects you play for a momentary edge.",
  Gear: "Equipment and items that stick around to boost your side.",
  Legend: "Your deck's identity — you build around your chosen Legend.",
  Battlefield: "The locations being fought over each game.",
  Rune: "The resource cards that power everything you play.",
};

// Two glossaries: the game's words, and the collector's words (printings &
// condition) — the second is knowledge a price-comparison site is uniquely
// qualified to teach, and the thing newcomers get burned by first.
const GAME_TERMS: { term: string; def: string }[] = [
  { term: "Legend", def: "The card your whole deck is built around — it defines your domains and your Champion." },
  { term: "Champion", def: "Your Legend's signature unit; the star of the deck." },
  { term: "Domain", def: "The game's colour system: Fury, Calm, Mind, Body, Chaos and Order (plus Colorless). Decks commit to one or two." },
  { term: "Rune", def: "A resource card. Rune colours must match your domains so you can cast your cards on time." },
  { term: "Battlefield", def: "A contested location card — games are decided by the fights here." },
  { term: "Energy", def: "What cards cost to play. Cheap cards come down early; expensive ones need runes online." },
  { term: "Might", def: "A unit's muscle in combat — the number that decides fights." },
  { term: "Mulligan", def: "Your one chance to shuffle back a bad opening hand and redraw. Keep hands with runes AND early plays." },
  { term: "Sideboard", def: "Up to 8 extra cards swapped in between tournament games to tune your deck per matchup." },
];
const COLLECTOR_TERMS: { term: string; def: string }[] = [
  { term: "Base print", def: "The standard version of a card — plays identically to the fancy versions and costs the least." },
  { term: "Alt-art / Showcase", def: "Alternate-art treatments of a card (numbers like 112a). Same gameplay, collector pricing." },
  { term: "Signature", def: "Artist-signed, overnumbered printings (a ★ in the number) — among the rarest pulls in the game." },
  { term: "Overnumbered", def: "Cards numbered past the set's base count (e.g. 238/219) — special chase pulls." },
  { term: "Promo", def: "Limited printings from prereleases and organised play. Same card, its own price." },
  { term: "Near Mint (NM)", def: "The benchmark card condition prices assume. Played copies should always cost less." },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is Riftbound hard to learn?",
    a: "No — the official tutorial teaches the rules in about 15 minutes, and this page gives you the shape of the game first: Legends, domains, runes, battlefields. Most new players are playing real games on day one.",
  },
  {
    q: "What goes in a Riftbound deck?",
    a: "A tournament list is built from a Legend and its Champion, a main deck of about 40 Units, Spells and Gear, 12 Runes matching your domains, 3 Battlefields, and a sideboard of up to 8 cards for swapping between games.",
  },
  {
    q: "What are the Riftbound domains?",
    a: "Six domains — Fury, Calm, Mind, Body, Chaos and Order — plus Colorless cards that fit any deck. Each domain has its own playstyle, and most competitive decks commit to one or two.",
  },
  {
    q: "What's the cheapest way to start playing Riftbound?",
    a: "Start with a ready-to-play product like a Proving Grounds kit, then upgrade it card-by-card with singles — far cheaper than opening boosters hoping to pull what you need. RiftCompare shows the cheapest store for every card.",
  },
  {
    q: "How can I practice without buying cards?",
    a: "Learn the card pool with the daily Riftle game, and browse real tournament decklists to see how they're built — all free on RiftCompare.",
  },
];

export default async function LearnPage() {
  const data = await getLearnData();

  const domainProps: DomainInfoProp[] = DOMAIN_KEYS.filter((k) => (data.domains[k] ?? 0) > 0).map((k) => ({
    key: k,
    label: DOMAINS[k].label,
    color: DOMAINS[k].color,
    color2: DOMAINS[k].color2,
    blurb: DOMAIN_BLURBS[k] ?? "",
    count: data.domains[k] ?? 0,
    example: data.exampleByDomain[k] ?? null,
  }));

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Learn Riftbound", item: `${SITE_URL}/learn` },
    ],
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([faqLd, breadcrumbLd]) }} />

      {/* Hero */}
      <section className="card-surface overflow-hidden">
        <div className="border-l-2 border-brand-500 bg-ink-900 px-6 py-10 text-center">
          <h1 className="mx-auto max-w-2xl font-display text-3xl font-extrabold text-white">Learn Riftbound</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            The interactive guide to the League of Legends TCG. Step through how a game flows, explore
            the domains with real cards, see exactly what goes in a deck — then test yourself. Completely
            free: no signup, no paywall, no catch.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/how-to-play-get-started/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              Official how-to-play (15 min) ↗
            </a>
            <Link href="/riftle" className="btn-ghost">Play today&apos;s Riftle</Link>
          </div>
        </div>
      </section>

      {/* The shape of a game — interactive stepper */}
      <section>
        <h2 className="mb-1 text-xl font-extrabold text-white">The shape of a game</h2>
        <p className="mb-3 text-sm text-slate-400">Five steps from sitting down to winning — tap through.</p>
        <GameFlow />
      </section>

      {/* The six domains — interactive explorer with real cards */}
      <section>
        <h2 className="mb-1 text-xl font-extrabold text-white">Explore the domains</h2>
        <p className="mb-3 text-sm text-slate-400">
          Every card belongs to a domain — the game&apos;s colour system. Tap one to meet it.
        </p>
        <DomainExplorer domains={domainProps} />
      </section>

      {/* Deck anatomy — interactive diagram */}
      <section>
        <h2 className="mb-1 text-xl font-extrabold text-white">What goes in a deck</h2>
        <p className="mb-3 text-sm text-slate-400">Every part of a tournament list, to scale — tap each segment.</p>
        <DeckAnatomy />
      </section>

      {/* Card types — live data with real example cards */}
      <section>
        <h2 className="mb-1 text-xl font-extrabold text-white">Every card type, in plain words</h2>
        <p className="mb-3 text-sm text-slate-400">The high-level idea of each — the official tutorial covers the exact rules.</p>
        <div className="card-surface divide-y divide-ink-800">
          {data.types.map((t) => {
            const ex = data.exampleByType[t.type];
            return (
              <div key={t.type} className="flex items-center gap-4 px-4 py-3">
                {ex?.img ? (
                  <Link href={ex.href} className="shrink-0" title={ex.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ex.img} alt={ex.name} width={100} height={140} className="h-14 w-10 rounded object-cover ring-1 ring-white/10 transition-opacity hover:opacity-80" loading="lazy" decoding="async" />
                  </Link>
                ) : (
                  <div className="h-14 w-10 shrink-0 rounded bg-ink-800" />
                )}
                <div className="w-24 shrink-0 font-bold text-white">{t.type}</div>
                <p className="min-w-0 flex-1 text-sm text-slate-400">{TYPE_BLURBS[t.type] ?? ""}</p>
                <Link href={`/browse?type=${encodeURIComponent(t.type)}`} className="shrink-0 text-xs font-semibold text-brand-400 hover:underline">
                  <span className="num">{t._count}</span> cards →
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* Quiz — real cards from the DB */}
      <section>
        <h2 className="mb-1 text-xl font-extrabold text-white">Quick quiz: guess the domain</h2>
        <p className="mb-3 text-sm text-slate-400">Five real Legends from the database — can you place them?</p>
        <LegendQuiz legends={data.quizLegends} domains={[...DOMAIN_KEYS.filter((k) => k !== "Colorless")]} />
      </section>

      <AdSlot height={100} />

      {/* Learning path */}
      <section>
        <h2 className="mb-3 text-xl font-extrabold text-white">Your first week, step by step</h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {[
            { n: 1, title: "Learn the rules", body: "Riot's official quick-start teaches the game in about 15 minutes — the best first stop.", href: "https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/how-to-play-get-started/", label: "Official guide ↗", ext: true },
            { n: 2, title: "Know what to buy (and what to skip)", body: "Our beginner guide covers exactly what's worth your first dollars — and the traps.", href: "/guides/riftbound-for-beginners", label: "Beginner buying guide →" },
            { n: 3, title: "Understand deck building", body: "What goes in a Riftbound deck and why — Legends, domains, the whole structure.", href: "/guides/how-a-riftbound-deck-is-built", label: "Deck anatomy →" },
            { n: 4, title: "Build cheap, play real games", body: "Competitive-enough budget decks so you can play before you invest.", href: "/guides/budget-riftbound-decks", label: "Budget decks →" },
          ].map((s) => (
            <li key={s.n} className="card-surface p-4">
              <div className="flex items-center gap-2">
                <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500/20 text-sm font-extrabold text-brand-300">{s.n}</span>
                <h3 className="font-bold text-white">{s.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
              {s.ext ? (
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-brand-400 hover:underline">{s.label}</a>
              ) : (
                <Link href={s.href} className="mt-2 inline-block text-sm font-semibold text-brand-400 hover:underline">{s.label}</Link>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* Glossary — game words + collector words */}
      <section>
        <h2 className="mb-3 text-xl font-extrabold text-white">Speak the language</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card-surface p-4">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-brand-400">Game terms</h3>
            <dl className="space-y-2.5">
              {GAME_TERMS.map((g) => (
                <div key={g.term}>
                  <dt className="text-sm font-bold text-white">{g.term}</dt>
                  <dd className="text-sm leading-relaxed text-slate-400">{g.def}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="card-surface p-4">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gold">Collector terms</h3>
            <p className="mb-2.5 text-xs text-slate-500">
              The words that decide what a card costs — worth knowing before you buy your first single.
            </p>
            <dl className="space-y-2.5">
              {COLLECTOR_TERMS.map((g) => (
                <div key={g.term}>
                  <dt className="text-sm font-bold text-white">{g.term}</dt>
                  <dd className="text-sm leading-relaxed text-slate-400">{g.def}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              See the difference in practice:{" "}
              <Link href="/guides/most-valuable-riftbound-cards" className="font-semibold text-brand-400 hover:underline">
                what makes a card valuable →
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* FAQ (matches the FAQPage JSON-LD) */}
      <section>
        <h2 className="mb-3 text-xl font-extrabold text-white">New-player questions</h2>
        <div className="card-surface divide-y divide-ink-800">
          {FAQS.map((f) => (
            <div key={f.q} className="px-5 py-4">
              <h3 className="font-bold text-white">{f.q}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Riftle banner */}
      <section className="card-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-l-2 border-brand-500 bg-ink-900 p-6">
          <div>
            <h2 className="text-lg font-extrabold text-white">Riftle — the card game about the card game</h2>
            <p className="mt-1 max-w-md text-sm text-slate-400">
              The fun way to learn the card pool: guess the mystery card with hints on set, domain, type,
              rarity, cost and might. A new daily card — or play Unlimited. Free forever.
            </p>
          </div>
          <Link href="/riftle" className="btn-primary">Play Riftle →</Link>
        </div>
      </section>

      <p className="text-center text-xs text-slate-600">
        Riftbound is a trademark of Riot Games. RiftCompare is an independent community site — this page will always be free.
      </p>
    </div>
  );
}
