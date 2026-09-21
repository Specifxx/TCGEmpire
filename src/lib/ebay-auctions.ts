import { prisma } from "./db";
import { cachedOrDirect } from "./price-history";
import { CONTENT_TAG } from "./revalidate-content";
import { COUNTRY_LIST, currencyOf, type Country } from "./country";
import { usdCentsToCountry } from "./fx";
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
//   MARKETS (6) × AUCTION_PAGE_CAP (1) = 6 calls per sweep
//   6 × 6 sweeps a day (every 4h)      = 36 calls/day
//
// Under 1% of the allowance, and ~4% of what the deleted per-card pass spent
// for a countdown on 120 card pages rather than a board of every live lot.
//
// The reason the arithmetic is this different for the same feature name: a
// PRICE for a named card needs a query naming that card. A LIST of auctions
// does not, so one call at Browse's `limit` maximum of 200 returns the pool.
//
// ── WHAT THE FILTERS BELOW DO AND DO NOT SAVE (2026-09-16) ──────────────────
// The window and price floor were added on the owner's request, to "save our
// quota". Worth being exact, because the intuition does not match the billing:
// eBay charges per CALL, not per result, so asking for fewer lots does not by
// itself cost less. A call returning 4 lots and a call returning 200 cost the
// same one call.
//
// What they DO buy is the page cap: 1 instead of 2. With a 24h window and a
// $500 floor, 200 qualifying lots in a single marketplace is not a situation
// that can arise, so a second page could only ever be empty — and the sweep
// already stopped on a short page, which made the second call rare rather than
// impossible. Halving the cap halves the MODELLED worst case (72 → 36) and
// removes the tail case entirely. Real saving: a handful of calls a day.
//
// The filters' actual value is editorial, and it is the larger one: a board of
// "$500+ lots closing today" is the high-stakes end of the market, which is
// what the owner buys and what nobody else aggregates.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pages of 200 to pull per market per sweep.
 *
 * ONE, since the filters landed. `sort=endingSoonest` means page 1 is always
 * the part that matters, and with the window and floor applied a marketplace
 * cannot produce 200 qualifying lots — so page 2 is a call spent to receive
 * nothing. Raise it only alongside a much looser filter, and expect the cost
 * model in tests/affiliate-priority.test.ts to move with it.
 */
export const AUCTION_PAGE_CAP = 1;

/**
 * How far ahead the board looks. Lots ending beyond this are not fetched.
 *
 * 24h on the owner's call: the board is for auctions closing TODAY, where the
 * countdown is the point and there is still time to act. A lot ending in six
 * days is a bookmark, not a board entry — and it will arrive here on its own
 * as its clock runs down, since the sweep re-runs every four hours.
 *
 * Env-overridable, like EBAY_MIN_VALUE_USD_CENTS in price-import.ts: this is a
 * threshold someone will want to tune from a real number (how many lots the
 * board actually carries) without a deploy.
 */
export const AUCTION_WINDOW_HOURS = Number(process.env.EBAY_AUCTION_WINDOW_HOURS ?? 24);

/**
 * Minimum CURRENT BID, in USD cents, for a lot to make the board.
 *
 * $500 on the owner's call — the chase end of the market (signatures, graded
 * slabs, over-numbered prints), which is what they buy at auction and what a
 * price-comparison site has no other way to show.
 *
 * TWO CONSEQUENCES WORTH KNOWING, both inherent to filtering on price rather
 * than on the card:
 *
 *   1. It is the CURRENT BID, not the expected hammer price. A signature card
 *      opening at $1 appears only once bidding has carried it past $500 — so
 *      this board shows lots that have ALREADY attracted serious money, and
 *      cannot show a chase card that is still cheap early. That is a real
 *      trade-off: it favours "what is hot" over "what is a steal".
 *   2. It is checked per market in that market's own currency, converted
 *      through lib/fx.ts's indicative rates — so the bar is ~A$750 / ~£395 /
 *      ~S$675 / ~C$685 / ~€460. Those rates are deliberately crude (see fx.ts),
 *      which is fine for a threshold and would not be for a quoted price.
 *
 * Expect small markets to be empty most days: $500+ Riftbound auctions are a
 * US-and-sometimes-AU phenomenon. The board says so rather than looking broken.
 */
export const AUCTION_MIN_USD_CENTS = Number(process.env.EBAY_AUCTION_MIN_USD_CENTS ?? 50_000);

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

  // The $500 bar, in this marketplace's own currency. eBay's price filter is
  // evaluated in the currency you name, and every marketplace quotes its own —
  // so a bare USD figure would mean five different real thresholds. Converted
  // through the site's one indicative rate table (lib/fx.ts), same as every
  // other cross-market reference figure here.
  const currency = currencyOf(market);
  const minPriceCents = usdCentsToCountry(AUCTION_MIN_USD_CENTS, market);

  for (let page = 0; page < AUCTION_PAGE_CAP; page++) {
    if (isEbayRateLimited()) break;
    const { items, ok: pageOk } = await searchEbayAuctions({
      marketplace,
      offset: page * EBAY_MAX_LIMIT,
      limit: EBAY_MAX_LIMIT,
      endsWithinHours: AUCTION_WINDOW_HOURS,
      minPriceCents,
      currency,
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
  console.log(
    `eBay auctions: sweeping ${AUCTION_MARKETS.length} markets for lots ending within ` +
      `${AUCTION_WINDOW_HOURS}h at or above US$${(AUCTION_MIN_USD_CENTS / 100).toFixed(0)} ` +
      `(${AUCTION_PAGE_CAP} page/market max).`,
  );
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
          // Upper bound as well as lower, so the page's promise ("closing within
          // N hours") is true of the QUERY and not just of whatever the last
          // sweep happened to fetch. Without it, loosening
          // EBAY_AUCTION_WINDOW_HOURS and tightening it again would leave
          // long-dated rows showing on a board that says they cannot be there.
          where: {
            country: market,
            endsAt: { gt: new Date(), lte: new Date(Date.now() + AUCTION_WINDOW_HOURS * 3600_000) },
          },
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
