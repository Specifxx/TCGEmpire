"use client";

import { useEffect, useMemo, useState } from "react";
import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { formatMoney, timeAgo } from "@/lib/format";
import { ebayImg, ebaySrcSet } from "@/lib/ebay";
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
//
// TILES, NOT ROWS (2026-09-16, owner's call: "make the auctions a tiled format
// like the database"). Same grid as /browse — grid-cols-2 on a phone,
// sm:grid-cols-3, then from lg as many 10.5rem-minimum columns as the width
// holds (auto-fill, 2026-09-23) — so the two surfaces read as one site. Inside
// this page's max-w-4xl that is 3 columns at 1024-1039 and 4 from 1040 up (was
// 4, then 5 from 1280). See AuctionTile below for the one place it
// deliberately differs from CardTile.

/** Bids that mean a lot is genuinely being contested rather than sitting at its
 *  opening price. Five is a judgement call, not a measurement — it is the point
 *  at which a listing has a real auction happening on it rather than one
 *  speculative early bid. */
const HOT_BID_COUNT = 5;

/** Under this much time left, the countdown turns urgent. */
const CLOSING_SOON_MS = 60 * 60 * 1000;

type SortKey = "ending" | "bids" | "bid-desc" | "bid-asc";
type GradeKey = "all" | "graded" | "raw";
/** Minimum bid count. Named rather than a bare number so the chip labels and
 *  the filter can never disagree about what "contested" means. */
type BidsKey = "any" | "one" | "two" | "hot";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "ending", label: "Ending soonest" },
  { key: "bids", label: "Most bids" },
  { key: "bid-desc", label: "Highest bid" },
  { key: "bid-asc", label: "Lowest bid" },
];

const GRADES: { key: GradeKey; label: string }[] = [
  { key: "all", label: "All lots" },
  { key: "graded", label: "Graded slabs" },
  { key: "raw", label: "Ungraded" },
];

// "More than 1 bid" was the owner's own example of a filter worth having, and it
// is the useful one: a single bid is often the seller's own opening price being
// met once, while two or more means somebody is actually competing.
//
// The labels are terse ("1+", not "1+ bid") because there are now three chip
// groups above the grid, and at 393px the verbose set pushed the first lot
// entirely below the fold. The visible "Bids" prefix beside them carries the
// meaning, and each chip still has a full aria-label for anyone who cannot see
// that prefix.
const BIDS: { key: BidsKey; label: string; aria: string; min: number }[] = [
  { key: "any", label: "Any", aria: "Any number of bids", min: 0 },
  { key: "one", label: "1+", aria: "At least 1 bid", min: 1 },
  { key: "two", label: "2+", aria: "More than 1 bid", min: 2 },
  { key: "hot", label: `${HOT_BID_COUNT}+`, aria: `At least ${HOT_BID_COUNT} bids`, min: HOT_BID_COUNT },
];

function Chip({
  active,
  onClick,
  children,
  tone = "brand",
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "brand" | "neutral";
  /** For a chip whose visible label is terse ("2+") and only reads as a filter
   *  next to the group's own prefix. */
  ariaLabel?: string;
}) {
  const on =
    tone === "brand"
      ? "border-brand-500 bg-brand-500/15 text-brand-200"
      : "border-slate-500 bg-ink-800 text-slate-100";
  // min-h-11 sm:min-h-8 (2026-09-23): 32px was under the phone touch floor on
  // all 11 chips. The site's `min-h-11 sm:min-h-*` convention: 44px, 48px on a
  // coarse pointer, and the unchanged 32px from sm up with a MOUSE only: a bare
  // sm:min-h-8 is emitted after the coarse 48px rule and cancelled it on touch
  // tablets, so the reset is scoped to pointer:fine (2026-09-23).
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`chip min-h-11 sm:[@media(pointer:fine)]:min-h-8 border px-2.5 py-1 text-xs font-semibold transition-colors ${
        active ? on : "border-ink-700 text-slate-400 hover:border-ink-600 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

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

function AuctionTile({
  row,
  market,
  index,
  remaining,
}: {
  row: AuctionRow;
  market: string;
  index: number;
  /** null until the clock starts; see the `now` note in AuctionsBoard. */
  remaining: number | null;
}) {
  const closingSoon = remaining != null && remaining <= CLOSING_SOON_MS;
  const grade = gradeLabel(row);
  return (
    <OutboundLink
      href={row.url}
      retailer="ebay_auction"
      country={market}
      price={row.currentBidCents}
      positionInList={index}
      pageType="auctions"
      className="group card-surface flex h-full flex-col overflow-hidden transition-[transform,box-shadow,border-color] duration-base ease-out motion-safe:hover:-translate-y-0.5 hover:border-ink-600 hover:shadow-glow active:translate-y-0"
    >
      {/* Same aspect-[5/7] box as CardTile, so a row of auction tiles lines up
          with a row of database tiles. ONE deliberate difference: object-contain
          rather than cover. A CardTile shows our own uniform card scan, which
          crops safely; this shows a seller's photo, where cropping can cut off
          the grading label or the very corner wear someone is bidding against.
          Letterboxing an odd-shaped photo is the honest trade. */}
      <div className="relative aspect-[5/7] w-full shrink-0 overflow-hidden bg-ink-900 p-2">
        {row.imageUrl ? (
          // Arbitrary eBay CDN hosts, so a plain lazy <img> rather than
          // next/image — the same call EbayPicksLive makes for the same reason.
          // srcSet (2026-09-23): the API's s-l225 is 169px wide and was upscaled
          // to 173-239px. sizes follows the auto-fill grid in the 896px cap, with
          // the p-2 box: ~vw/2-40 on phones, ~29vw at sm, 208px at most from lg.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ebayImg(row.imageUrl, 300)}
            srcSet={ebaySrcSet(row.imageUrl)}
            sizes="(min-width:1024px) 208px, (min-width:640px) 30vw, 45vw"
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-full w-full object-contain transition-transform duration-slow ease-out motion-safe:group-hover:scale-[1.03]"
          />
        ) : (
          <span className="grid h-full w-full place-items-center">
            <span className="rb-eyebrow text-[9px] text-slate-700">No photo</span>
          </span>
        )}
        {/* Opaque ink-950/85 backing, matching the clock chip's (2026-09-23): on
            a 15%-alpha fill a slab's red label struck through "PSA 10" and "HOT"
            sat on white label print (~1.5:1 in light). The ring keeps the hue. */}
        <span className="absolute left-1.5 top-1.5 z-20 flex flex-col items-start gap-1">
          {grade && (
            <span className="chip bg-ink-950/85 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide text-gold ring-1 ring-gold/40">
              {grade}
            </span>
          )}
          {row.bidCount >= HOT_BID_COUNT && (
            <span className="chip bg-ink-950/85 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide text-up ring-1 ring-up/40">
              Hot
            </span>
          )}
        </span>
        {/* The clock sits ON the photo, bottom-right: it is the one number this
            page exists for, and in a grid it has to survive being scanned at a
            glance rather than read row by row. */}
        <span
          className={`absolute bottom-1.5 right-1.5 z-20 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
            closingSoon ? "bg-ink-950/85 text-down" : "bg-ink-950/75 text-slate-200"
          }`}
        >
          <time dateTime={row.endsAt}>{remaining == null ? endLabelUtc(row.endsAt) : timeLeft(remaining)}</time>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 border-t border-ink-700 p-2.5">
        <h3 className="line-clamp-2 text-xs font-semibold leading-snug text-white" title={row.title}>
          {row.title}
        </h3>
        {/* STACKED, not a justify-between row. Side by side, "US$2,199.00" plus
            "BIN US$2,499.00" overflows a 2-column phone tile (and a 5-column
            desktop one) and the BIN price gets clipped at the tile edge —
            measured at 393px before this was changed. Stacking costs one short
            line and can never clip at any column count. */}
        <div className="mt-auto pt-1">
          {/* "Bid at last check", never "current bid": the sweep runs every 4
              hours and the page is cached for 30 minutes, so this can be ~4.5h
              old — worst in the final hour, when bidding moves fastest. The age
              is client-only (`remaining` is null until mounted), the same
              hydration rule as the countdown. */}
          <span className="block text-[10px] text-slate-500">
            Bid at last check
            {remaining != null && row.checkedAt ? <> · {timeAgo(row.checkedAt)}</> : null}
          </span>
          <span className="block text-[10px] text-slate-500">
            {row.bidCount} {row.bidCount === 1 ? "bid" : "bids"}
          </span>
          <span className="block text-sm font-bold text-accent">
            {formatMoney(row.currentBidCents, row.currency)}
          </span>
          {row.buyItNowCents != null && (
            <span className="block truncate text-[10px] font-semibold text-slate-500">
              BIN {formatMoney(row.buyItNowCents, row.currency)}
            </span>
          )}
        </div>
      </div>
    </OutboundLink>
  );
}

export function AuctionsBoard({
  rows,
  market,
  windowHours,
  minUsd,
}: {
  rows: AuctionRow[];
  market: string;
  windowHours: number;
  /** The board's floor in whole USD — shown so an empty board explains itself
   *  rather than reading as "eBay has no Riftbound auctions". */
  minUsd: number;
}) {
  const [sort, setSort] = useState<SortKey>("ending");
  const [grade, setGrade] = useState<GradeKey>("all");
  const [bids, setBids] = useState<BidsKey>("any");
  const [closingOnly, setClosingOnly] = useState(false);
  const [binOnly, setBinOnly] = useState(false);
  // null until mounted: the first render must match the server's, so the clock
  // starts in an effect rather than during render. See endLabelUtc above.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const minBids = BIDS.find((b) => b.key === bids)?.min ?? 0;

  const visible = useMemo(() => {
    // Before the clock starts, show the server's payload in the server's order —
    // it was already filtered to live lots when the page was cached.
    const live = now == null ? rows : rows.filter((r) => new Date(r.endsAt).getTime() > now);
    const filtered = live.filter((r) => {
      if (grade === "graded" && r.grader == null) return false;
      if (grade === "raw" && r.grader != null) return false;
      if (r.bidCount < minBids) return false;
      if (binOnly && r.buyItNowCents == null) return false;
      // Only applicable once the clock is running; before that every lot passes,
      // which keeps the pre-hydration render identical to the server's.
      if (closingOnly && now != null && new Date(r.endsAt).getTime() - now > CLOSING_SOON_MS) return false;
      return true;
    });
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
  }, [rows, now, grade, minBids, binOnly, closingOnly, sort]);

  const anyFilter = grade !== "all" || bids !== "any" || closingOnly || binOnly;

  if (rows.length === 0) {
    return (
      <div className="card-surface grid place-items-center p-12 text-center">
        <div>
          <p className="text-base font-semibold text-white">
            Nothing above US${minUsd} closing in the next {windowHours} hours
          </p>
          {/* Says WHY, not just "nothing here". This board is deliberately
              narrow — high-value lots, closing today — so an empty state that
              read as "eBay has no Riftbound auctions" would be plainly false
              and would send people away thinking the page was broken. */}
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-400">
            This board only shows lots whose bidding has already passed{" "}
            <strong className="text-slate-300">US${minUsd}</strong> and that close within{" "}
            <strong className="text-slate-300">{windowHours} hours</strong> — the chase end of the market,
            where the clock actually matters. Days go by without one, especially outside the US. There are
            plenty of cheaper Riftbound auctions running; they just aren&rsquo;t what this page is for.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sort auctions">
          {SORTS.map((s) => (
            <Chip key={s.key} active={sort === s.key} onClick={() => setSort(s.key)}>
              {s.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter auctions">
          {GRADES.map((g) => (
            <Chip key={g.key} tone="neutral" active={grade === g.key} onClick={() => setGrade(g.key)}>
              {g.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by bid activity">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Bids</span>
          {BIDS.map((b) => (
            <Chip
              key={b.key}
              tone="neutral"
              active={bids === b.key}
              onClick={() => setBids(b.key)}
              ariaLabel={b.aria}
            >
              {b.label}
            </Chip>
          ))}
          <Chip tone="neutral" active={closingOnly} onClick={() => setClosingOnly((v) => !v)} ariaLabel="Only lots closing within the hour">
            &lt; 1h left
          </Chip>
          <Chip tone="neutral" active={binOnly} onClick={() => setBinOnly((v) => !v)} ariaLabel="Only lots that also have a Buy It Now price">
            Buy It Now
          </Chip>
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        {anyFilter ? `${visible.length} of ${rows.length}` : visible.length} live{" "}
        {visible.length === 1 ? "lot" : "lots"}
      </p>

      {visible.length === 0 ? (
        <div className="card-surface p-8 text-center text-sm text-slate-400">
          <p>No lot matches every filter right now.</p>
          <button
            type="button"
            onClick={() => {
              setGrade("all");
              setBids("any");
              setClosingOnly(false);
              setBinOnly(false);
            }}
            className="mt-2 text-xs font-semibold text-brand-400 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        // The database's own grid (src/app/browse/page.tsx), verbatim — the point
        // of the change was that the two surfaces should look like one site.
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
          {visible.map((row, i) => (
            <AuctionTile
              key={row.itemId}
              row={row}
              market={market}
              index={i}
              remaining={now == null ? null : new Date(row.endsAt).getTime() - now}
            />
          ))}
        </div>
      )}

      {/* Bids are stored and shown in the marketplace's own currency, never
          converted — a bid converted at import time is wrong by the time anyone
          reads it, and the symbol (US$/A$/£…) already says which market it is. */}
      <p className="mt-3 text-[11px] text-slate-500">
        Bids are shown in each eBay marketplace&rsquo;s own currency, exactly as eBay reports them.
      </p>

      <AffiliateDisclosure partner="ebay" />
    </div>
  );
}
