import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Riftbound Games — Free Daily Puzzles & Arcade",
  description:
    "Free Riftbound mini-games: Riftle (the daily guess-the-card puzzle), Higher or Lower with live card prices, Price Check, the Zoomed In art quiz and Pairs memory. No signup, endlessly replayable.",
  keywords: [
    "Riftbound games",
    "Riftle",
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
];

export default function GamesPage() {
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Games", item: `${SITE_URL}/games` },
    ],
  };

  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <div className="mb-6 text-center">
        <h1 className="font-display text-3xl font-extrabold text-white">🎮 Riftbound Games</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Free mini-games built on the live card database — every round secretly makes you better at
          the card pool and the market. No signup, no paywall, play forever.
        </p>
      </div>

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

      <p className="mt-8 text-center text-xs text-slate-600">
        Got an idea for a game? Tell us via the <Link href="/contact" className="text-brand-400 hover:underline">contact form</Link>.
      </p>
    </div>
  );
}
