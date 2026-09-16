import { prisma } from "./db";
import { cachedOrDirect } from "./price-history";
import { CONTENT_TAG } from "./revalidate-content";
import { COUNTRY_LIST, type Country } from "./country";
import {
  EBAY_MARKETPLACE,
  EBAY_MAX_LIMIT,
  isEbayEnabled,
  isEbayRateLimited,
  primeEbayBudget,
  ebaySpentThisRun,
  searchEbayAuctions,
} from "./ebay";

// ─────────────────────────────────────────────────────────────────────────────
// Live eBay auctions for the whole Riftbound market — the importer and the
// loader behind /auctions.
//
// DELIBERATELY NOT IN price-import.ts. The per-card chase-auction pass that
// lived there was deleted on 2026-08-20 (~960 Browse calls/day for card-page
// countdowns, the worst value-per-call in the quota model), and
// tests/affiliate-priority.test.ts fails if `refreshEbayAuctions` or
// `prisma.ebayAuction` reappear in that file. That guard is worth keeping
// exactly as it is, so this lives in its own module and its own workflow, and
// the quota model in that same test accounts for it separately.
//
// ── THE QUOTA ARITHMETIC (the owner's actual question: does this fit?) ───────
// eBay allows 5,000 Browse calls/day; lib/ebay.ts holds back a 600 reserve, so
// ~4,400 are spendable and the price/sealed importers already use ~2,850.
//
//   MARKETS (6) × AUCTION_PAGE_CAP (2) = 12 calls per sweep, worst case
//   12 × 6 sweeps a day (every 4h)      = 72 calls/day, worst case
//
// Worst case, because pagination stops as soon as a page comes back short: the
// Riftbound auction pool is tens-to-low-hundreds of lots per marketplace, so a
// typical market costs ONE call, not two, and a quiet market costs one call and
// returns nothing. Realistic steady state is ~36-50 calls/day — under 2% of the
// allowance, and ~7% of what the deleted per-card pass spent for a countdown on
// 120 card pages rather than a board covering every live lot.
//
// The reason the arithmetic is this different for the same feature name: a
// PRICE for a named card needs a query naming that card. A LIST of auctions
// does not, so one call at Browse's `limit` maximum of 200 returns the pool.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pages of 200 to pull per market per sweep.
 *
 * Two, not more, on purpose: 400 live auctions in one marketplace is already
 * far more than the board shows or the real Riftbound pool holds, and `sort=
 * endingSoonest` means page 1 is always the part that matters — the lots
 * closest to closing. Raising this buys the tail of a list nobody scrolls to,
 * at a linear cost in quota.
 */
export const AUCTION_PAGE_CAP = 2;

/** Markets swept. Every market the site prices, so switching market on the
 *  board never lands on an empty page that looks broken. Each is ~1 call. */
export const AUCTION_MARKETS: Country[] = COUNTRY_LIST.map((c) => c.code);

/** Rows the board serves per market. A hard cap because this is a per-request
 *  read on an indexed page — egress rule 3 in lib/db.ts. */
export const AUCTION_ROW_CAP = 120;

export interface AuctionRow {
  itemId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  currentBidCents: number;
  currency: string;
  bidCount: number;
  /** ISO string, not a Date: this crosses into a client component, where a Date
   *  would be serialised anyway, and the countdown parses it once. */
  endsAt: string;
  buyItNowCents: number | null;
  condition: string | null;
  grader: string | null;
  grade: number | null;
}

// ── Importer ─────────────────────────────────────────────────────────────────

export interface AuctionSweepSummary {
  market: Country;
  found: number;
  ok: boolean;
}

/**
 * Sweep one marketplace's live auctions and reconcile them into the table.
 *
 * NEVER DELETES ON A FAILED SWEEP. `ok: false` from searchEbayAuctions means
 * "we did not get an answer" (no token, spent budget, 429, 5xx) rather than
 * "this market has no auctions", and treating the two alike would empty the
 * board every time eBay hiccuped — the same distinction searchEbayLowest's
 * `status` out-param exists for.
 */
export async function sweepAuctionMarket(market: Country): Promise<AuctionSweepSummary> {
  const marketplace = EBAY_MARKETPLACE[market];
  if (!marketplace) return { market, found: 0, ok: false };

  const seen = new Map<string, AuctionRow & { endsAtDate: Date }>();
  let ok = false;

  for (let page = 0; page < AUCTION_PAGE_CAP; page++) {
    if (isEbayRateLimited()) break;
    const { items, ok: pageOk } = await searchEbayAuctions({
      marketplace,
      offset: page * EBAY_MAX_LIMIT,
      limit: EBAY_MAX_LIMIT,
    });
    if (!pageOk) break;
    ok = true;
    for (const it of items) {
      seen.set(it.itemId, {
        itemId: it.itemId,
        title: it.title,
        url: it.url,
        imageUrl: it.imageUrl,
        currentBidCents: it.currentBidCents,
        currency: it.currency,
        bidCount: it.bidCount,
        endsAt: it.endsAt.toISOString(),
        endsAtDate: it.endsAt,
        buyItNowCents: it.buyItNowCents,
        condition: it.condition,
        grader: it.grader,
        grade: it.grade,
      });
    }
    // A short page is the last page — asking for the next one would spend a
    // call to be told the same thing.
    if (items.length < EBAY_MAX_LIMIT) break;
  }

  if (!ok) return { market, found: 0, ok: false };

  for (const row of seen.values()) {
    const data = {
      title: row.title,
      url: row.url,
      imageUrl: row.imageUrl,
      currentBidCents: row.currentBidCents,
      currency: row.currency,
      bidCount: row.bidCount,
      endsAt: row.endsAtDate,
      buyItNowCents: row.buyItNowCents,
      condition: row.condition,
      grader: row.grader,
      grade: row.grade,
    };
    await prisma.ebayAuctionListing.upsert({
      where: { itemId_country: { itemId: row.itemId, country: market } },
      create: { itemId: row.itemId, country: market, ...data },
      update: data,
    });
  }

  // Housekeeping, and the only reason this table cannot grow without bound: an
  // auction that has ended is gone for good (unlike a fixed-price listing,
  // which may simply not have sold yet), so ended rows are deleted outright
  // rather than aged out. A generous grace window keeps a just-closed lot
  // around long enough for the board to label it rather than have it vanish
  // mid-read.
  await prisma.ebayAuctionListing.deleteMany({
    where: { country: market, endsAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
  });

  return { market, found: seen.size, ok: true };
}

/** Sweep every market. Returns one summary per market for the run log. */
export async function refreshAuctions(): Promise<AuctionSweepSummary[]> {
  if (!isEbayEnabled()) {
    console.log("eBay auctions: EBAY_CLIENT_ID/SECRET not set — nothing to do.");
    return [];
  }
  await primeEbayBudget();
  const out: AuctionSweepSummary[] = [];
  for (const market of AUCTION_MARKETS) {
    if (isEbayRateLimited()) {
      console.log(`eBay auctions: budget spent — stopping before ${market}.`);
      break;
    }
    const summary = await sweepAuctionMarket(market);
    out.push(summary);
    console.log(
      `eBay auctions ${market}: ${summary.ok ? `${summary.found} live lots` : "no answer (not persisted)"}`,
    );
  }
  console.log(`eBay auctions: ${ebaySpentThisRun()} Browse calls spent this sweep.`);
  return out;
}

// ── Page loader ──────────────────────────────────────────────────────────────

/**
 * Live auctions for one market, soonest-ending first.
 *
 * `revalidate` MATCHES the page's own `export const revalidate` — never lower.
 * Egress rule 5 in lib/db.ts: an unstable_cache TTL applies to the whole route
 * segment, and a shorter one here would drag the page to that cadence. The
 * countdown's liveness comes from the client instead, which is the only place
 * a TTL cannot leak from.
 *
 * The `endsAt` floor is baked into the cached payload, so it is up to one TTL
 * stale — deliberately. AuctionsBoard re-filters on the client every second, so
 * a lot that closes inside the window is labelled ended rather than shown as
 * live, and the alternative (a fresher server filter) is exactly the
 * per-request read the egress rules exist to prevent.
 */
export function getLiveAuctions(market: Country): Promise<AuctionRow[]> {
  return cachedOrDirect(
    async () => {
      const rows = await prisma.ebayAuctionListing
        .findMany({
          where: { country: market, endsAt: { gt: new Date() } },
          orderBy: { endsAt: "asc" },
          take: AUCTION_ROW_CAP,
          select: {
            itemId: true,
            title: true,
            url: true,
            imageUrl: true,
            currentBidCents: true,
            currency: true,
            bidCount: true,
            endsAt: true,
            buyItNowCents: true,
            condition: true,
            grader: true,
            grade: true,
          },
        })
        // Fails open: a missing table (the model is new — a deploy pushes the
        // schema, see scripts/build-db-push.sh) or a DB blip renders the empty
        // state, never a 500 on an indexed page.
        .catch(() => []);
      return rows.map((r) => ({ ...r, endsAt: r.endsAt.toISOString() }));
    },
    [`ebay-auctions-${market}`],
    { revalidate: 1800, tags: [CONTENT_TAG] },
  );
}
