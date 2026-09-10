import type { Metadata } from "next";
import Link from "next/link";
import { SealedBid } from "@/components/games/SealedBid";
import { GameBoundary } from "@/components/GameBoundary";
import { AdSlot } from "@/components/AdSlot";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { EbayAd } from "@/components/EbayAd";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getCountry } from "@/lib/get-country";
import { SITE_URL } from "@/lib/site";
import { faqPage, ldJson } from "@/lib/jsonld";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { SB } from "@/lib/sealed-bid-engine";

const TITLE = "Sealed Bid — Multiplayer Riftbound Card Auction Game";
const DESCRIPTION =
  "Sealed Bid is a free 2–6 player blind auction game built on live Riftbound card prices. Real cards go under the hammer with their market price hidden; everyone seals one bid a round, ties shatter the card, and the richest vault wins. Play with friends from any phone — no accounts needed.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "Riftbound multiplayer game",
    "Riftbound party game",
    "card auction game",
    "play Riftbound online with friends",
    "Riftbound price game",
    "Sealed Bid",
  ],
  alternates: pageAlternates("/games/sealed-bid"),
  openGraph: pageOpenGraph({
    title: TITLE,
    description: "Real Riftbound cards, prices hidden, one sealed bid a round. 2–6 players, free, no accounts.",
    url: "/games/sealed-bid",
  }),
};

// Visible copy and FAQ schema are one and the same list — structured data must
// never claim a Q&A the reader can't see on the page (same rule as /riftle).
const FAQ = [
  {
    q: "What is Sealed Bid?",
    a: `Sealed Bid is a free multiplayer auction game for Riftbound: League of Legends TCG. ${SB.MIN_PLAYERS} to ${SB.MAX_PLAYERS} players each get ${SB.START_SHARDS.toLocaleString()} Shards. Every round three real Riftbound cards are auctioned with their live market price hidden, everyone seals one bid, and after the last round each player's vault is appraised at real market value. The richest vault wins.`,
  },
  {
    q: "How do you play Sealed Bid with friends?",
    a: "One player hosts a room and gets a 6-letter code plus an invite link. Friends open the same page on any phone or computer, type the code in, and the host starts the game once everyone is in. No accounts or downloads are needed.",
  },
  {
    q: "What happens when two players bid the same amount?",
    a: "A tie for the highest bid shatters the card: nobody gets it, and every tied bidder loses half of their bid. Guessing what your rivals will bid matters as much as guessing the price.",
  },
  {
    q: "What are Appraise and Surge?",
    a: `Each player gets one of each per game. Appraise privately reveals one card's real price before you bid. Surge makes your bid count ${SB.SURGE_PCT}% higher against rivals for one round, while you still only pay what you actually bid.`,
  },
  {
    q: "How is the final score worked out?",
    a: `Every card in your vault is worth its live market price in Shards (one Shard per ten cents), plus half of any Shards you never spent, plus bonuses: ${SB.BONUS.DOMAIN_SET} for every domain you hold three or more cards of, ${SB.BONUS.RAINBOW} for holding ${SB.RAINBOW_DOMAINS} or more different domains, and ${SB.BONUS.WARBAND} if your vault's total Might reaches ${SB.WARBAND_MIGHT}.`,
  },
  {
    q: "Is Sealed Bid free?",
    a: "Yes. Sealed Bid is completely free to play. Signed-in players' totals are saved to the global leaderboard, but you can play as a guest without an account.",
  },
];

export default function SealedBidPage() {
  const country = getCountry();

  const game = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    "@id": `${SITE_URL}/games/sealed-bid#game`,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    mainEntityOfPage: `${SITE_URL}/games/sealed-bid`,
    name: "Sealed Bid",
    alternateName: ["Riftbound Sealed Bid", "Riftbound auction game"],
    url: `${SITE_URL}/games/sealed-bid`,
    description: DESCRIPTION,
    genre: ["Party game", "Auction game", "Trading card game"],
    gamePlatform: "Web browser",
    applicationCategory: "Game",
    playMode: "MultiPlayer",
    numberOfPlayers: { "@type": "QuantitativeValue", minValue: SB.MIN_PLAYERS, maxValue: SB.MAX_PLAYERS },
    inLanguage: "en",
    isAccessibleForFree: true,
    author: { "@id": `${SITE_URL}/#org` },
    publisher: { "@id": `${SITE_URL}/#org` },
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
    about: { "@type": "Thing", name: "Riftbound: League of Legends TCG" },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(game, faqPage(FAQ)) }} />
      <Breadcrumbs trail={[{ name: "Games", href: "/games" }, { name: "Sealed Bid", href: "/games/sealed-bid" }]} />
      <GameBoundary>
        <SealedBid />
      </GameBoundary>

      <TcgplayerAd size="leaderboard" country={country} className="mt-8" />
      <EbayAd size="leaderboard" country={country} className="mt-4" />

      <div className="mx-auto max-w-3xl">
        <AdSlot className="mt-8" height={100} />

        <section className="mt-8">
          <h2 className="text-base font-bold text-white">What is Sealed Bid?</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            <strong className="text-slate-200">Sealed Bid</strong> is RiftCompare&apos;s multiplayer game for{" "}
            <Link href="/browse" className="text-brand-300 underline-offset-2 hover:underline">Riftbound: League of Legends TCG</Link>
            . It turns the thing this site does all day — knowing what a card is really worth — into a blind auction
            against your friends. Every card is real, every price is the live cheapest-store price RiftCompare tracks,
            and the only thing hidden is the number. If you can tell a {"$"}40 chase card from a {"$"}4 lookalike, you
            will clean up. If you can&apos;t, you&apos;ll learn fast.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-base font-bold text-white">How to play</h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-400">
            <li>
              <strong className="text-slate-200">Host a room</strong> and send the 6-letter code or invite link to {SB.MIN_PLAYERS - 1}–{SB.MAX_PLAYERS - 1} friends. Everyone starts with {SB.START_SHARDS.toLocaleString()} Shards.
            </li>
            <li>
              Each round <strong className="text-slate-200">three cards</strong> are dealt from the live database — usually one chase card, one mid-range card and one cheap one, in a random order. You see the art, domain, rarity, type, cost and Might. You never see the price.
            </li>
            <li>
              Pick one card and <strong className="text-slate-200">seal a bid</strong> before the clock runs out. Highest bid wins the card and pays it. A tie for the top bid <strong className="text-slate-200">shatters</strong> the card — nobody gets it and each tied bidder loses half their bid.
            </li>
            <li>
              Prices are revealed after every round, so you learn what your rivals paid and whether it was a steal or a blunder.
            </li>
            <li>
              After the last round every vault is <strong className="text-slate-200">appraised at real market value</strong>. Add half your unspent Shards and any set bonuses — the richest vault wins.
            </li>
          </ol>
        </section>

        <section className="mt-6">
          <h2 className="text-base font-bold text-white">Power plays &amp; bonuses</h2>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-400">
            <li><strong className="text-slate-200">🔍 Appraise</strong> — once per game, privately see one card&apos;s real price before you bid.</li>
            <li><strong className="text-slate-200">⚡ Surge</strong> — once per game, your bid counts +{SB.SURGE_PCT}% against rivals for one round. You still only pay what you bid.</li>
            <li><strong className="text-slate-200">Domain set</strong> — +{SB.BONUS.DOMAIN_SET} for every domain you hold three or more cards of.</li>
            <li><strong className="text-slate-200">Rainbow</strong> — +{SB.BONUS.RAINBOW} for {SB.RAINBOW_DOMAINS} or more different domains in one vault.</li>
            <li><strong className="text-slate-200">Warband</strong> — +{SB.BONUS.WARBAND} when your vault&apos;s total Might reaches {SB.WARBAND_MIGHT}.</li>
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="text-base font-bold text-white">Sealed Bid FAQ</h2>
          <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-400">
            {FAQ.map((f) => (
              <p key={f.q}>
                <strong className="text-slate-200">{f.q}</strong> {f.a}
              </p>
            ))}
          </div>
        </section>

        <section className="mt-6 border-t border-ink-800 pt-5">
          <h2 className="text-base font-bold text-white">Sharpen up before you play</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            The single-player games are the training ground: <Link href="/games/higher-lower" className="text-brand-300 hover:underline">Higher or Lower</Link> and{" "}
            <Link href="/games/price-check" className="text-brand-300 hover:underline">Price Check</Link> drill the same price instincts Sealed Bid rewards, and{" "}
            <Link href="/movers" className="text-brand-300 hover:underline">today&apos;s price movers</Link> shows which cards are spiking right now. Or browse the{" "}
            <Link href="/games" className="text-brand-300 hover:underline">whole arcade</Link>.
          </p>
        </section>
      </div>
    </>
  );
}
