import type { Metadata } from "next";
import Link from "next/link";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "@/lib/country";
import { MarketSwitcher } from "@/components/MarketSwitcher";
import { AuctionsBoard } from "@/components/AuctionsBoard";
import { AdSlot } from "@/components/AdSlot";
import {
  getLiveAuctions,
  AUCTION_ROW_CAP,
  AUCTION_WINDOW_HOURS,
  AUCTION_MIN_USD_CENTS,
} from "@/lib/ebay-auctions";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";

// /auctions — every live Riftbound auction on eBay, soonest-ending first.
//
// ISR at 30 minutes, which is the whole trick to making this page cheap. The
// countdown people come here for ticks CLIENT-side (AuctionsBoard), so the
// freshness the page needs and the freshness the database pays for are two
// different things. Going lower would drag every query on this route segment to
// that cadence — egress rule 5 in lib/db.ts, the one that cost five database
// projects — and buy nothing the clock doesn't already give for free.
//
// The sweep that fills the table runs every 4 hours
// (.github/workflows/refresh-auctions.yml), so a lot appears here within a few
// hours of being listed and its clock is exact from the moment it does.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: { absolute: "Riftbound Chase Auctions Closing Today | RiftCompare" },
  description:
    "High-value Riftbound auctions on eBay closing within 24 hours — every lot already bid past US$500, sorted by ending soonest, with current bid, bid count and a live countdown.",
  keywords: [
    "Riftbound auctions",
    "Riftbound eBay auctions",
    "Riftbound cards ending soon",
    "Riftbound PSA auction",
    "expensive Riftbound cards",
    "Riftbound signature auction",
  ],
  alternates: pageAlternates("/auctions"),
  openGraph: {
    title: "Live Riftbound eBay Auctions — Ending Soonest",
    description: "Current bid, bid count and a live countdown on every live Riftbound auction.",
    url: `${SITE_URL}/auctions`,
  },
};

function parseMarket(v?: string): Country {
  const up = (v ?? "").toUpperCase();
  return up in COUNTRIES ? (up as Country) : DEFAULT_COUNTRY;
}

export default async function AuctionsPage({ searchParams }: { searchParams: { market?: string } }) {
  const market = parseMarket(searchParams.market);
  const rows = await getLiveAuctions(market);
  const info = COUNTRIES[market];
  const minUsd = Math.round(AUCTION_MIN_USD_CENTS / 100);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Auctions", item: `${SITE_URL}/auctions` },
    ],
  };
  // An ItemList of what is actually rendered, same as the homepage's own
  // popular-cards list. No Offer/AggregateOffer markup on purpose: these are
  // third-party auctions whose price changes by the minute and whose seller is
  // not us, so a structured price here would be stale and ours to answer for.
  const listLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Riftbound eBay auctions closing within ${AUCTION_WINDOW_HOURS}h (${info.label})`,
    url: `${SITE_URL}/auctions`,
    numberOfItems: rows.length,
    itemListElement: rows.slice(0, 25).map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: r.title,
      url: r.url,
    })),
  };

  return (
    <div className="mx-auto max-w-4xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, listLd]) }}
      />

      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Auctions</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Chase Auctions Closing Today</h1>
          <MarketSwitcher value={market} basePath="/auctions" label="Choose the eBay market to show auctions from" />
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          The high-value end of <strong className="text-slate-200">eBay {info.label}</strong> — Riftbound lots
          already bid past <strong className="text-slate-200">US${minUsd}</strong> and closing within{" "}
          <strong className="text-slate-200">{AUCTION_WINDOW_HOURS} hours</strong>, soonest first. Current bid, how
          many bids it has drawn, and a countdown that ticks in real time. Graded slabs and raw singles together;
          filter to either below.
        </p>
      </div>

      <AuctionsBoard rows={rows} market={market} windowHours={AUCTION_WINDOW_HOURS} minUsd={minUsd} />

      <AdSlot className="mt-6" height={100} />

      <section className="card-surface mt-6 p-5">
        <h2 className="font-bold text-white">How this board works</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {SITE_NAME} sweeps eBay&rsquo;s own auction listings for each market every few hours and keeps the ones
          that matter here, so you can watch the serious lots close without re-running the same search on eBay all
          day. Every lot links straight to the listing — bidding, payment and postage all happen there, and{" "}
          {SITE_NAME} is never the seller.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          <strong className="text-slate-200">Two filters define this page.</strong> A lot has to be closing within{" "}
          {AUCTION_WINDOW_HOURS} hours, and its bidding has to have already passed US${minUsd} (checked in each
          market&rsquo;s own currency, so roughly A$750 or £395). That is deliberate: the countdown is only
          interesting while there is still time to act, and the lots worth watching this closely are the
          signatures, over-numbered prints and graded slabs at the top of the market. One consequence worth
          knowing — because the bar is the <em>current bid</em>, a chase card that opened at a dollar only appears
          once bidding has carried it past the floor. This is a board of what is already hot, not a way to find
          something nobody has noticed yet.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          <strong className="text-slate-200">Bids are shown in the marketplace&rsquo;s own currency</strong> and
          are never converted: an exchange rate applied when we imported the lot would already be wrong by the
          time you read it. The countdown runs in your browser off eBay&rsquo;s stated end time, so it stays
          accurate to the second even though the page itself is cached. A lot that closes while you have the page
          open drops off the board rather than sitting there looking live.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Two honest limits. This shows up to {AUCTION_ROW_CAP} lots per market, so a very busy day can have a
          tail this page doesn&rsquo;t show. And a lot that crossed the floor in the last few hours may not have
          been swept yet — the board is a few hours fresh, not instant. If you are chasing one specific card, a{" "}
          <Link href="/browse" className="text-brand-400 hover:underline">
            price comparison across every tracked store
          </Link>{" "}
          is usually the better tool — and if you are on the other side of the table,{" "}
          <Link href="/blog/how-to-sell-riftbound-cards" className="text-brand-400 hover:underline">
            how to sell Riftbound cards for the best price
          </Link>{" "}
          covers when an auction beats a fixed-price listing.
        </p>
      </section>
    </div>
  );
}
