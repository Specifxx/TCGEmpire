"use client";

import { useEffect, useMemo, useState } from "react";
import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { formatMoney } from "@/lib/format";
import type { AuctionRow } from "@/lib/ebay-auctions";

// The live auction board. Rendered on the server like any client component, so
// the lots are in the HTML for crawlers; the clock is the only thing that needs
// the browser.
//
// WHY THE COUNTDOWN IS CLIENT-SIDE AT ALL: the page is ISR at 1800s (egress rule
// 5 in lib/db.ts — a shorter cache here would drag every query on the route to
// that cadence). A server-rendered "2h 14m left" would therefore be up to half
// an hour wrong, on the one number this page exists to show. Ticking in the
// browser is the only way to be both honest and cheap.

/** Bids that mean a lot is genuinely being contested rather than sitting at its
 *  opening price. Five is a judgement call, not a measurement — it is the point
 *  at which a listing has a real auction happening on it rather than one
 *  speculative early bid. */
const HOT_BID_COUNT = 5;

/** Under this much time left, the countdown turns urgent. */
const CLOSING_SOON_MS = 60 * 60 * 1000;

type SortKey = "ending" | "bids" | "bid-desc" | "bid-asc";
type FilterKey = "all" | "graded" | "raw";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "ending", label: "Ending soonest" },
  { key: "bids", label: "Most bids" },
  { key: "bid-desc", label: "Highest bid" },
  { key: "bid-asc", label: "Lowest bid" },
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "graded", label: "Graded slabs" },
  { key: "raw", label: "Ungraded" },
];

/**
 * Absolute end time, formatted from the ISO string's own parts.
 *
 * Deterministic on purpose: this is what renders before the clock starts (and
 * in the crawler's copy), so it must be byte-identical on the server and in the
 * browser. Anything locale- or timezone-derived — toLocaleString, a bare
 * Date#getHours — differs between the two and hydration mismatches.
 */
function endLabelUtc(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return "";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}, ${m[4]}:${m[5]} UTC`;
}

/** "2d 4h", "3h 12m", "48s" — coarse at the top, precise at the wire. */
function timeLeft(ms: number): string {
  if (ms <= 0) return "Ended";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function gradeLabel(row: AuctionRow): string | null {
  if (!row.grader) return null;
  // grade null means a slab word with no number after it — say "graded" rather
  // than invent a number (same rule as parseGrade's own doc comment).
  return row.grade == null ? `${row.grader} graded` : `${row.grader} ${row.grade}`;
}

export function AuctionsBoard({ rows, market }: { rows: AuctionRow[]; market: string }) {
  const [sort, setSort] = useState<SortKey>("ending");
  const [filter, setFilter] = useState<FilterKey>("all");
  // null until mounted: the first render must match the server's, so the clock
  // starts in an effect rather than during render. See endLabelUtc above.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const visible = useMemo(() => {
    // Before the clock starts, show the server's payload in the server's order —
    // it was already filtered to live lots when the page was cached.
    const live = now == null ? rows : rows.filter((r) => new Date(r.endsAt).getTime() > now);
    const filtered = live.filter((r) =>
      filter === "all" ? true : filter === "graded" ? r.grader != null : r.grader == null,
    );
    const sorted = [...filtered];
    switch (sort) {
      case "bids":
        sorted.sort((a, b) => b.bidCount - a.bidCount || a.endsAt.localeCompare(b.endsAt));
        break;
      case "bid-desc":
        sorted.sort((a, b) => b.currentBidCents - a.currentBidCents);
        break;
      case "bid-asc":
        sorted.sort((a, b) => a.currentBidCents - b.currentBidCents);
        break;
      default:
        sorted.sort((a, b) => a.endsAt.localeCompare(b.endsAt));
    }
    return sorted;
  }, [rows, now, filter, sort]);

  const contested = visible.filter((r) => r.bidCount >= HOT_BID_COUNT).length;

  if (rows.length === 0) {
    return (
      <div className="card-surface grid place-items-center p-12 text-center">
        <div>
          <p className="text-base font-semibold text-white">No live auctions in this market right now</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-400">
            Riftbound auctions come and go in waves, and smaller eBay markets can go quiet for a day at a
            time. Try another market above — the US board is usually the busiest.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sort auctions">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              aria-pressed={sort === s.key}
              className={`chip min-h-8 px-2.5 py-1 text-xs font-semibold transition-colors ${
                sort === s.key
                  ? "border border-brand-500 bg-brand-500/15 text-brand-200"
                  : "border border-ink-700 text-slate-400 hover:border-ink-600 hover:text-slate-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter auctions">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`chip min-h-8 px-2.5 py-1 text-xs font-semibold transition-colors ${
                filter === f.key
                  ? "border border-slate-500 bg-ink-800 text-slate-100"
                  : "border border-ink-700 text-slate-400 hover:border-ink-600 hover:text-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        {visible.length} live {visible.length === 1 ? "lot" : "lots"}
        {contested > 0 && <> · {contested} with {HOT_BID_COUNT}+ bids</>}
      </p>

      {visible.length === 0 ? (
        <div className="card-surface p-8 text-center text-sm text-slate-400">
          Nothing matches that filter right now.
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((row, i) => {
            const endsMs = new Date(row.endsAt).getTime();
            const remaining = now == null ? null : endsMs - now;
            const closingSoon = remaining != null && remaining <= CLOSING_SOON_MS;
            const grade = gradeLabel(row);
            return (
              <li key={`${row.itemId}`}>
                <OutboundLink
                  href={row.url}
                  retailer="ebay_auction"
                  country={market}
                  price={row.currentBidCents}
                  positionInList={i}
                  pageType="auctions"
                  className="card-surface flex items-center gap-3 p-3 transition-colors hover:border-brand-500/60 hover:bg-ink-800 sm:gap-4"
                >
                  {/* Fixed box either way, so a listing with no image can't make
                      the row a different height than its neighbours. */}
                  <span className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-ink-900 sm:h-20 sm:w-20">
                    {row.imageUrl ? (
                      // Arbitrary eBay CDN hosts, so a plain lazy <img> rather than
                      // next/image — the same call EbayPicksLive makes for the same
                      // reason. An auction thumbnail is transient anyway (the lot is
                      // gone within days), so there is nothing to cache-optimise.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.imageUrl}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="rb-eyebrow text-[9px] text-slate-700">No image</span>
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-semibold text-white">{row.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      {grade && (
                        <span className="chip bg-gold/15 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide text-gold">
                          {grade}
                        </span>
                      )}
                      {row.bidCount >= HOT_BID_COUNT && (
                        <span className="chip bg-up/15 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide text-up">
                          Hot
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500">
                        {row.bidCount} {row.bidCount === 1 ? "bid" : "bids"}
                      </span>
                      {row.condition && <span className="text-[11px] text-slate-500">· {row.condition}</span>}
                      {row.buyItNowCents != null && (
                        <span className="text-[11px] text-slate-500">
                          · BIN {formatMoney(row.buyItNowCents, row.currency)}
                        </span>
                      )}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-extrabold text-white sm:text-base">
                      {formatMoney(row.currentBidCents, row.currency)}
                    </span>
                    <time
                      dateTime={row.endsAt}
                      className={`mt-0.5 block text-[11px] font-semibold tabular-nums ${
                        closingSoon ? "text-down" : "text-slate-400"
                      }`}
                    >
                      {remaining == null ? endLabelUtc(row.endsAt) : timeLeft(remaining)}
                    </time>
                  </span>
                </OutboundLink>
              </li>
            );
          })}
        </ul>
      )}

      {/* Bids are stored and shown in the marketplace's own currency, never
          converted — a bid converted at import time is wrong by the time anyone
          reads it, and the symbol (US$/A$/£…) already says which market it is. */}
      <p className="mt-2 text-[11px] text-slate-500">
        Bids are shown in each eBay marketplace&rsquo;s own currency, exactly as eBay reports them.
      </p>

      <AffiliateDisclosure partner="ebay" />
    </div>
  );
}
