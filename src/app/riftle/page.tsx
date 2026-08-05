import type { Metadata } from "next";
import Link from "next/link";
import { Riftle } from "@/components/Riftle";
import { GameBoundary } from "@/components/GameBoundary";
import { AdSlot } from "@/components/AdSlot";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { EbayAd } from "@/components/EbayAd";
import { getCountry } from "@/lib/get-country";
import { SITE_URL } from "@/lib/site";
import { RIFTLE_ATTEMPTS } from "@/lib/riftle-shared";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { faqPage, ldJson } from "@/lib/jsonld";

const DESCRIPTION =
  "Riftle is the free daily Riftbound card guessing game — a Wordle-style puzzle for League of Legends TCG players. Guess the card of the day in 8 tries with feedback on set, domain, type, rarity, cost and might, or play endless cards in Unlimited mode.";

// ── Why this page carries entity structured data + an FAQ ────────────────────
// Search Console: "riftle" pulls 213 impressions at position ~7.2 with 0.5% CTR.
// "Riftle" is a name WE coined for this game, so sitting on page one rather than
// at the top of it means Google has not firmly tied the term to this page as an
// entity. The page itself was also thin — the playable grid plus a single "how to
// play" paragraph — which gives a crawler very little to attach the name to.
//
// Fix is the pattern that already works on the Empower guide (our best-performing
// page): name the thing plainly, answer the obvious questions in visible copy, and
// back it with matching structured data. VideoGame is the schema.org type that
// actually describes a browser game; the FAQ mirrors the visible Q&A below it
// one-for-one, which is the only form Google honours.
const FAQ = [
  {
    q: "What is Riftle?",
    a: "Riftle is a free daily card guessing game for Riftbound: League of Legends TCG. Each day it picks one mystery Riftbound card and you get 8 guesses to identify it, with Wordle-style feedback after every guess.",
  },
  {
    q: "How do you play Riftle?",
    a: "Guess any Riftbound card. After each guess Riftle compares your pick to the answer across set, domain, type, rarity, energy cost and might — green means an exact match, and arrows tell you whether the answer's cost or might is higher or lower. Use the clues to narrow it down within 8 tries.",
  },
  {
    q: "Is Riftle free?",
    a: "Yes. Riftle is completely free to play, with no account required.",
  },
  {
    q: "When does the Riftle card reset?",
    a: "A new daily card unlocks every midnight Sydney time. Everyone gets the same card each day, so you can compare your score with friends.",
  },
  {
    q: "Can I play more than one Riftle a day?",
    a: "Yes — switch to Unlimited mode from inside the game for endless random Riftbound cards with no daily limit.",
  },
];

// Dynamic share image: when a player shares their result the URL carries ?r=<n>
// (solved in n) or ?r=x (stumped), so the link unfurls with a custom OG card —
// the viral loop that brings their friends in. A plain /riftle link is unchanged.
export function generateMetadata({ searchParams }: { searchParams?: { r?: string } }): Metadata {
  const base: Metadata = {
    // "Riftle" leads: the query is the game's own name, so the match has to be the
    // first thing in the tag. "Free" and "Daily" are the CTR words on a game SERP.
    title: "Riftle — Free Daily Riftbound Card Guessing Game",
    description: DESCRIPTION,
    keywords: ["Riftle", "Riftbound Wordle", "Riftbound card game", "daily Riftbound puzzle", "guess the Riftbound card"],
    alternates: { canonical: "/riftle" },
  };
  const r = typeof searchParams?.r === "string" ? searchParams.r : null;
  if (!r) return base;

  const won = /^\d{1,2}$/.test(r);
  const stat = won ? `${r}/${RIFTLE_ATTEMPTS}` : `X/${RIFTLE_ATTEMPTS}`;
  const sub = won
    ? `I guessed today's Riftbound card in ${r}/${RIFTLE_ATTEMPTS}. Can you beat that?`
    : "Today's Riftbound card stumped me. Can you guess it?";
  const img = `${SITE_URL}/api/og?t=${encodeURIComponent("RIFTLE")}&s=${encodeURIComponent(stat)}&l=${encodeURIComponent(
    won ? "today's card" : "stumped"
  )}&b=${encodeURIComponent(sub)}`;

  return {
    ...base,
    openGraph: { title: "Riftle — daily Riftbound card game", description: sub, images: [{ url: img, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: "Riftle", description: sub, images: [img] },
  };
}

export default function RiftlePage() {
  const country = getCountry();

  // VideoGame is the type that actually describes a playable browser game, and
  // `name: "Riftle"` + `alternateName` is the direct entity claim on the term we
  // are trying to own. offers/price 0 states "free" in a form Google parses.
  const game = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: "Riftle",
    alternateName: ["Riftbound Wordle", "Riftle daily card game"],
    url: `${SITE_URL}/riftle`,
    description: DESCRIPTION,
    genre: ["Puzzle", "Word game", "Trading card game"],
    gamePlatform: "Web browser",
    applicationCategory: "Game",
    playMode: "SinglePlayer",
    inLanguage: "en",
    isAccessibleForFree: true,
    author: { "@id": `${SITE_URL}/#org` },
    publisher: { "@id": `${SITE_URL}/#org` },
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
    about: { "@type": "Thing", name: "Riftbound: League of Legends TCG" },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson(game, faqPage(FAQ)) }}
      />
      <Breadcrumbs trail={[{ name: "Riftle", href: "/riftle" }]} />
      {/* Contained boundary: a Riftle crash shows its message + retry in place
          instead of replacing the whole page with the route error screen. */}
      <GameBoundary>
        <Riftle />
      </GameBoundary>
      {/* Partner banners under the puzzle — the game's daily repeat visitors
          are exactly the audience these creatives convert. Both partners, not
          one: this slot ran a TCGplayer leaderboard on every game route while
          eBay had none anywhere in games, the only place on the site where one
          affiliate held an in-content surface the other was absent from. Same
          premium suppression, same self-carried disclosure, same click tracking;
          if the slot is worth a banner it is worth both. */}
      <TcgplayerAd size="leaderboard" country={country} className="mt-8" />
      <EbayAd size="leaderboard" country={country} className="mt-4" />
      <div className="mx-auto max-w-2xl">
        <AdSlot className="mt-8" height={100} />

        <section className="mt-8">
          <h2 className="text-base font-bold text-white">What is Riftle?</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            <strong className="text-slate-200">Riftle</strong> is a free daily card guessing game for{" "}
            <Link href="/browse" className="text-brand-300 underline-offset-2 hover:underline">
              Riftbound: League of Legends TCG
            </Link>
            . Think Wordle, but the answer is a Riftbound card. Every day Riftle picks one mystery card
            from the full database and gives you {RIFTLE_ATTEMPTS} guesses to find it — no account, no
            cost, one puzzle a day for everyone.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-base font-bold text-white">How to play Riftle</h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-400">
            <li>Guess any Riftbound card by name — start with one you know well.</li>
            <li>
              Riftle compares your guess to the answer across <strong className="text-slate-200">set, domain, type,
              rarity, energy cost and might</strong>. Green means an exact match on that attribute.
            </li>
            <li>Arrows on cost and might tell you whether the answer&apos;s value is higher or lower than your guess.</li>
            <li>Narrow it down and name the card within {RIFTLE_ATTEMPTS} tries. Stuck? Unlock progressive hints as you go.</li>
          </ol>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Everyone gets the same daily card, so it&apos;s a fair comparison with friends. Want more than one
            a day? Switch to <strong className="text-slate-200">Unlimited</strong> mode from inside the game for
            endless random cards.
          </p>
        </section>

        {/* Visible counterpart to the FAQPage schema above — the structured data
            must never claim a Q&A the reader cannot actually see on the page. */}
        <section className="mt-6">
          <h2 className="text-base font-bold text-white">Riftle FAQ</h2>
          <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-400">
            {FAQ.map((f) => (
              <p key={f.q}>
                <strong className="text-slate-200">{f.q}</strong> {f.a}
              </p>
            ))}
          </div>
        </section>

        <section className="mt-6 border-t border-ink-800 pt-5">
          <h2 className="text-base font-bold text-white">More Riftbound games &amp; tools</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/games" className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">All Riftbound games →</Link>
            <Link href="/browse" className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">Card database →</Link>
            <Link href="/sets/vendetta/gallery" className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500">Vendetta card gallery →</Link>
          </div>
        </section>
      </div>
    </>
  );
}
