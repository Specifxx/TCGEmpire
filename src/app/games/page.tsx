import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPriceMovers } from "@/lib/price-history";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";
import { cardImageAlt } from "@/lib/image-alt";
import { pageAlternates } from "@/lib/seo";
import { NavIcon } from "@/components/NavIcon";
import { cardThumbProps } from "@/lib/card-image-url";

export const metadata: Metadata = {
  title: "Riftbound Games — Free Daily Puzzles & Arcade",
  description:
    "Free Riftbound mini-games: Seraphine's Piano (a Radiance rhythm game), Riftle (the daily guess-the-card puzzle), a pack opening simulator, Card Smash, Higher or Lower with live card prices, Price Check and the Zoomed In art quiz. No signup.",
  keywords: [
    "Riftbound games",
    "Riftle",
    "Riftbound pack simulator",
    "Riftbound daily game",
    "card price game",
    "higher or lower TCG",
    "Riftbound quiz",
    "Seraphine's Piano",
    "Riftbound rhythm game",
  ],
  alternates: pageAlternates("/games"),
  openGraph: {
    title: "Riftbound Games — Free Daily Puzzles & Arcade | RiftCompare",
    description:
      "Seraphine's Piano, Riftle, Higher or Lower, Price Check, Zoomed In and more — free Riftbound mini-games built on live card data.",
    url: `${SITE_URL}/games`,
  },
};

// The arcade shelf. Riftle headlines (it's the daily habit); the rest are
// endless replays. Every game is built on the live card database, so each one
// quietly teaches the card pool and market prices.
const GAMES = [
  {
    href: "/riftle",
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
    name: "Pack Opening Simulator",
    tag: "Rip packs",
    desc: "Open virtual Riftbound packs dealt to Riot's real 14-card pack structure, from the actual card pool, with a live price on every pull.",
    accent: "from-emerald-500/20 to-ink-850",
    featured: true,
  },
  {
    // The one MULTIPLAYER game on the shelf, and the only one where the price
    // knowledge the rest of the arcade teaches is played AGAINST other people —
    // so it gets the third wide tile, right under the two daily habits.
    href: "/games/sealed-bid",
    name: "Sealed Bid",
    tag: "NEW · Multiplayer 2–6",
    desc: "The blind auction where nobody sees the price. Real cards, live prices hidden, one sealed bid a round — outguess your friends and build the richest vault.",
    accent: "from-amber-500/25 to-ink-850",
    featured: true,
  },
  {
    href: "/games/higher-lower",
    name: "Higher or Lower",
    tag: "Streak",
    desc: "Which card costs more? Live prices, one mistake ends the run. How long can you last?",
    accent: "from-gold/25 to-ink-850",
  },
  {
    href: "/games/price-check",
    name: "Price Check",
    tag: "5 rounds",
    desc: "The Price Is Right, for Riftbound: guess each card's market price, score by closeness.",
    accent: "from-rose-500/20 to-ink-850",
  },
  {
    href: "/games/zoomed",
    name: "Zoomed In",
    tag: "Art quiz",
    desc: "Name the card from a tiny patch of its art. Zoom out once if you must — at half points.",
    accent: "from-purple-500/20 to-ink-850",
  },
  {
    href: "/games/card-smash",
    name: "Card Smash",
    tag: "Reflex",
    desc: "Whack-a-mole with cards: tap them as they pop, dodge the bombs, beat the clock. Pricier cards score more.",
    accent: "from-orange-500/20 to-ink-850",
  },
];

// The spotlight (2026-10-16): Seraphine's Piano, the Radiance rhythm game, gets
// its own animated banner above the shelf instead of a tile in it. It replaced
// Card Rain and Pairs, the two least played games (DECISIONS.md, "Seraphine's Piano").
const SPOTLIGHT = {
  href: "/games/seraphines-piano",
  name: "Seraphine's Piano",
  tag: "New · Rhythm",
  desc: "A Riftbound: Radiance rhythm game. Hit the falling notes to play Seraphine's melody, charge an Encore for double points, and climb the leaderboard on three songs.",
};
const SPOTLIGHT_ART = [
  "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/ef6f277389bbb6361ef29a0332cd2cb34d4905aa-744x1039.png?accountingTag=RB",
  "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/88f6970ac5639bdd47552befcb575a6f73c6dcdb-744x1039.png?accountingTag=RB",
];

export default async function GamesPage() {
  const user = await getCurrentUser();
  // The bridge from the arcade to the shop: today's best-value cards (furthest
  // below their recent high), in the visitor's market. Same cached movers data
  // the homepage uses, so this costs nothing extra.
  const country = getCountry();
  const info = COUNTRIES[country];
  // getPriceMovers caches itself (week-keyed, shared across every page that
  // reads it). It used to be wrapped in a second unstable_cache here, which in
  // Next.js 14.2 DISABLES the inner one — so this dynamic page re-ran the
  // whole-market history read every ten minutes per market instead of never.
  const deals = (await getPriceMovers(country, 6)).value.slice(0, 6);
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
      "Free Riftbound mini-games built on live card data — Seraphine's Piano, Riftle, Higher or Lower, Price Check, Zoomed In, Pack Opening Simulator and Card Smash.",
    url: `${SITE_URL}/games`,
      // Edges back to the site-level graph in app/layout.tsx. Without them this
      // node is an island and the Organization/WebSite entity signals — sameAs,
      // areaServed, knowsAbout — don't propagate to the page.
      isPartOf: { "@id": `${SITE_URL}/#website` },
      publisher: { "@id": `${SITE_URL}/#org` },
    numberOfItems: GAMES.length + 1,
    itemListElement: [SPOTLIGHT, ...GAMES].map((g, i) => ({
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
        <h1 className="flex items-center justify-center gap-2 font-display text-3xl font-extrabold text-white">
          <NavIcon name="games" className="h-7 w-7 text-brand-400" />
          Riftbound Games
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Free mini-games built on the live card database — every round secretly makes you better at
          the card pool and the market. No signup, no paywall, play forever.
        </p>
      </div>

      {/* Leaderboard / account prompt */}
      {user ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3">
          <p className="text-sm text-slate-200">
            You&apos;re signed in as <strong className="text-white">{user.displayName}</strong> — every game you finish counts toward the global leaderboards.
          </p>
        </div>
      ) : (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3">
          <p className="text-sm text-slate-200">
            <strong className="text-white">Make a free account</strong> to save your scores and climb the global leaderboards.
          </p>
          {/* Two labels for one destination (2026-09-23; it was two identical
              "Sign in" buttons): the same pair as GameResultExtras, and AuthForm
              creates the account on the spot either way. flex-wrap, not
              shrink-0: the 269px row overran the box's padding at 320, so there
              only "Sign in" drops to a second line. 344px and up is unchanged. */}
          <div className="flex flex-wrap gap-2">
            <Link href="/login?next=/games&src=games" className="btn-primary text-sm">Create free account</Link>
            <Link href="/login?next=/games&src=games" className="btn-ghost text-sm">Sign in</Link>
          </div>
        </div>
      )}

      {/* SPOTLIGHT: Seraphine's Piano */}
      <Link
        href={SPOTLIGHT.href}
        className="group relative mb-4 block overflow-hidden rounded-3xl border border-white/10 bg-[#0b0620] p-6 transition-transform duration-300 motion-safe:hover:-translate-y-0.5 sm:p-8"
      >
        <div aria-hidden className="sp-aurora pointer-events-none absolute -inset-[20%] bg-[radial-gradient(40%_40%_at_20%_40%,rgba(255,111,177,0.35),transparent_70%),radial-gradient(35%_40%_at_80%_30%,rgba(95,216,255,0.25),transparent_70%),radial-gradient(40%_40%_at_60%_90%,rgba(177,140,255,0.3),transparent_70%)]" />
        <div aria-hidden className="sp-stars pointer-events-none absolute inset-0" />
        <div className="relative flex items-center gap-6">
          <div className="min-w-0 flex-1">
            <span className="chip bg-[#ff6fb1]/20 text-[10px] font-bold uppercase tracking-wide text-[#ff9fcb]">{SPOTLIGHT.tag}</span>
            <h2 className="sp-shine mt-2 font-display text-3xl font-black sm:text-4xl">{SPOTLIGHT.name}</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-300">{SPOTLIGHT.desc}</p>
            <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#ff6fb1] to-[#b18cff] px-5 py-2 text-sm font-extrabold text-white shadow-[0_0_24px_rgba(255,111,177,0.5)] transition-transform group-hover:scale-105">
              ▶ Play now
            </span>
          </div>
          <div aria-hidden className="relative hidden h-44 w-48 shrink-0 sm:block">
            {SPOTLIGHT_ART.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt=""
                aria-hidden="true"
                width={124}
                height={173}
                loading="lazy"
                className="sp-float absolute top-0 w-[124px] rounded-xl shadow-[0_15px_40px_-10px_rgba(255,111,177,0.6)] ring-1 ring-white/20"
                style={{ left: i ? 70 : 0, top: i ? 8 : 0, animationDelay: `${i * -3}s`, ["--sp-rot" as string]: i ? "8deg" : "-8deg" }}
              />
            ))}
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {GAMES.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className={`card-surface group relative overflow-hidden p-5 transition-[transform,box-shadow,border-color] duration-base motion-safe:hover:-translate-y-0.5 hover:border-ink-600 hover:shadow-glow focus-within:border-brand-500/60 active:translate-y-0 ${g.featured ? "sm:col-span-2" : ""}`}
          >
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${g.accent} opacity-60`} />
            <div className="relative">
              <div className="flex items-center gap-3">
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

      {/* Arcade → shop: today's best buys, while they're here */}
      {deals.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-white">Between games: today&apos;s best buys</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Real {info.adjective} cards trading furthest below their recent high — the games run on these prices.
              </p>
            </div>
            <Link href="/movers" className="btn-ghost shrink-0 text-xs">All movers →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {deals.map((m) => (
              <Link key={m.card.id} href={cardHref(m.card)} className="card-surface group p-2.5 transition-[transform,box-shadow,border-color] duration-base motion-safe:hover:-translate-y-0.5 hover:border-ink-600 hover:shadow-glow focus-within:border-brand-500/60 active:translate-y-0">
                {m.card.imageThumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img {...cardThumbProps({ imageThumbUrl: m.card.imageThumbUrl }, "(max-width: 640px) 45vw, 200px")} alt={cardImageAlt(m.card)} width={300} height={420} loading="lazy" decoding="async" className="aspect-[5/7] w-full rounded-md object-cover" />
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
