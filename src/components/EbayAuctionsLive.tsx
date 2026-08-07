"use client";

import { useEffect, useState } from "react";
import { OutboundLink } from "./OutboundLink";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { useCountry } from "./CountryProvider";
import { formatMoney } from "@/lib/format";

// A live eBay auction, serialized for the client. `endsAt` is an ISO string
// because a Date cannot cross the server/client boundary.
export interface AuctionRow {
  itemId: string;
  cardId: string;
  country: string;
  currentBidCents: number;
  bidCount: number;
  buyItNowCents: number | null;
  currency: string;
  endsAt: string;
  url: string;
  title: string;
  imageUrl: string | null;
  isGraded: boolean;
  /** Card name, for surfaces listing auctions across several cards. */
  cardName?: string;
  /** Cheapest tracked Buy It Now for this card in this market, in the SAME
   *  currency. null when we have no live price to compare against. */
  marketCents: number | null;
}

/**
 * Live auctions on chase-tier cards.
 *
 * THIS IS NOT A PRICE LIST, and the whole component is shaped by that. A current
 * bid is not something you can pay — it is the state of an open contest — so
 * nothing here is presented as "cheaper", nothing is ranked against store
 * prices, and this never appears inside the comparison table. See the
 * EbayAuction model comment for what a bid leaking into RetailerPrice would do.
 *
 * What it IS: the one number nobody else can show. eBay knows the bid; we know
 * the cheapest Buy It Now across every store we track. Putting them side by side
 * — "bid at 51% of market, 5h left" — is the site's actual product (comparison)
 * applied to a surface that has none, rather than an ad bolted onto a page.
 */
export function EbayAuctionsLive({
  auctions,
  heading = "Live auctions",
  showCardName = false,
  className,
  bare,
}: {
  auctions: AuctionRow[];
  heading?: string;
  showCardName?: boolean;
  className?: string;
  // Render the list alone — no card surface, no header, no disclosure — for use
  // inside a tab panel that already provides all three (EbayCardPanelLive).
  // A card-within-a-card reads as a nesting mistake.
  bare?: boolean;
}) {
  const { country } = useCountry();

  // Re-render once a minute so every countdown stays honest and a listing that
  // closes while the page is open disappears on its own. A minute is the right
  // grain: the labels are "4h left" / "12m left", so a faster tick would just
  // burn renders to redraw identical text.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Mount gate. The server renders this into ISR-cached HTML, so any elapsed
  // time computed during SSR is frozen at build time and would disagree with the
  // first client render — a guaranteed hydration mismatch on every view. Same
  // reason CardMarketSection defers its "updated 47m ago" line.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The staleness guard, on the read side as well as the write side. The
  // importer sweeps ended auctions, but between passes an auction WILL close
  // while rows still exist — and an affiliate link to a closed auction is worse
  // than showing nothing, because it claims to be live.
  const live = auctions
    .filter((a) => a.country === country)
    .filter((a) => new Date(a.endsAt).getTime() > now)
    .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());

  if (!mounted || live.length === 0) return null;

  // A plain element, NOT a component defined in the render body. Declaring a
  // component inline gives it a new identity on every render, so React unmounts
  // and remounts the whole subtree — and this component re-renders every 60s to
  // tick the countdowns, which would restart image loads and drop focus once a
  // minute. The wrapper is chosen at the JSX level instead.
  const body = (
    <>
      {!bare && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 bg-ink-950/60 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-white">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e5484d] opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#e5484d]" />
            </span>
            {heading}
          </h2>
          <span className="text-[11px] text-slate-500">Bids, not fixed prices — the price can still rise</span>
        </div>
      )}
      {bare && (
        // The tab names the section, but the caveat still has to be stated —
        // a bid is not a price, and that is the one thing a reader must not
        // misread here.
        <p className="mb-2 text-[11px] text-slate-500">
          Bids, not fixed prices — the price can still rise.
        </p>
      )}

      <ul className="divide-y divide-ink-800">
        {live.map((a) => {
          const endsIn = new Date(a.endsAt).getTime() - now;
          // Both figures are this market's own: the bid comes from that
          // marketplace and marketCents from that market's price column, so they
          // share a currency by construction. Only presence needs checking.
          const pct =
            a.marketCents != null && a.marketCents > 0
              ? Math.round((a.currentBidCents / a.marketCents) * 100)
              : null;
          return (
            <li key={`${a.country}-${a.itemId}`}>
              <OutboundLink
                href={a.url}
                retailer="ebay_auction"
                country={country}
                className={`group flex items-center gap-3 py-3 transition-colors hover:bg-ink-800 ${bare ? "" : "px-4"}`}
              >
                {a.imageUrl && (
                  // Arbitrary eBay CDN hosts, so a plain lazy <img> rather than
                  // next/image (each host would need allow-listing).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-14 w-11 shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {showCardName && a.cardName && (
                      <span className="truncate text-sm font-semibold text-white">{a.cardName}</span>
                    )}
                    {a.isGraded && (
                      // Worth its own badge: no tracked store lists graded
                      // copies, so for these eBay is not a cheaper option, it is
                      // the only market that exists.
                      <span className="chip bg-gold/20 text-[10px] font-bold uppercase tracking-wide text-gold">
                        Graded
                      </span>
                    )}
                    <span className={`chip text-[10px] font-bold uppercase tracking-wide ${urgencyClass(endsIn)}`}>
                      {formatTimeLeft(endsIn)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="num text-base font-extrabold text-white">
                      {formatMoney(a.currentBidCents, a.currency)}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      current bid · {a.bidCount} {a.bidCount === 1 ? "bid" : "bids"}
                    </span>
                  </div>
                  {/* The reason this component earns its place. */}
                  {pct != null && (
                    <div className="mt-0.5 text-[11px]">
                      <span className={pct < 100 ? "font-semibold text-brand-400" : "text-slate-500"}>
                        {pct}% of the cheapest Buy It Now
                      </span>
                      <span className="text-slate-600"> ({formatMoney(a.marketCents as number, a.currency)})</span>
                    </div>
                  )}
                  {a.buyItNowCents != null && (
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      or buy now for{" "}
                      <span className="num font-semibold text-slate-300">
                        {formatMoney(a.buyItNowCents, a.currency)}
                      </span>
                    </div>
                  )}
                </div>
                <span className="shrink-0 rounded-lg bg-[#0064d2] px-3 py-1.5 text-xs font-bold text-white transition-colors group-hover:bg-[#0079e6]">
                  Bid →
                </span>
              </OutboundLink>
            </li>
          );
        })}
      </ul>

      {/* Suppressed in `bare` mode ONLY because the parent panel renders one
          covering this and its sibling tabs. Never drop it without one above. */}
      {!bare && (
        <div className="border-t border-ink-800 px-4 py-2.5">
          <AffiliateDisclosure partner="ebay" tight className="mt-0" />
        </div>
      )}
    </>
  );

  return bare ? (
    <div className={className}>{body}</div>
  ) : (
    <section className={`card-surface overflow-hidden ${className ?? ""}`} aria-label={heading}>
      {body}
    </section>
  );
}

/** "4h left" / "12m left" — coarse on purpose; see the one-minute tick above. */
export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "ended";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

/** Colour carries the urgency so it reads without parsing the number. */
function urgencyClass(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 6) return "bg-[#e5484d]/20 text-[#ff7b85]";
  if (hours < 24) return "bg-gold/20 text-gold";
  return "bg-ink-800 text-slate-400";
}
