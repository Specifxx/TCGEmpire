import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getPriceMovers } from "@/lib/price-history";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";
import { AdSlot } from "@/components/AdSlot";
import { cardImageAlt } from "@/lib/image-alt";

export const metadata: Metadata = {
  title: "Riftbound Games — Free Daily Puzzles & Arcade",
  description:
    "Free Riftbound mini-games: Riftle (the daily guess-the-card puzzle), a pack opening simulator, Riftbound 2048, Card Smash, Higher or Lower with live card prices, Price Check, the Zoomed In art quiz and Pairs memory. No signup, endlessly replayable.",
  keywords: [
    "Riftbound games",
    "Riftle",
    "Riftbound pack simulator",
    "Riftbound 2048",
    "Riftbound daily game",
    "card price game",
    "higher or lower TCG",
    "Riftbound quiz",
  ],
  alternates: { canonical: "/games" },
  openGraph: {
    title: "Riftbound Games — Free Daily Puzzles & Arcade | RiftCompare",
    description:
      "Riftle, Higher or Lower, Price Check, Zoomed In and Pairs — free Riftbound mini-games built on live card data.",
    url: `${SITE_URL}/games`,
  },
};

// The arcade shelf. Riftle headlines (it's the daily habit); the rest are
// endless replays. Every game is built on the live card database, so each one
// quietly teaches the card pool and market prices.
const GAMES = [
  {
    href: "/riftle",
    emoji: "🃏",
    name: "Riftle",
    tag: "Daily + Unlimited",
    desc: "Guess the mystery card in 8 tries with Wordle-style clues on set, type, domain, rarity, cost and might.",
    accent: "from-brand-600/30 to-ink-850",
    featured: true,
  },
  {
    // SECOND, and featured, so it gets the wide hero tile. It is the only game
    // here targeting a head term of its own ("riftbound pack opening
    // simulator") and it carries the sourced pack-structure and pull-rate
    // tables — it earns the position that the other six mini-games do not.
    href: "/games/pack-sim",
    emoji: "🎁",
    name: "Pack Opening Simulator",
    tag: "Rip packs",
    desc: "Open virtual Riftbound packs dealt to Riot's real 14-card pack structure, from the actual card pool, with a live price on every pull.",
    accent: "from-emerald-500/20 to-ink-850",
    featured: true,
  },
  {
    href: "/games/higher-lower",
    emoji: "⚖️",
    name: "Higher or Lower",
    tag: "Streak",
    desc: "Which card costs more? Live prices, one mistake ends the run. How long can you last?",
    accent: "from-gold/25 to-ink-850",
  },
  {
    href: "/games/price-check",
    emoji: "🏷️",
    name: "Price Check",
    tag: "5 rounds",
    desc: "The Price Is Right, for Riftbound: guess each card's market price, score by closeness.",
    accent: "from-rose-500/20 to-ink-850",
  },
  {
    href: "/games/zoomed",
    emoji: "🔍",
    name: "Zoomed In",
    tag: "Art quiz",
    desc: "Name the card from a tiny patch of its art. Zoom out once if you must — at half points.",
    accent: "from-purple-500/20 to-ink-850",
  },
  {
    href: "/games/pairs",
    emoji: "🧠",
    name: "Pairs",
    tag: "Memory",
    desc: "Classic memory with real card art. Match all eight pairs in the fewest moves.",
    accent: "from-blue-500/20 to-ink-850",
  },
  {
    href: "/games/twenty48",
    emoji: "🧬",
    name: "Riftbound 2048",
    tag: "Puzzle",
    desc: "Slide and merge cards up the rarity ladder — two Commons make an Uncommon, all the way to Legend. Arrow keys or swipe.",
    accent: "from-cyan-500/20 to-ink-850",
  },
  {
    href: "/games/card-smash",
    emoji: "💥",
    name: "Card Smash",
    tag: "Reflex",
    desc: "Whack-a-mole with cards: tap them as they pop, dodge the bombs, beat the clock. Pricier cards score more.",
    accent: "from-orange-500/20 to-ink-850",
  },
];

export default async function GamesPage() {
  const user = await getCurrentUser();
  // The bridge from the arcade to the shop: today's best-value cards (furthest
  // below their recent high), in the visitor's market. Same cached movers data
  // the homepage uses, so this costs nothing extra.
  const country = getCountry();
  const info = COUNTRIES[country];
  const deals = (
    await unstable_cache(() => getPriceMovers(country, 6), ["price-movers", country], { revalidate: 600 })()
  ).value.slice(0, 6);
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Games", item: `${SITE_URL}/games` },
    ],
  };

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Riftbound Games",
    description:
      "Free Riftbound mini-games built on live card data — Riftle, Higher or Lower, Price Check, Zoomed In, Pairs, Pack Opening Simulator, Riftbound 2048 and Card Smash.",
    url: `${SITE_URL}/games`,
      // Edges back to the site-level graph in app/layout.tsx. Without them this
      // node is an island and the Organization/WebSite entity signals — sameAs,
      // areaServed, knowsAbout — don't propagate to the page.
      isPartOf: { "@id": `${SITE_URL}/#website` },
      publisher: { "@id": `${SITE_URL}/#org` },
    numberOfItems: GAMES.length,
    itemListElement: GAMES.map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: g.name,
      url: `${SITE_URL}${g.href}`,
      description: g.desc,
    })),
  };

  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, itemListLd]) }} />

      <div className="mb-6 text-center">
        <h1 className="font-display text-3xl font-extrabold text-white">🎮 Riftbound Games</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Free mini-games built on the live card database — every round secretly makes you better at
          the card pool and the market. No signup, no paywall, play forever.
        </p>
      </div>

      {/* Leaderboard / account prompt */}
      {user ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3">
          <p className="text-sm text-slate-200">
            🏆 You&apos;re signed in as <strong className="text-white">{user.displayName}</strong> — every game you finish counts toward the global leaderboards.
          </p>
        </div>
      ) : (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3">
          <p className="text-sm text-slate-200">
            🏆 <strong className="text-white">Make a free account</strong> to save your scores and climb the global leaderboards.
          </p>
          <div className="flex shrink-0 gap-2">
            <Link href="/login?next=/games" className="btn-primary text-sm">Sign in</Link>
            <Link href="/login?next=/games" className="btn-ghost text-sm">Sign in</Link>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {GAMES.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className={`card-surface group relative overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:shadow-glow ${g.featured ? "sm:col-span-2" : ""}`}
          >
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${g.accent} opacity-60`} />
            <div className="relative">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-ink-900/80 text-2xl transition-transform group-hover:scale-110" aria-hidden>
                  {g.emoji}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-extrabold text-white">{g.name}</h2>
                    <span className="chip bg-ink-900/80 text-[10px] font-bold uppercase tracking-wide text-brand-300">{g.tag}</span>
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-400">{g.desc}</p>
                </div>
              </div>
              <span className="mt-3 inline-block text-sm font-semibold text-brand-400 group-hover:underline">Play →</span>
            </div>
          </Link>
        ))}
      </div>

      <AdSlot className="mt-8" height={100} />

      {/* Arcade → shop: today's best buys, while they're here */}
      {deals.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-white">💸 Between games: today&apos;s best buys</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Real {info.adjective} cards trading furthest below their recent high — the games run on these prices.
              </p>
            </div>
            <Link href="/movers" className="btn-ghost shrink-0 text-xs">All movers →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {deals.map((m) => (
              <Link key={m.card.id} href={cardHref(m.card)} className="card-surface group p-2.5 transition-all hover:-translate-y-0.5 hover:shadow-glow">
                {m.card.imageThumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.card.imageThumbUrl} alt={cardImageAlt(m.card)} width={300} height={420} loading="lazy" decoding="async" className="aspect-[5/7] w-full rounded-md object-cover" />
                )}
                <div className="mt-2 truncate text-xs font-semibold text-white" title={m.card.name}>{m.card.name}</div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-extrabold text-accent">{formatMoney(m.nowCents, info.currency)}</span>
                  <span className="text-[11px] font-bold text-brand-400">▼{Math.abs(Math.round(m.pct))}%</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="mt-8 text-center text-xs text-slate-600">
        Got an idea for a game? Tell us via the <Link href="/contact" className="text-brand-400 hover:underline">contact form</Link>.
      </p>
    </div>
  );
}
