import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { DOMAINS, DOMAIN_KEYS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Learn Riftbound — free new-player guide | RiftCompare",
  description:
    "New to Riftbound, the League of Legends TCG? Start here: how to learn the game in 15 minutes, the six domains, every card type explained with real examples, beginner buying guides and a free daily card game. No signup, no paywall.",
  alternates: { canonical: "/learn" },
};

// Everything on this page is data-backed (live counts + real example cards) or
// links out to the official rules — we deliberately don't paraphrase rules text we
// can't verify. Free community resource: no signup, no gating.
const getLearnData = unstable_cache(
  async () => {
    const [domainCounts, typeCounts, legends] = await Promise.all([
      prisma.card.groupBy({ by: ["domain"], where: { variant: null, isPromo: false }, _count: true }),
      prisma.card.groupBy({ by: ["type"], where: { variant: null, isPromo: false }, _count: true }),
      prisma.card.findMany({
        where: { type: "Legend", variant: null, isPromo: false },
        select: { name: true, slug: true, id: true, domain: true, imageThumbUrl: true },
        orderBy: { name: "asc" },
      }),
    ]);
    const exampleByDomain = new Map<string, { name: string; href: string }>();
    for (const l of legends) {
      if (!exampleByDomain.has(l.domain)) exampleByDomain.set(l.domain, { name: l.name, href: `/card/${l.slug ?? l.id}` });
    }
    return {
      domains: Object.fromEntries(domainCounts.map((d) => [d.domain, d._count])),
      types: typeCounts.sort((a, b) => b._count - a._count),
      exampleByDomain: Object.fromEntries(exampleByDomain),
    };
  },
  ["learn-data"],
  { revalidate: 3600 }
);

// High-level, uncontroversial one-liners only — the official tutorial teaches the
// actual rules; we point there rather than risk paraphrasing them wrong.
const TYPE_BLURBS: Record<string, string> = {
  Unit: "The cards that fight for you on battlefields — champions included.",
  Spell: "One-shot effects you play for a momentary edge.",
  Gear: "Equipment and items that stick around to boost your side.",
  Legend: "Your deck's identity — you build around your chosen Legend.",
  Battlefield: "The locations being fought over each game.",
  Rune: "The resource cards that power everything you play.",
};

export default async function LearnPage() {
  const data = await getLearnData();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      {/* Hero */}
      <section className="card-surface overflow-hidden">
        <div className="bg-gradient-to-br from-brand-600/25 via-ink-850 to-gold/15 px-6 py-10 text-center">
          <h1 className="mx-auto max-w-2xl font-display text-3xl font-extrabold text-white">Learn Riftbound</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            New to the League of Legends TCG? This page gets you from zero to your first game —
            and it&apos;s completely free. No signup, no paywall, no catch. Made for the community.
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
            <Link href="/riftle" className="btn-ghost">🃏 Play today&apos;s Riftle</Link>
          </div>
        </div>
      </section>

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
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500/20 text-sm font-extrabold text-brand-300">{s.n}</span>
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

      {/* The six domains — live data */}
      <section>
        <h2 className="mb-1 text-xl font-extrabold text-white">The domains</h2>
        <p className="mb-3 text-sm text-slate-400">Every card belongs to a domain — the game&apos;s colour system. Tap one to browse its cards.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {DOMAIN_KEYS.map((k) => {
            const d = DOMAINS[k];
            const count = data.domains[k] ?? 0;
            const ex = data.exampleByDomain[k];
            if (!count) return null;
            return (
              <Link key={k} href={`/browse?domain=${k}`} className="card-surface p-4 transition-colors hover:border-brand-500/50">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="font-bold text-white">{d.label}</span>
                  <span className="ml-auto text-xs text-slate-500">{count} cards</span>
                </div>
                {ex && <p className="mt-2 truncate text-xs text-slate-500">e.g. {ex.name}</p>}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Card types — live data */}
      <section>
        <h2 className="mb-1 text-xl font-extrabold text-white">Every card type, in plain words</h2>
        <p className="mb-3 text-sm text-slate-400">The high-level idea of each — the official tutorial covers the exact rules.</p>
        <div className="card-surface divide-y divide-ink-800">
          {data.types.map((t) => (
            <div key={t.type} className="flex items-center gap-4 px-4 py-3">
              <div className="w-28 shrink-0 font-bold text-white">{t.type}</div>
              <p className="min-w-0 flex-1 text-sm text-slate-400">{TYPE_BLURBS[t.type] ?? ""}</p>
              <Link href={`/browse?type=${encodeURIComponent(t.type)}`} className="shrink-0 text-xs font-semibold text-brand-400 hover:underline">
                {t._count} cards →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Riftle banner */}
      <section className="card-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-ink-850 to-brand-600/15 p-6">
          <div>
            <h2 className="text-lg font-extrabold text-white">🃏 Riftle — the daily card game</h2>
            <p className="mt-1 max-w-md text-sm text-slate-400">
              The fun way to learn the card pool: guess the mystery card in 8 tries with hints on set,
              domain, type, rarity, cost and might. New card every day. Free forever.
            </p>
          </div>
          <Link href="/riftle" className="btn-primary">Play today&apos;s puzzle →</Link>
        </div>
      </section>

      <p className="text-center text-xs text-slate-600">
        Riftbound is a trademark of Riot Games. RiftCompare is an independent community site — this page will always be free.
      </p>
    </div>
  );
}
