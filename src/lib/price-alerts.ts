import { prisma } from "./db";
import { COUNTRIES, currencyOf, pickPrice, type Country } from "./country";
import { cardHref } from "./card-url";
import { ALERT_KIND_PRIORITY, sendPriceDropEmail as sendPriceDropEmailImpl, sortAlertItems, type AlertKind, type AlertStore, type PriceDropItem } from "./email";
import { alertActionLinks } from "./alert-actions";
import { pausedAddresses } from "./alert-mute";
import { SITE_URL } from "./site";
import { notify } from "./notifications";
import { isPremium, premiumTierOf, type EntitlementUser } from "./premium";
import { targetAlertLimit } from "./alert-limits";
import { scoreVsTcg, tcgMarketFor, type TcgMarketRef } from "./arbitrage";
import { isPreorderSetCode, setByCode } from "./constants";
import { honouredTargetIds } from "./target-price";
import { affiliateUrl } from "./affiliate";
import { ADMIN_EMAILS, isAdminEmail } from "./admin-emails";
import { alertPairKey, computeAlertPrices, type AlertOffer, type AlertPrice } from "./alert-price";
import { RETAILERS } from "./retailers";
import { shippingFor } from "./shipping";
import { formatMoney } from "./format";

// ─────────────────────────────────────────────────────────────────────────────
// PRICE ALERTS — what fires, and when (rules as of 2026-09-25, DECISIONS.md
// "Price alerts fire on the price you would pay").
// ─────────────────────────────────────────────────────────────────────────────
// Every trigger reads the ALERT PRICE (lib/alert-price.ts): the cheapest
// in-stock Near-Mint (or unstated) copy at a real store, CardTrader or a real
// TCGplayer US listing, seen within 36h — never eBay, never a reference or
// cloned row. Card.lowestPriceCents* (every source, every condition) is read
// only to count `ebayOnly` pairs.
//
// FREE (anonymous and free accounts) — the "all" run, straight after the
// 07:00 UTC import:
//   • NEW LOW    a drop since the last price that is MATERIAL (isMaterialDrop:
//                ≥5% and ≥50 minor units) against the reference — the price we
//                last emailed while that is under WATERMARK_TTL_MS (30 days)
//                old, else the last price.
//   • RESTOCK    sold out (soldOutAt) for RESTOCK_MIN_SOLDOUT_MS or more, now
//                priced again.
//   • LISTED     never priced when watched, priced now — labelled PRE-ORDER
//                while the card's set has not released (isPreorderSetCode).
//   At most one digest per address per week; no reminders.
// PLUS (targets up to PLUS_TARGET_ALERT_LIMIT) / PREMIUM (unlimited) — every
// run, i.e. after both imports, with no weekly cap:
//   • TARGET     at or under the member's price and armed; once fired it
//                re-fires only a further 10% down, and re-arms when a run sees
//                the price above the target or sold out.
//   • BELOW MKT  the alert price ≥15% under TCGplayer market (read directly,
//                scoreVsTcg) and material against the reference.
//   • RESTOCK    as above.
//   Each with a 24h per-card cooldown.
// EVERY price trigger: a new low more than 40% under the last price is held
// for one run (pendingLowCents) and fires only if it is still there.
// EVERY run shares ALERT_DAILY_BUDGET distinct addresses per rolling 24h (the
// free run at most ALL_RUN_SHARE of them), opened in priority order.

export interface AlertRunSummary {
  alerts: number; // rows examined
  drops: number; // watches whose alert price fell since the last run (emailed, deferred or suppressed)
  listed: number; // watches that got their FIRST alert price in their market (pre-orders included)
  preorders: number; // …of which the card's set has not released yet
  restocks: number; // watches back in stock after being sold out for RESTOCK_MIN_SOLDOUT_MS
  targets: number; // entitled watches at or below their own target, worth telling (sent or deferred)
  belowMarket: number; // entitled watches ≥ BELOW_MARKET_MIN_PCT under TCGplayer market, material vs the reference
  suppressed: number; // drops NOT emailed: not material against the reference — anti-spam
  outlierHeld: number; // new lows > OUTLIER_DROP_PCT under the last price, held for one run
  cooldown: number; // paid triggers skipped inside their 24h per-card cooldown (baseline held)
  snoozed: number; // triggers not emailed because the watch is snoozed (baselines still advance)
  paused: number; // triggers not emailed because the ADDRESS paused alert emails (AlertMute; baselines still advance)
  deferred: number; // worth sending, held for the weekly cap, a per-run cap or the daily budget
  budgetDeferred: number; // …of which by ALERT_DAILY_BUDGET
  soldOut: number; // watches that went sold out this run (soldOutAt set)
  unknown: number; // watches whose only eligible rows are stale — nothing decided
  ebayOnly: number; // sold out on the alert price but priced on the Card (eBay, played or stale copies only)
  legacyMarket: number; // rows whose market is not a supported one (legacy NZ) — skipped
  emails: number; // recipients emailed
  updated: number; // rows written
  held: number; // rows whose baseline was deliberately NOT moved (deferred, cooldown, failed send)
}

// Which rows one run looks at.
//   • "all"  — every watch, anonymous included: the daily free run, which
//              refresh-prices.yml fires straight after the 07:00 UTC import.
//   • "paid" — only watches owned by an entitled account (Plus, Premium,
//              admin): the runs after each of the two daily imports, so a
//              target is checked after every price update. Free and anonymous
//              rows are never touched by a paid run.
export type AlertScope = "paid" | "all";

// ── Thresholds (named so DECISIONS.md can quote and tune them) ───────────────

/** A drop must be at least this % of the reference… */
export const DROP_MIN_PCT = 5;
/** …and at least this many minor units (cents, pence) of the market's currency. */
export const DROP_MIN_CENTS = 50;
/** The "price we last emailed you" watermark counts for this long after the email. */
export const WATERMARK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A new low more than this % under the last price is held one run. */
export const OUTLIER_DROP_PCT = 40;
/** On the next run a held low fires only if the price is still within this % of it. */
export const OUTLIER_CONFIRM_PCT = 5;
/** After a target fires, it fires again only this % further down. */
export const TARGET_REFIRE_STEP_PCT = 10;
/** Paid triggers (target, below-market, restock) email one card at most once per 24h. */
export const PAID_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Below-market fires only this far under TCGplayer market. */
export const BELOW_MARKET_MIN_PCT = 15;
/** A sell-out shorter than this (one missed scrape, a quick restock) is not news. */
export const RESTOCK_MIN_SOLDOUT_MS = 20 * 60 * 60 * 1000;

// AT MOST ONE FREE DIGEST PER ADDRESS PER WEEK (owner call, 2026-09-21: "can we
// make price drop emails less frequent? like once every week"). A SECOND,
// independent gate: isMaterialDrop() & co. decide whether something is worth
// telling someone AT ALL, per card; this decides how often that person may be
// told anything, per address. The paid triggers are exempt. A held item keeps
// its baseline and re-detects next run — but a low that has recovered by the
// time the window opens is NOT reported (the /alerts FAQ says so).
export const MIN_DIGEST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

// THE SHARED ALERT BUDGET. Resend's 100/day is also what verification, reset,
// welcome, trial and release-day mail use, so every alert run together may
// email at most this many DISTINCT addresses per rolling 24h — counted from
// PriceAlert.lastNotifiedAt with one small query, because a paid run cannot
// see the free run's rows. Override with the ALERT_DAILY_BUDGET env var (lower
// it for release week). The free run may use at most ALL_RUN_SHARE, so the
// paid triggers always keep room.
export const ALERT_DAILY_BUDGET = 50;
export const ALL_RUN_SHARE = 35;
export function alertDailyBudget(env: Record<string, string | undefined> = process.env): number {
  const v = Number.parseInt(env.ALERT_DAILY_BUDGET ?? "", 10);
  return Number.isFinite(v) && v >= 0 ? v : ALERT_DAILY_BUDGET;
}

// Most NEW digests first-price (and free restock) notices may open in one
// run. Release day lists a whole set at once; the overflow is deferred with
// its baseline held and re-detects next run. Joining a digest already going to
// that address costs no extra email and is not counted.
export const FIRST_PRICE_SEND_CAP = 25;

// Most NEW digests the paid triggers may open in one run, beside the budget —
// a bug must not be able to spend the day's quota on one run.
export const PAID_SEND_CAP = 30;

// Most NEW drop digests one run may open to an address we have NEVER emailed
// (review, 2026-09-25). /api/alerts/subscribe enrols any posted address with no
// double opt-in, so a burst of those must be spread over days instead of
// starving transactional mail. Keyed on "never emailed", not on userId
// (tests/watchlist.test.ts: rows are never filtered by account).
export const FIRST_CONTACT_SEND_CAP = 20;

// Digests open in this order when a cap or the budget binds (defined beside
// the email, which orders its rows and picks its subject by the same rule).
export { ALERT_KIND_PRIORITY };

// ── The pure rules ───────────────────────────────────────────────────────────

/** A drop worth an email: ≥ DROP_MIN_PCT of the reference AND ≥ DROP_MIN_CENTS. */
export function isMaterialDrop(refCents: number, currentCents: number): boolean {
  return refCents - currentCents >= Math.max(Math.ceil((refCents * DROP_MIN_PCT) / 100), DROP_MIN_CENTS);
}

/** The emailed-price watermark while it is live (under WATERMARK_TTL_MS old), else null. */
export function liveWatermark(opts: { lowestEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): number | null {
  const { lowestEmailedCents, lastNotifiedAt, now } = opts;
  if (lowestEmailedCents == null || lastNotifiedAt == null) return null;
  return now.getTime() - lastNotifiedAt.getTime() < WATERMARK_TTL_MS ? lowestEmailedCents : null;
}

/**
 * What a move is measured from — and what an email's "what changed" line
 * quotes: the price we last emailed while that is live, else the last price.
 */
export function alertReference(opts: {
  prev: number | null;
  lowestEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  now: Date;
}): { cents: number | null; basis: "emailed" | "last" | null } {
  const live = liveWatermark(opts);
  if (live != null) return { cents: live, basis: "emailed" };
  return opts.prev != null ? { cents: opts.prev, basis: "last" } : { cents: null, basis: null };
}

/** Is this ADDRESS inside its weekly quiet window? */
export function addressInCooldown(opts: { lastEmailedAt: Date | null; now: Date }): boolean {
  const { lastEmailedAt, now } = opts;
  if (lastEmailedAt == null) return false; // never emailed: a first alert arrives at once
  return now.getTime() - lastEmailedAt.getTime() < MIN_DIGEST_INTERVAL_MS;
}

/** Was this CARD emailed inside the paid triggers' 24h cooldown? */
export function inPaidCooldown(lastNotifiedAt: Date | null, now: Date): boolean {
  return lastNotifiedAt != null && now.getTime() - lastNotifiedAt.getTime() < PAID_COOLDOWN_MS;
}

/** Never priced when the watch was created (or when it was last reset), priced now. */
export function isFirstPrice(prev: number | null, current: number | null): boolean {
  return prev == null && current != null;
}

/**
 * The free new-low rule: a drop since the last price, material against the
 * reference (see alertReference). A price sawtoothing back to a figure we
 * already sent stays quiet; a one-cent "new low" never sends.
 */
export function shouldEmailDrop(opts: {
  current: number;
  prev: number | null;
  lowestEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  now: Date;
}): boolean {
  const { current, prev } = opts;
  if (prev == null || current >= prev) return false;
  const ref = alertReference(opts).cents ?? prev;
  return isMaterialDrop(ref, current);
}

/**
 * THE TARGET-PRICE TRIGGER (Plus and Premium). Fires when the alert price is at
 * or under the member's target and the target is ARMED (targetEmailedCents
 * null: never fired, or re-armed because a run saw the price above the target
 * or sold out, or the member changed it). Once fired it fires again only at a
 * further TARGET_REFIRE_STEP_PCT down from the price it last sent. The 24h
 * per-card cooldown is applied by the run (inPaidCooldown).
 */
export function shouldEmailTarget(opts: { current: number; targetCents: number | null; targetEmailedCents: number | null }): boolean {
  const { current, targetCents, targetEmailedCents } = opts;
  if (targetCents == null || current > targetCents) return false;
  if (targetEmailedCents == null) return true;
  return current <= Math.floor((targetEmailedCents * (100 - TARGET_REFIRE_STEP_PCT)) / 100);
}

/** Should a run seeing this price re-arm the target? */
export function shouldRearmTarget(opts: { current: number | null; targetCents: number | null; targetEmailedCents: number | null }): boolean {
  if (opts.targetEmailedCents == null) return false;
  if (opts.current == null) return true; // sold out
  return opts.targetCents != null && opts.current > opts.targetCents;
}

/**
 * THE BELOW-MARKET TRIGGER (Plus and Premium): the alert price scored against
 * TCGplayer market with Deal Finder's own predicate (scoreVsTcg), at least
 * BELOW_MARKET_MIN_PCT under it, and news — its first price, or a material
 * move against the reference. Returns the gap for the email, or null.
 */
export function belowMarketSignal(opts: {
  country: Country;
  current: number;
  prev: number | null;
  lowestEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  now: Date;
  tcg: TcgMarketRef | null | undefined;
}): { marketCents: number; marketUsdCents: number; belowCents: number; belowPct: number } | null {
  const { country, current, tcg } = opts;
  if (!tcg) return null;
  const score = scoreVsTcg(country, current, tcg.marketCents, tcg.lowUsdCents);
  if (!score || score.belowPct < BELOW_MARKET_MIN_PCT) return null;
  const ref = alertReference(opts).cents;
  if (ref != null && !isMaterialDrop(ref, current)) return null;
  return { marketCents: tcg.marketCents, marketUsdCents: tcg.marketUsdCents, belowCents: score.belowCents, belowPct: score.belowPct };
}

/** A new low implausibly far under the last price — held one run before anything sends. */
export function isOutlierLow(prev: number | null, current: number): boolean {
  return prev != null && current < (prev * (100 - OUTLIER_DROP_PCT)) / 100;
}

/** On the run after a hold: is the price still at (or within OUTLIER_CONFIRM_PCT of) the held low? */
export function confirmsPendingLow(pendingLowCents: number, current: number): boolean {
  return current <= Math.floor((pendingLowCents * (100 + OUTLIER_CONFIRM_PCT)) / 100);
}

/** Sold out long enough, and priced again: "back in stock". */
export function isRestock(opts: { prev: number | null; soldOutAt: Date | null; now: Date }): boolean {
  return opts.prev != null && opts.soldOutAt != null && opts.now.getTime() - opts.soldOutAt.getTime() >= RESTOCK_MIN_SOLDOUT_MS;
}

/**
 * Postage for ONE card from this store to the watcher's market. The listing's
 * own stated postage wins; otherwise shippingFor() (lib/shipping.ts) for a
 * store in that market — measured from its checkout, or its market's estimate
 * floor ("est.") when unmeasured. Nothing known → null, and the email says
 * "postage extra"; never a guess dressed as a quote.
 */
export function alertPostage(
  offer: Pick<AlertOffer, "retailer" | "priceCents" | "shippingCents">,
  market: Country,
): Pick<AlertStore, "postageCents" | "postageBasis" | "postageUpTo" | "deliveredCents"> {
  if (offer.shippingCents != null && offer.shippingCents >= 0) {
    return { postageCents: offer.shippingCents, postageBasis: "listing", postageUpTo: false, deliveredCents: offer.priceCents + offer.shippingCents };
  }
  const store = RETAILERS[offer.retailer];
  if (!store || (store.country ?? "AU") !== market) {
    return { postageCents: null, postageBasis: null, postageUpTo: false, deliveredCents: null };
  }
  try {
    const q = shippingFor(offer.retailer, { subtotalCents: offer.priceCents, items: 1 });
    if (q.unavailable) return { postageCents: null, postageBasis: null, postageUpTo: false, deliveredCents: null };
    return { postageCents: q.cents, postageBasis: q.basis, postageUpTo: q.upTo, deliveredCents: offer.priceCents + q.cents };
  } catch {
    return { postageCents: null, postageBasis: null, postageUpTo: false, deliveredCents: null };
  }
}

const isSupportedMarket = (m: string): m is Country => Object.prototype.hasOwnProperty.call(COUNTRIES, m);

// ── The run ──────────────────────────────────────────────────────────────────

// `deps` exists only so tests can run the whole thing against a stub client
// and sender (tests/helpers/alert-harness.ts); the cron passes nothing.
// notify() itself is not injectable (tests/design-system.test.ts pins its
// import and call shape); `notifyUsers: false` switches the in-app mirror off
// instead, so a test can never write a Notification row.
export interface AlertRunDeps {
  db?: Pick<typeof prisma, "priceAlert" | "retailerPrice" | "alertMute" | "$transaction">;
  sendPriceDropEmail?: typeof sendPriceDropEmailImpl;
  now?: Date;
  notifyUsers?: boolean;
  // TCGplayer market for the below-market trigger. Defaults to
  // lib/arbitrage.ts tcgMarketFor (direct, scoped, uncached).
  tcgMarket?: (country: Country, cardIds: string[]) => Promise<Map<string, TcgMarketRef>>;
  // Defaults to alertDailyBudget() (env ALERT_DAILY_BUDGET, else 50).
  dailyBudget?: number;
}

export interface AlertRunOptions {
  scope?: AlertScope;
}

type Patch = {
  lastPriceCents?: number;
  soldOutAt?: Date | null;
  pendingLowCents?: number | null;
  targetEmailedCents?: number | null;
};

export async function runPriceAlerts(deps: AlertRunDeps = {}, opts: AlertRunOptions = {}): Promise<AlertRunSummary> {
  const db = deps.db ?? prisma;
  const sendPriceDropEmail = deps.sendPriceDropEmail ?? sendPriceDropEmailImpl;
  const loadTcgMarket = deps.tcgMarket ?? ((c: Country, ids: string[]) => tcgMarketFor(c, ids, db));
  const scope: AlertScope = opts.scope ?? "all";
  const now = deps.now ?? new Date();

  // "all" reads EVERY row, unfiltered — anonymous watchers are emailed exactly
  // like account-owned ones (tests/watchlist.test.ts). "paid" narrows the read
  // to rows whose account is inside a paid period, or is an admin — by the DB
  // flag OR by address (ADMIN_EMAILS, the same list the session honours);
  // isPremium() below stays the real check, this only trims the read.
  const paidOnly = scope === "paid"
    ? {
        user: {
          is: {
            OR: [
              { isAdmin: true },
              { premiumUntil: { gt: now } },
              ...(ADMIN_EMAILS.length ? [{ email: { in: ADMIN_EMAILS, mode: "insensitive" as const } }] : []),
            ],
          },
        },
      }
    : undefined;
  const alerts = await db.priceAlert.findMany({
    where: paidOnly,
    // Oldest watch first, so the order candidates of one priority open digests
    // in is stable between runs. ~200 rows: the sort is free.
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      market: true,
      lastPriceCents: true,
      lowestEmailedCents: true,
      lastNotifiedAt: true,
      targetCents: true,
      targetEmailedCents: true,
      // Read for the email's "you started watching at" line; never written here.
      startPriceCents: true,
      soldOutAt: true,
      pendingLowCents: true,
      snoozedUntil: true,
      createdAt: true,
      unsubToken: true,
      // Whether this watch belongs to an account — decides if the email
      // carries the "create a free account" block (anonymous watchers only).
      userId: true,
      user: { select: { email: true, isAdmin: true, premiumUntil: true, premiumTier: true, premiumTierFloor: true } },
      card: {
        select: {
          id: true,
          name: true,
          slug: true,
          setCode: true,
          collectorNumber: true,
          // Only for the ebayOnly counter: the alert price is lib/alert-price.ts.
          lowestPriceCents: true,
          lowestPriceCentsUs: true,
          lowestPriceCentsUk: true,
          lowestPriceCentsSg: true,
          lowestPriceCentsCa: true,
          lowestPriceCentsEu: true,
        },
      },
    },
  });
  type Row = (typeof alerts)[number];

  const summary: AlertRunSummary = {
    alerts: alerts.length,
    drops: 0,
    listed: 0,
    preorders: 0,
    restocks: 0,
    targets: 0,
    belowMarket: 0,
    suppressed: 0,
    outlierHeld: 0,
    cooldown: 0,
    snoozed: 0,
    paused: 0,
    deferred: 0,
    budgetDeferred: 0,
    soldOut: 0,
    unknown: 0,
    ebayOnly: 0,
    legacyMarket: 0,
    emails: 0,
    updated: 0,
    held: 0,
  };

  // ENTITLEMENT, once per row. A lapsed subscription is simply not entitled:
  // its targets are ignored and the watch runs the free rules.
  const entitled = new Map<string, boolean>();
  // The target each entitled row may use: none when over targetAlertLimit and
  // not one of the oldest (honouredTargetIds — the rule the watchlist shows).
  const honouredTarget = new Map<string, number>();
  const targetRowsByUser = new Map<string, { user: EntitlementUser; rows: Row[] }>();
  for (const a of alerts) {
    const user: EntitlementUser | null = a.user ? { ...a.user, isAdmin: a.user.isAdmin || isAdminEmail(a.user.email) } : null;
    const ok = a.userId != null && user != null && isPremium(user);
    entitled.set(a.id, ok);
    if (!ok || a.targetCents == null) continue;
    const group = targetRowsByUser.get(a.userId!) ?? { user: user!, rows: [] };
    group.rows.push(a);
    targetRowsByUser.set(a.userId!, group);
  }
  for (const { user, rows } of targetRowsByUser.values()) {
    const live = honouredTargetIds(rows, targetAlertLimit(premiumTierOf(user)));
    for (const a of rows) if (live.has(a.id)) honouredTarget.set(a.id, a.targetCents!);
  }
  const inScope = (a: Row) => scope === "all" || entitled.get(a.id) === true;

  // Rows this run evaluates: in scope, on a supported market (legacy NZ rows
  // would otherwise be priced as AU).
  const rows: (Row & { market: Country })[] = [];
  for (const a of alerts) {
    if (!inScope(a)) continue;
    if (!isSupportedMarket(a.market)) {
      summary.legacyMarket++;
      continue;
    }
    rows.push(a as Row & { market: Country });
  }

  // THE ALERT PRICE for every evaluated (card, market): one bounded query.
  // A failed read throws — nothing is safe to compare, and it must never be
  // read as every watched card selling out.
  const prices = await computeAlertPrices(db, rows.map((a) => ({ cardId: a.card.id, market: a.market })), now);
  const priceOf = (a: Row & { market: Country }): AlertPrice | undefined => prices.get(alertPairKey(a.market, a.card.id));

  // TCGplayer market for the below-market trigger: only entitled, priced
  // candidates, one direct scoped read per market. A failure switches the
  // trigger off for this run.
  const tcgIdsByMarket = new Map<Country, Set<string>>();
  for (const a of rows) {
    if (!entitled.get(a.id) || priceOf(a)?.state !== "priced") continue;
    const ids = tcgIdsByMarket.get(a.market) ?? new Set<string>();
    ids.add(a.card.id);
    tcgIdsByMarket.set(a.market, ids);
  }
  const tcgByMarket = new Map<Country, Map<string, TcgMarketRef>>();
  for (const [market, ids] of tcgIdsByMarket) {
    tcgByMarket.set(market, await loadTcgMarket(market, [...ids]).catch(() => new Map<string, TcgMarketRef>()));
  }

  // THE DAILY BUDGET: distinct addresses emailed in the last 24h, by any run.
  const budget = deps.dailyBudget ?? alertDailyBudget();
  // A GROUP BY in Postgres, not findMany's `distinct` (which Prisma dedupes
  // client-side after reading every row — tests/prisma-client-side-distinct).
  const recent = await db.priceAlert.groupBy({
    by: ["email"],
    where: { lastNotifiedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    orderBy: { email: "asc" },
    take: 1000,
  });
  const recentAddresses = new Set(recent.map((r) => r.email));
  const remaining = Math.max(0, budget - recentAddresses.size);
  const runBudget = scope === "all" ? Math.min(ALL_RUN_SHARE, remaining) : remaining;

  // When each ADDRESS was last emailed (the weekly cap's input), from the rows
  // already read.
  const lastEmailedByAddress = new Map<string, number>();
  for (const a of alerts) {
    if (a.lastNotifiedAt == null) continue;
    const t = a.lastNotifiedAt.getTime();
    const seen = lastEmailedByAddress.get(a.email);
    if (seen == null || t > seen) lastEmailedByAddress.set(a.email, t);
  }
  const everEmailed = new Set(lastEmailedByAddress.keys());

  // Per-row writes. `always` lands even when the row is held (a re-arm, an
  // outlier hold, a cleared pending low that was not confirmed); `base` — the
  // baseline — only when the row is not held, so a deferred or failed alert
  // re-detects next run.
  const always = new Map<string, Patch>();
  const base = new Map<string, Patch>();
  const heldIds = new Set<string>();
  const patch = (m: Map<string, Patch>, id: string, p: Patch) => m.set(id, { ...(m.get(id) ?? {}), ...p });

  interface Candidate {
    a: Row & { market: Country };
    item: PriceDropItem;
    paid: boolean; // exempt from the weekly cap
    cap: "paid" | "first" | "drop";
    order: number;
  }
  const candidates: Candidate[] = [];

  const buildItem = (
    a: Row & { market: Country },
    ap: AlertPrice,
    kind: AlertKind,
    ref: { cents: number | null; basis: PriceDropItem["referenceBasis"] },
    extra: Partial<PriceDropItem> = {},
  ): PriceDropItem => {
    const current = ap.priceCents!;
    const preorder = isPreorderSetCode(a.card.setCode, now);
    const loc = `/email-alert-${kind.replace("_", "-")}`;
    // The row's one-tap links (lib/alert-actions.ts): stop, snooze 30 days,
    // and for an entitled account "set target at this price" / "lower target
    // 10%" — a free or anonymous row gets the Plus link instead. The POST
    // re-checks entitlement and the Plus limit. A signing failure (no
    // AUTH_SECRET in production) drops the links, never the alert.
    let actions: PriceDropItem["actions"] = null;
    try {
      const canTarget = entitled.get(a.id) === true;
      actions = alertActionLinks({ alertId: a.id, currentCents: current, targetCents: canTarget ? a.targetCents : null, canTarget, now });
    } catch {
      actions = null;
    }
    return {
      kind,
      alertId: a.id,
      cardId: a.card.id,
      name: a.card.name,
      setCode: a.card.setCode,
      collectorNumber: a.card.collectorNumber,
      url: `${SITE_URL}${cardHref(a.card)}`,
      market: a.market,
      currency: currencyOf(a.market),
      currentCents: current,
      referenceCents: ref.cents,
      referenceBasis: ref.basis,
      startPriceCents: a.startPriceCents ?? null,
      change:
        ref.cents != null && ref.cents > 0
          ? { cents: ref.cents - current, pct: Math.round(((ref.cents - current) / ref.cents) * 100) }
          : null,
      condition: ap.condition,
      stores: ap.stores.map((s) => ({
        retailer: s.retailer,
        name: s.name,
        url: affiliateUrl(s.url, s.retailer, loc),
        priceCents: s.priceCents,
        condition: s.condition,
        ...alertPostage(s, a.market),
      })),
      checkedAt: ap.checkedAt ?? now,
      targetCents: null,
      tcgMarket: null,
      soldOutAt: null,
      preorder,
      releasedOn: preorder ? setByCode(a.card.setCode)?.releasedOn ?? null : null,
      actions,
      ...extra,
    };
  };

  // ── Evaluate every row once ────────────────────────────────────────────────
  rows.forEach((a, order) => {
    const ap = priceOf(a);
    const prev = a.lastPriceCents;
    if (!ap || ap.state === "unknown") {
      // Only stale rows claim stock: a failing feed, not a sell-out. Decide
      // nothing and write nothing until a fresh import says which it is.
      summary.unknown++;
      return;
    }

    if (ap.state === "soldout") {
      if (pickPrice(a.card, a.market) != null) summary.ebayOnly++;
      if (prev != null && a.soldOutAt == null) {
        patch(always, a.id, { soldOutAt: now });
        summary.soldOut++;
      }
      if (a.pendingLowCents != null) patch(always, a.id, { pendingLowCents: null });
      if (shouldRearmTarget({ current: null, targetCents: a.targetCents, targetEmailedCents: a.targetEmailedCents })) {
        patch(always, a.id, { targetEmailedCents: null });
      }
      return;
    }

    const current = ap.priceCents!;
    if (shouldRearmTarget({ current, targetCents: a.targetCents, targetEmailedCents: a.targetEmailedCents })) {
      patch(always, a.id, { targetEmailedCents: null });
    }

    // OUTLIER HOLD. A held low is confirmed when the price is still at it; a
    // confirmed low skips the check once (and its clear rides the baseline, so
    // a deferral keeps it confirmable); an unconfirmed one is cleared and the
    // price is judged afresh — which may hold it again at the new figure.
    let confirmed = false;
    if (a.pendingLowCents != null) {
      if (confirmsPendingLow(a.pendingLowCents, current)) {
        confirmed = true;
        patch(base, a.id, { pendingLowCents: null });
      } else {
        patch(always, a.id, { pendingLowCents: null });
      }
    }
    if (!confirmed && isOutlierLow(prev, current)) {
      patch(always, a.id, { pendingLowCents: current });
      summary.outlierHeld++;
      heldIds.add(a.id);
      return;
    }

    // Back from a sell-out: news after RESTOCK_MIN_SOLDOUT_MS, otherwise the
    // marker is just cleared (one missed scrape is not a restock).
    const restock = isRestock({ prev, soldOutAt: a.soldOutAt, now });
    if (a.soldOutAt != null) {
      if (restock) patch(base, a.id, { soldOutAt: null });
      else patch(always, a.id, { soldOutAt: null });
    }
    if (prev !== current) patch(base, a.id, { lastPriceCents: current });

    const ref = alertReference({ prev, lowestEmailedCents: a.lowestEmailedCents, lastNotifiedAt: a.lastNotifiedAt, now });
    let cand: Candidate | null = null;

    // PAID TRIGGERS first, for entitled rows.
    if (entitled.get(a.id)) {
      const target = honouredTarget.get(a.id) ?? null;
      const below = belowMarketSignal({
        country: a.market,
        current,
        prev,
        lowestEmailedCents: a.lowestEmailedCents,
        lastNotifiedAt: a.lastNotifiedAt,
        now,
        tcg: tcgByMarket.get(a.market)?.get(a.card.id),
      });
      let item: PriceDropItem | null = null;
      if (shouldEmailTarget({ current, targetCents: target, targetEmailedCents: a.targetEmailedCents })) {
        summary.targets++;
        item = buildItem(a, ap, "target", ref, { targetCents: target });
      } else if (restock) {
        summary.restocks++;
        item = buildItem(a, ap, isPreorderSetCode(a.card.setCode, now) ? "preorder" : "restock", { cents: prev, basis: "before_soldout" }, { soldOutAt: a.soldOutAt });
      } else if (below) {
        summary.belowMarket++;
        item = buildItem(a, ap, "below_market", ref, { tcgMarket: below });
      }
      if (item) {
        if (inPaidCooldown(a.lastNotifiedAt, now)) {
          // Emailed about this card in the last 24h: hold the baseline so the
          // trigger re-detects on the next run instead of being lost.
          summary.cooldown++;
          heldIds.add(a.id);
          return;
        }
        cand = { a, item, paid: true, cap: "paid", order };
      }
    }

    // FREE RULES, for every row no paid trigger took.
    if (!cand) {
      if (isFirstPrice(prev, current)) {
        summary.listed++;
        const pre = isPreorderSetCode(a.card.setCode, now);
        if (pre) summary.preorders++;
        cand = { a, item: buildItem(a, ap, pre ? "preorder" : "listed", { cents: null, basis: null }), paid: false, cap: "first", order };
      } else if (restock) {
        summary.restocks++;
        const kind: AlertKind = isPreorderSetCode(a.card.setCode, now) ? "preorder" : "restock";
        cand = { a, item: buildItem(a, ap, kind, { cents: prev, basis: "before_soldout" }, { soldOutAt: a.soldOutAt }), paid: false, cap: "first", order };
      } else if (prev != null && current < prev) {
        summary.drops++;
        if (shouldEmailDrop({ current, prev, lowestEmailedCents: a.lowestEmailedCents, lastNotifiedAt: a.lastNotifiedAt, now })) {
          cand = { a, item: buildItem(a, ap, "drop", ref), paid: false, cap: "drop", order };
        } else {
          // Real, but not material against what they were last told: quiet.
          // Its baseline still advances — a sawtooth must not queue forever.
          summary.suppressed++;
        }
      }
    }

    if (!cand) return;
    // SNOOZED ("Snooze 30 days" in the email): not emailed, but the baseline
    // advances so nothing backs up behind the snooze.
    if (a.snoozedUntil != null && a.snoozedUntil.getTime() > now.getTime()) {
      summary.snoozed++;
      return;
    }
    candidates.push(cand);
  });

  // ── Paused addresses ───────────────────────────────────────────────────────
  // "Pause alert emails, keep my watchlist" (AlertMute, lib/alert-mute.ts):
  // one scoped read for the addresses about to be emailed. A paused address's
  // triggers are dropped like a snoozed card's — not emailed, baselines
  // advance — so resuming never releases a backlog of stale news. A failed
  // read throws: emailing someone who asked for no email is worse than a run
  // that retries at the next import.
  const pausedSet = await pausedAddresses(db, [...new Set(candidates.map((c) => c.a.email))]);
  if (pausedSet.size) {
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (!pausedSet.has(candidates[i]!.a.email)) continue;
      candidates.splice(i, 1);
      summary.paused++;
    }
  }

  // ── Open digests in priority order ─────────────────────────────────────────
  // target > restock > below-market > new low > listed/pre-order, then oldest
  // watch first. An item for an address that already has a digest this run
  // joins it for free; opening a new one must clear the weekly cap (free
  // items), its per-run cap and the daily budget, or it is DEFERRED: no email,
  // no watermark, baseline held, so it re-detects next run.
  candidates.sort((x, y) => ALERT_KIND_PRIORITY[x.item.kind] - ALERT_KIND_PRIORITY[y.item.kind] || x.order - y.order);
  const byEmail = new Map<string, { token: string; items: PriceDropItem[]; anonymous: boolean; userId: string | null }>();
  const notifiedIds = new Set<string>();
  const deferred: Candidate[] = [];
  const opened = { paid: 0, first: 0, drop: 0, firstContact: 0, budget: 0 };
  const queue = (c: Candidate) => {
    const { a, item } = c;
    const bucket = byEmail.get(a.email) ?? { token: a.unsubToken, items: [], anonymous: true, userId: null };
    bucket.items.push(item);
    // ANY linked row means this address has an account.
    if (a.userId != null) bucket.anonymous = false;
    if (bucket.userId == null) bucket.userId = a.userId;
    byEmail.set(a.email, bucket);
    notifiedIds.add(a.id);
  };
  const quiet = (email: string) => {
    const last = lastEmailedByAddress.get(email);
    return addressInCooldown({ lastEmailedAt: last == null ? null : new Date(last), now });
  };
  for (const c of candidates) {
    const email = c.a.email;
    if (byEmail.has(email)) {
      queue(c);
      continue;
    }
    const firstContact = !everEmailed.has(email);
    const opensBudget = !recentAddresses.has(email);
    let reason: "week" | "cap" | "budget" | null = null;
    if (!c.paid && quiet(email)) reason = "week";
    else if (c.cap === "paid" && opened.paid >= PAID_SEND_CAP) reason = "cap";
    else if (c.cap === "first" && opened.first >= FIRST_PRICE_SEND_CAP) reason = "cap";
    else if (c.cap === "drop" && firstContact && opened.firstContact >= FIRST_CONTACT_SEND_CAP) reason = "cap";
    else if (opensBudget && opened.budget >= runBudget) reason = "budget";
    if (reason) {
      if (reason === "budget") summary.budgetDeferred++;
      deferred.push(c);
      continue;
    }
    if (c.cap === "paid") opened.paid++;
    else if (c.cap === "first") opened.first++;
    else if (firstContact) opened.firstContact++;
    if (opensBudget) opened.budget++;
    queue(c);
  }
  // A deferred item whose address got a digest anyway (a paid alert opened
  // one) joins it: that email is going out, and the item costs nothing more.
  for (const c of deferred) {
    if (byEmail.has(c.a.email)) {
      queue(c);
      continue;
    }
    summary.deferred++;
    heldIds.add(c.a.id);
  }

  // ── Send one digest per address ────────────────────────────────────────────
  // Sequential to stay gentle on the provider's rate limits.
  const failedEmails = new Set<string>();
  for (const [email, { token, items, anonymous, userId }] of byEmail) {
    // The address's unsubToken addresses the email's pause / delete / manage
    // links and its List-Unsubscribe header (lib/email.ts alertAddressLinks).
    const sent = await sendPriceDropEmail(email, items, token, anonymous);
    if (sent) {
      summary.emails++;
      // In-app mirror for the account's own bell — only when the watch is
      // linked to one (anonymous watchers have nowhere in-app to see it).
      if (userId && deps.notifyUsers !== false) {
        const title = notificationTitle(items);
        void notify(userId, "price_drop", title, "Check your watchlist for the new price.", "/watching").catch(() => {});
      }
    } else failedEmails.add(email);
  }

  // ── Persist ────────────────────────────────────────────────────────────────
  // A failed digest's alerts are held exactly like deferred ones: the next run
  // must still see the move, or the alert the subscriber asked for is gone.
  const itemById = new Map<string, PriceDropItem>();
  for (const b of byEmail.values()) for (const i of b.items) itemById.set(i.alertId, i);
  for (const a of rows) {
    if (failedEmails.has(a.email) && notifiedIds.has(a.id)) heldIds.add(a.id);
  }
  const writes: { id: string; data: Record<string, unknown> }[] = [];
  for (const a of rows) {
    const held = heldIds.has(a.id);
    const data: Record<string, unknown> = { ...(always.get(a.id) ?? {}) };
    if (!held) Object.assign(data, base.get(a.id) ?? {});
    const item = !held && notifiedIds.has(a.id) ? itemById.get(a.id) : undefined;
    if (item) {
      // What we just told them. It becomes the reference for 30 days
      // (WATERMARK_TTL_MS) — the next alert on this card must be a material
      // move from it. A pre-order price is not a buying price yet and never
      // becomes the reference.
      data.lastNotifiedAt = now;
      if (item.kind !== "preorder") data.lowestEmailedCents = item.currentCents;
      if (item.kind === "target") data.targetEmailedCents = item.currentCents;
    }
    if (Object.keys(data).length) writes.push({ id: a.id, data });
  }
  summary.held = heldIds.size;
  summary.updated = writes.length;
  if (writes.length) {
    await db.$transaction(writes.map((w) => db.priceAlert.update({ where: { id: w.id }, data: w.data })));
  }
  return summary;
}

// The in-app notification's title for one digest: the lead item (by the same
// priority the email uses), its price and the store behind it.
function notificationTitle(items: PriceDropItem[]): string {
  const lead = sortAlertItems(items)[0]!;
  const price = formatMoney(lead.currentCents, lead.currency);
  const at = lead.stores[0] ? ` at ${lead.stores[0].name}` : "";
  const more = items.length > 1 ? ` (+${items.length - 1} more)` : "";
  const head =
    lead.kind === "target"
      ? `${lead.name} hit your target: ${price}${at}`
      : lead.kind === "restock"
        ? `${lead.name} is back in stock: ${price}${at}`
        : lead.kind === "below_market"
          ? `${lead.name} is ${Math.round(lead.tcgMarket?.belowPct ?? 0)}% under TCGplayer market: ${price}${at}`
          : lead.kind === "preorder"
            ? `${lead.name} is open for pre-order from ${price}${at}`
            : lead.kind === "listed"
              ? `${lead.name} is now listed from ${price}${at}`
              : `${lead.name} dropped to ${price}${at}`;
  return `${head}${more}`;
}
