"use client";

import Link from "next/link";
import { useCountry } from "./CountryProvider";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { cardImageAlt } from "@/lib/image-alt";
import type { DemandCard } from "@/lib/demand";
import { cardThumbProps } from "@/lib/card-image-url";
import { OutboundLink } from "./OutboundLink";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { ebayLabel, ebaySearchUrl, riftboundEbayQuery } from "@/lib/affiliate";

export type MostSearchedRow = { card: DemandCard; searches: number };

// "Most searched this week" on /movers (2026-09-25) — the free top 10 of
// Demand Finder (/tools/demand, Premium), which it links to for the full
// most-searched and most-viewed lists. A viewer below Premium sees exactly
// these rows on /tools/demand too, never more (lib/demand.ts FREE_DEMAND_ROWS).
// A client island only so each row can show the visitor's own market price: the
// page itself is static and built for DEFAULT_COUNTRY, and the rows carry every
// market's price column (lib/demand.ts DEMAND_CARD_SELECT), the same way
// CardTile re-prices on the client.
export function MostSearchedStrip({ rows, coveredDays }: { rows: MostSearchedRow[]; coveredDays: number | null }) {
  const { price, fmt, country } = useCountry();
  // Old links (and the retired redirect) point at #most-searched, so the anchor
  // is always on the page — with a plain note when there is no ranking to show (a window too short
  // after a database move, or a failed read, which the ISR render keeps until
  // the next /movers regeneration — see lib/demand.ts getTopDemand).
  if (!rows.length) {
    return (
      <section id="most-searched" className="scroll-mt-header">
        <h2 className="text-xl font-extrabold text-white">Most searched this week</h2>
        <p className="mt-0.5 text-xs text-slate-500">Search counts aren&apos;t available right now. Check back after the next update.</p>
      </section>
    );
  }
  const days = coveredDays && coveredDays > 0 ? coveredDays : 7;
  return (
    <section id="most-searched" className="scroll-mt-header">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-xl font-extrabold text-white">Most searched this week</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            The cards RiftCompare visitors picked from search most often in the last {days} {days === 1 ? "day" : "days"}.
            Searches are counted worldwide, not per market, and each browser counts a card once a day.
          </p>
        </div>
        <Link href="/tools/demand" prefetch={false} className="shrink-0 text-xs font-semibold text-brand-400 hover:underline">
          Full leaderboard — Premium →
        </Link>
      </div>
      {/* Above the first eBay button, for every visitor (2026-09-27, "Popular
          pages tuned for eBay" in DECISIONS.md). */}
      <AffiliateDisclosure partner="ebay" tight />
      <ol className="card-surface grid grid-cols-1 gap-x-6 px-4 py-1 sm:grid-cols-2">
        {rows.map((r, i) => {
          const c = r.card;
          const cents = price(c);
          return (
            // Two SIBLING links (a link cannot nest another): the row to the
            // card page, and a search of the visitor's own eBay for the card —
            // this list is what people are hunting for this week, and a search
            // (never a price or a listing we do not have) is the honest link.
            <li key={c.id} className="flex items-center gap-2 border-b border-ink-800 last:border-0 sm:[&:nth-last-child(2)]:border-0">
              <Link href={cardHref(c)} prefetch={false} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 py-2 hover:bg-ink-800/50">
                <span className="num w-5 shrink-0 text-right text-xs text-slate-500">{i + 1}</span>
                <span className="h-12 w-9 shrink-0 overflow-hidden rounded bg-ink-900">
                  {c.imageThumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img {...cardThumbProps({ imageThumbUrl: c.imageThumbUrl }, "36px")} alt={cardImageAlt(c)} width={36} height={48} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{cardDisplayName(c.name, c)}</span>
                  <span className="block text-[11px] text-slate-500">
                    {c.setCode} · {c.collectorNumber} · {r.searches.toLocaleString("en-US")} {r.searches === 1 ? "search" : "searches"}
                  </span>
                </span>
                <span className="num shrink-0 whitespace-nowrap text-right text-sm font-bold text-white">
                  {cents != null ? fmt(cents) : <span className="text-xs font-normal text-slate-500">No price here</span>}
                </span>
              </Link>
              <OutboundLink
                href={ebaySearchUrl(country, riftboundEbayQuery(c.name), "movers-searched")}
                retailer="ebay_search"
                country={country}
                kind="single"
                pageType="movers"
                surface="ebay_search"
                cardId={c.id}
                cardName={c.name}
                positionInList={i + 1}
                className="btn-ebay-ghost min-h-11 shrink-0 px-2.5 text-xs"
              >
                eBay<span className="sr-only"> search for {c.name} on {ebayLabel(country)}</span>
              </OutboundLink>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
