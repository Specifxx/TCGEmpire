import { prisma } from "./db";
import { pickPrice, type Country } from "./country";
import { cardHref } from "./card-url";
import { sendPriceDropEmail as sendPriceDropEmailImpl, type AlertStore, type PriceDropItem } from "./email";
import { SITE_URL } from "./site";
import { notify } from "./notifications";
import { isPremium, premiumTierOf, type EntitlementUser } from "./premium";
import { targetAlertLimit } from "./alert-limits";
import { defaultTcgBuyKeys, getTcgDealRanks } from "./arbitrage";
import { ALL_FALLBACK_RETAILERS } from "./constants";
import { affiliateUrl } from "./affiliate";

export interface AlertRunSummary {
  alerts: number; // rows examined
  drops: number; // individual card price drops found
  listed: number; // watched cards that got their FIRST price in the alert's market
  targets: number; // entitled watches at or below their own target price, worth telling (sent or deferred)
  belowMarket: number; // entitled watches that entered Deal Finder's below-TCGplayer-market ranking at a new low
  suppressed: number; // drops NOT emailed (not a new low, and no reminder due) — anti-spam
  deferred: number; // drops/first listings/paid alerts worth sending, held for the weekly cap (or a per-run send cap) — they WILL send later
  emails: number; // recipients emailed
  updated: number; // baseline rows written (a moved price, or an emailed alert's watermark)
  held: number; // baselines deliberately NOT moved (failed digest, or deferred above)
}

// Which rows one run looks at (2026-09-25 premium lineup).
//   • "all"  — every watch, anonymous included: the daily vercel.json run, and
//              exactly the pre-lineup behaviour when nobody has a target.
//   • "paid" — only watches owned by an entitled account (Plus, Premium,
//              admin): the extra runs refresh-prices.yml fires right after each
//              of the two daily imports, so a target is checked after every
//              price update instead of once a day. Free and anonymous rows are
//              never touched by a paid run — their baselines, weekly cap and
//              FIRST_PRICE_SEND_CAP belong to the "all" run alone.
export type AlertScope = "paid" | "all";

// How long after the last email a repeat drop notification is allowed even when
// the price is NOT a new low — a gentle "still cheap" nudge rather than spam.
export const REMINDER_INTERVAL_MS = 60 * 24 * 60 * 60 * 1000; // ≈ 2 months

// AT MOST ONE PRICE-DROP DIGEST PER ADDRESS PER WEEK (owner call, 2026-09-21:
// "can we make price drop emails less frequent? like once every week").
//
// This is a SECOND, independent gate, and the distinction matters. shouldEmailDrop()
// decides whether a drop is worth telling someone about AT ALL, per card. This
// one decides how often that person may be told ANYTHING, per address. Before
// this, a new all-time low always sent immediately, so somebody watching a dozen
// cards in a falling market could get a digest every single day — each one
// individually justified, collectively spam.
//
// WHY A CAP AND NOT A WEEKLY CRON. The run still has to happen daily: it is what
// tracks baselines, and a weekly-only job would compare against a week-old price
// and miss everything that fell and recovered in between. A cap also keeps the
// first email to a new subscriber immediate — their cooldown has not started.
//
// The paid triggers (a target price, the below-market ranking) are exempt: a
// member who names a price asked to hear the moment it is met, and each of
// them still fires at most once per new low (the shared watermark below).
export const MIN_DIGEST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

// Is this ADDRESS inside its quiet window? Pure and exported for the same reason
// shouldEmailDrop() is — the cadence policy is unit-tested directly rather than
// inferred from what the cron happened to write.
export function addressInCooldown(opts: { lastEmailedAt: Date | null; now: Date }): boolean {
  const { lastEmailedAt, now } = opts;
  // Never emailed → no cooldown. A first drop reaches a new subscriber at once.
  if (lastEmailedAt == null) return false;
  return now.getTime() - lastEmailedAt.getTime() < MIN_DIGEST_INTERVAL_MS;
}

// FIRST-PRICE ("now in stock") NOTICES. Both watch-creation paths store
// lastPriceCents = pickPrice(...), which is null for a card no store in that
// market lists yet — every freshly revealed Radiance card. Before this, the run
// skipped a null price and then treated the first real one as a silent
// baseline, so somebody who pressed "Get a price-drop alert" on an unpriced card
// heard nothing when it finally listed: the one moment they most wanted to know.
//
// A separate notification, not a drop: shouldEmailDrop() and the weekly cap are
// unchanged (a first listing still waits out an address's cooldown), and it needs
// no new query or column. prev == null means "unpriced in this market when the
// watch was created" — never listed, OR sold out at that moment (price-import
// nulls lowestPriceCents* when no in-stock listing is left), so the notice can be
// a restock rather than a first listing and its copy never says "first". The
// loop skips a null CURRENT price without touching the baseline, so a card that
// goes out of stock AFTER the watch keeps its non-null baseline and does NOT fire.
export function isFirstPrice(prev: number | null, current: number | null): boolean {
  return prev == null && current != null;
}

// Most NEW digests first-price notices may open in one run. Release day lists a
// whole set at once, and Resend's 100/day quota (see lib/email.ts) is shared with
// welcome, trial-ending and release-day mail — so a burst is spread over a few
// days instead of starving those. The overflow is deferred exactly like a capped
// drop (baseline held at null), so it re-detects next run. A notice joining a
// digest already going to that address this run costs no extra email, so it is
// not counted.
export const FIRST_PRICE_SEND_CAP = 40;

// Most NEW digests the paid triggers (target, below-market) may open in one
// run. The same Resend quota, and the paid triggers skip the weekly cap, so a
// release day (or a bug) must not be able to spend it on one run. About ten
// paying accounts exist today; 30 is far above a normal run and far below the
// quota. Overflow is deferred (baseline held) and re-detects next run, which
// for a paid watch is at most ~12 hours away. Joining a digest already queued
// for that address costs nothing and is not counted.
export const PAID_SEND_CAP = 30;

// Given a genuine drop (current < the last-seen baseline), decide whether to
// actually EMAIL it. Pure and exported so the anti-spam policy is unit-tested
// directly rather than inferred from the cron's side effects.
//   • a new all-time low since we last emailed → always send,
//   • otherwise only send if it's been ≈2 months since the last email (so a
//     price sawtoothing back to a figure we already sent stays quiet, but a
//     long-standing good price still resurfaces occasionally).
export function shouldEmailDrop(opts: {
  current: number;
  lowestEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  now: Date;
}): boolean {
  const { current, lowestEmailedCents, lastNotifiedAt, now } = opts;
  const isNewLow = lowestEmailedCents == null || current < lowestEmailedCents;
  const dueForReminder =
    lastNotifiedAt == null || now.getTime() - lastNotifiedAt.getTime() >= REMINDER_INTERVAL_MS;
  return isNewLow || dueForReminder;
}

// THE TARGET-PRICE TRIGGER ("Notify me at $X", Plus and Premium). Fires when the
// card's lowest in-stock price in the watch's market is AT OR BELOW the target
// and that price is news to this watcher: nothing emailed yet, or below the
// lowest price we ever emailed them (the watermark shouldEmailDrop shares), or
// the ≈2-month reminder is due. So a price that sits under the target sends
// once, not every run, and a sawtooth back to a price already sent stays quiet.
//
// Pure and exported, like shouldEmailDrop, so the policy is tested directly.
// Setting a target re-arms it (PATCH /api/alerts/watchlist/[cardId] clears a
// watermark at or below the new target), so an old low from before the target
// existed can't silence it.
export function shouldEmailTarget(opts: {
  current: number;
  targetCents: number | null;
  lowestEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  now: Date;
}): boolean {
  const { current, targetCents, lowestEmailedCents, lastNotifiedAt, now } = opts;
  if (targetCents == null || current > targetCents) return false;
  return shouldEmailDrop({ current, lowestEmailedCents, lastNotifiedAt, now });
}

// THE BELOW-MARKET TRIGGER (Plus and Premium). The card is in Deal Finder's
// "cheaper than TCGplayer market" ranking right now; this decides whether that
// is NEWS. Only at a new low: below the lowest price we have emailed this
// watcher, or — never emailed — a real drop since the last run (or the card's
// first price in this market). A card that has sat in the ranking at the same
// price since the watch began never fires; one that falls further does, once.
// No reminder: this is a bonus trigger, and the target is the promise.
export function isBelowMarketNewLow(opts: {
  current: number;
  prev: number | null;
  lowestEmailedCents: number | null;
}): boolean {
  const { current, prev, lowestEmailedCents } = opts;
  if (lowestEmailedCents != null) return current < lowestEmailedCents;
  return prev == null || current < prev;
}

// Rows the store lookup may return per fired card. The lookup is ONE query for
// every fired card, capped at this many rows each (see cheapestStores).
export const STORE_ROWS_PER_CARD = 8;

// Walk every wishlist price-drop subscription, compare each card's current lowest
// price (for the subscriber's market) against the last value we recorded, and:
//   • when it FELL → queue the subscriber for a notification email,
//   • always → advance the stored baseline to the current price (tracking rises too,
//     so a later dip is measured against the most recent price, not a stale one).
//
// Drops are grouped by email so each person gets one digest, not one per card.
// Designed to run daily, right after the price importer refreshes lowest prices.
//
// `deps` exists only so tests can run the whole thing against a stub client and
// sender (tests/price-alerts-first-price.test.ts, tests/price-alerts-target.test.ts);
// the cron passes nothing. notify() itself is not injectable (tests/design-
// system.test.ts pins its import and call shape); `notifyUsers: false` switches
// the in-app mirror off instead, for tests whose rows carry a userId — the paid
// triggers need an account — so a test can never write a Notification row.
export interface AlertRunDeps {
  db?: Pick<typeof prisma, "priceAlert" | "retailerPrice" | "$transaction">;
  sendPriceDropEmail?: typeof sendPriceDropEmailImpl;
  now?: Date;
  notifyUsers?: boolean;
  // Deal Finder's below-TCGplayer-market ranking for one market (card id →
  // rank). Defaults to lib/arbitrage.ts getTcgDealRanks over the default buy
  // side — the same call the premium nudge makes.
  dealRanks?: (country: Country) => Promise<Map<string, number>>;
}

export interface AlertRunOptions {
  scope?: AlertScope;
}

export async function runPriceAlerts(deps: AlertRunDeps = {}, opts: AlertRunOptions = {}): Promise<AlertRunSummary> {
  const db = deps.db ?? prisma;
  const sendPriceDropEmail = deps.sendPriceDropEmail ?? sendPriceDropEmailImpl;
  const dealRanks = deps.dealRanks ?? ((c: Country) => getTcgDealRanks(c, defaultTcgBuyKeys(c)));
  const scope: AlertScope = opts.scope ?? "all";
  const now = deps.now ?? new Date();

  // "all" reads EVERY row, unfiltered — anonymous watchers are emailed exactly
  // like account-owned ones (tests/watchlist.test.ts). "paid" narrows the read
  // to rows whose account is inside a paid period, or is an admin; isPremium()
  // below stays the real check (a tier floor etc.), this only trims the read.
  const paidOnly = scope === "paid"
    ? { user: { is: { OR: [{ isAdmin: true }, { premiumUntil: { gt: now } }] } } }
    : undefined;
  const alerts = await db.priceAlert.findMany({
    where: paidOnly,
    // Oldest watch first, so when an account holds more targets than its tier
    // allows (a Premium member who moved to Plus), the targets honoured are the
    // same ones every run. ~200 rows: the sort is free.
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      market: true,
      lastPriceCents: true,
      // The anti-spam watermark + when we last emailed, both read by
      // shouldEmailDrop() below to decide whether a fresh drop is worth sending.
      lowestEmailedCents: true,
      lastNotifiedAt: true,
      // The member's own "notify me at" price — honoured only while entitled.
      targetCents: true,
      unsubToken: true,
      // Whether this watch belongs to an account — decides if the drop email
      // carries the "create a free account" block (anonymous watchers only).
      userId: true,
      // Entitlement, for the paid triggers: the fields isPremium() reads.
      user: { select: { isAdmin: true, premiumUntil: true, premiumTier: true, premiumTierFloor: true } },
      card: {
        select: {
          id: true,
          name: true,
          slug: true,
          setCode: true,
          collectorNumber: true,
          lowestPriceCents: true,
          lowestPriceCentsUs: true,
          lowestPriceCentsUk: true,
          // Sg was missing here (added with Ca): pickPrice() below reads the column
          // for the alert's own market, so an unselected column came back
          // `undefined` → treated as "no price yet" → SG price alerts could never
          // fire at all. Same trap for CA without this.
          lowestPriceCentsSg: true,
          lowestPriceCentsCa: true,
          lowestPriceCentsEu: true,
        },
      },
    },
  });

  const summary: AlertRunSummary = {
    alerts: alerts.length,
    drops: 0,
    listed: 0,
    targets: 0,
    belowMarket: 0,
    suppressed: 0,
    deferred: 0,
    emails: 0,
    updated: 0,
    held: 0,
  };

  // ENTITLEMENT, once per row. A lapsed subscription (premiumUntil in the past)
  // is simply not entitled: its targets are ignored and the watch runs the free
  // rules below — the value stays stored, so it comes back on resubscribing.
  const entitled = new Map<string, boolean>();
  // The target each entitled row may use: null when it has none, or when its
  // account already has targetAlertLimit(tier) earlier targets honoured.
  const honouredTarget = new Map<string, number>();
  const targetsByUser = new Map<string, number>();
  for (const a of alerts) {
    // Through the PriceAlert → User relation; an anonymous row has no user and
    // is never paid.
    const user: EntitlementUser | null = a.user ?? null;
    const ok = a.userId != null && user != null && isPremium(user);
    entitled.set(a.id, ok);
    if (!ok || a.targetCents == null) continue;
    const used = targetsByUser.get(a.userId!) ?? 0;
    if (used >= targetAlertLimit(premiumTierOf(user))) continue;
    targetsByUser.set(a.userId!, used + 1);
    honouredTarget.set(a.id, a.targetCents);
  }
  const inScope = (a: (typeof alerts)[number]) => scope === "all" || entitled.get(a.id) === true;

  // The below-market ranking, once per market that HAS an entitled watch — at
  // most six calls, each a hit on arbitrage's day caches (the homepage, Deal
  // Finder and the nudge keep them warm). Called directly from the cron, never
  // inside an unstable_cache (db.ts rule 6, tests/nested-cache.test.ts). An
  // empty map (TCGplayer feed down, any error) just switches this trigger off.
  const ranksByMarket = new Map<Country, Map<string, number>>();
  for (const a of alerts) {
    const market = a.market as Country;
    if (!entitled.get(a.id) || ranksByMarket.has(market)) continue;
    ranksByMarket.set(market, await dealRanks(market).catch(() => new Map<string, number>()));
  }

  // When each ADDRESS was last emailed, across every card it watches — the input
  // to the weekly cap. lastNotifiedAt is stored per alert row, so the address's
  // real last-contact time is the newest of them; reading the maximum here costs
  // no extra query because the column is already selected above.
  const lastEmailedByAddress = new Map<string, number>();
  for (const a of alerts) {
    if (a.lastNotifiedAt == null) continue;
    const t = a.lastNotifiedAt.getTime();
    const seen = lastEmailedByAddress.get(a.email);
    if (seen == null || t > seen) lastEmailedByAddress.set(a.email, t);
  }
  // email → { token, items[] } for cards that dropped or first listed. Declared
  // before quiet(), which reads it.
  const byEmail = new Map<string, { token: string; items: PriceDropItem[]; anonymous: boolean; userId: string | null }>();
  // An address with a digest already queued in THIS run is not "quiet" for it: a
  // second card joins that one email instead of waiting a week. Without the
  // exemption, the in-run cooldown stamp in queue() deferred every card after the
  // first — exactly what a release day listing several watched cards would hit.
  const quiet = (email: string) => {
    if (byEmail.has(email)) return false;
    const last = lastEmailedByAddress.get(email);
    return addressInCooldown({ lastEmailedAt: last == null ? null : new Date(last), now });
  };

  // Drops that deserved an email but hit the weekly cap. Their baselines are held
  // (see below) so the drop is DEFERRED, not lost: it keeps re-detecting every
  // run until the window opens, and the digest it eventually lands in reports the
  // fall from the pre-drop price rather than from one day's step.
  const deferredIds = new Set<string>();

  // Baseline writes to apply after we've decided who to notify.
  const updates: { id: string; price: number }[] = [];
  const notifiedIds: string[] = [];
  // For each alert we DID email, the lowest-emailed watermark to persist
  // (min of its old watermark and the price we just sent).
  const notifiedLowest = new Map<string, number>();
  // New digests opened by first-price notices this run (FIRST_PRICE_SEND_CAP).
  let listedDigests = 0;
  // New digests opened by the paid triggers this run (PAID_SEND_CAP).
  let paidDigests = 0;

  const queue = (a: (typeof alerts)[number], item: PriceDropItem) => {
    const bucket = byEmail.get(a.email) ?? { token: a.unsubToken, items: [], anonymous: true, userId: null };
    bucket.items.push(item);
    // ANY linked row means this address has an account (claimAlertsForUser
    // adopts them all on signup, but pre-claim mixes can exist briefly).
    if (a.userId != null) bucket.anonymous = false;
    // First linked row's userId wins — enough to reach notify() below; a
    // pre-claim mix of linked/unlinked rows for the same address still
    // shares one account once claimAlertsForUser runs.
    if (bucket.userId == null) bucket.userId = a.userId;
    byEmail.set(a.email, bucket);
    // This address is now inside its quiet window for later runs — and within
    // THIS one, quiet()'s byEmail exemption lets further cards join this digest
    // rather than start a second one.
    lastEmailedByAddress.set(a.email, now.getTime());
  };

  const itemFor = (a: (typeof alerts)[number], market: Country, kind: NonNullable<PriceDropItem["kind"]>, oldCents: number | null, newCents: number): PriceDropItem => ({
    kind,
    cardId: a.card.id,
    name: a.card.name,
    setCode: a.card.setCode,
    collectorNumber: a.card.collectorNumber,
    url: `${SITE_URL}${cardHref(a.card)}`,
    oldCents,
    newCents,
    market,
  });

  // PASS 1 — THE PAID TRIGGERS, for entitled rows only, and before any free
  // rule runs. Two passes rather than one so the digest an address gets never
  // depends on row order: a paid alert opens (or joins) the digest first, and
  // that address's weekly-capped drops then join it in pass 2 instead of being
  // deferred a week behind an email that is going out anyway.
  const paidFired = new Set<string>();
  for (const a of alerts) {
    if (!entitled.get(a.id)) continue;
    const market = a.market as Country;
    const current = pickPrice(a.card, market);
    if (current == null) continue;
    const prev = a.lastPriceCents;
    const target = honouredTarget.get(a.id) ?? null;

    let item: PriceDropItem | null = null;
    if (shouldEmailTarget({ current, targetCents: target, lowestEmailedCents: a.lowestEmailedCents, lastNotifiedAt: a.lastNotifiedAt, now })) {
      summary.targets++;
      item = { ...itemFor(a, market, "target", prev, current), targetCents: target };
    } else if (ranksByMarket.get(market)?.has(a.card.id) && isBelowMarketNewLow({ current, prev, lowestEmailedCents: a.lowestEmailedCents })) {
      summary.belowMarket++;
      item = itemFor(a, market, "under-market", prev, current);
    }
    if (!item) continue;
    paidFired.add(a.id);
    // No weekly cap for the paid triggers; only the per-run send cap, which
    // defers (baseline held) exactly like a capped drop.
    if (!byEmail.has(a.email) && paidDigests >= PAID_SEND_CAP) {
      summary.deferred++;
      deferredIds.add(a.id);
      continue;
    }
    if (!byEmail.has(a.email)) paidDigests++;
    notifiedIds.push(a.id);
    notifiedLowest.set(a.id, a.lowestEmailedCents == null ? current : Math.min(a.lowestEmailedCents, current));
    queue(a, item);
  }

  // PASS 2 — THE FREE RULES, unchanged, for every row in scope that no paid
  // trigger took; and the baseline bookkeeping for every row in scope.
  for (const a of alerts) {
    if (!inScope(a)) continue;
    const market = a.market as Country;
    const current = pickPrice(a.card, market);
    if (current == null) continue; // no price in this market yet — nothing to compare

    const prev = a.lastPriceCents;
    if (paidFired.has(a.id)) {
      // Decided in pass 1.
    } else if (isFirstPrice(prev, current)) {
      // Never priced in this market before, priced now: the "now in stock" notice
      // (see isFirstPrice). Same address cooldown as a drop, plus the per-run send
      // cap; either one holds the baseline at null so the next run finds it again.
      summary.listed++;
      if (quiet(a.email) || (!byEmail.has(a.email) && listedDigests >= FIRST_PRICE_SEND_CAP)) {
        summary.deferred++;
        deferredIds.add(a.id);
      } else {
        if (!byEmail.has(a.email)) listedDigests++;
        notifiedIds.push(a.id);
        // The first price seeds the lowest-emailed watermark, so a later drop is a
        // "new low" only below what we just told them.
        notifiedLowest.set(a.id, a.lowestEmailedCents == null ? current : Math.min(a.lowestEmailedCents, current));
        queue(a, itemFor(a, market, "listed", null, current));
      }
    } else if (prev != null && current < prev) {
      // A genuine drop from the last price we saw. Whether we actually EMAIL it
      // is a separate, anti-spam decision (see shouldEmailDrop).
      summary.drops++;
      if (!shouldEmailDrop({ current, lowestEmailedCents: a.lowestEmailedCents, lastNotifiedAt: a.lastNotifiedAt, now })) {
        // A real drop we deliberately stay quiet about: not a new low, and the
        // last email is too recent to repeat. Counted so the cron log shows it.
        // Its baseline still advances — a sawtooth must not queue up forever.
        summary.suppressed++;
      } else if (quiet(a.email)) {
        // Worth sending, but this address has had a digest inside the last week.
        // Hold everything: no email, no watermark, and (below) no baseline move,
        // so it resurfaces and accumulates into the next digest instead.
        summary.deferred++;
        deferredIds.add(a.id);
      } else {
        notifiedIds.push(a.id);
        notifiedLowest.set(a.id, a.lowestEmailedCents == null ? current : Math.min(a.lowestEmailedCents, current));
        queue(a, itemFor(a, market, "drop", prev, current));
      }
    }

    // Advance the baseline whenever the price moved (up or down, or first time),
    // even for a suppressed drop — so the NEXT drop is still measured against the
    // most recent price, not a stale one. A paid alert can fire with the price
    // unmoved (a reminder, or a target set under today's price), so a fired
    // paid row is written too: its watermark and lastNotifiedAt ride on this
    // write, and without it the same alert would re-send every run.
    if (prev !== current || paidFired.has(a.id)) updates.push({ id: a.id, price: current });
  }

  // THE STORE BEHIND EACH EMAILED PRICE — every alert email, free drops too,
  // names the store and links the exact listing, so the reader can check it
  // before paying. One capped query for every card in every digest.
  const firedItems = [...byEmail.values()].flatMap((b) => b.items);
  const stores = await cheapestStores(db, firedItems);
  for (const item of firedItems) {
    const store = item.cardId ? stores.get(storeKey(item.market, item.cardId)) : undefined;
    if (store) item.store = store;
  }

  // Send one digest per email. Sequential to stay gentle on the email provider's
  // rate limits; the daily volume is small.
  const failedEmails = new Set<string>();
  for (const [email, { token, items, anonymous, userId }] of byEmail) {
    const unsubUrl = `${SITE_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
    const sent = await sendPriceDropEmail(email, items, unsubUrl, anonymous);
    if (sent) {
      summary.emails++;
      // In-app mirror of the email, for the account's own bell — only when
      // the watch is actually linked to one (anonymous watchers have nowhere
      // in-app to see it).
      if (userId && deps.notifyUsers !== false) {
        const title = notificationTitle(items);
        void notify(userId, "price_drop", title, "Check your watchlist for the new price.", "/watching").catch(() => {});
      }
    } else failedEmails.add(email);
  }

  // Persist new baselines + note who we notified. Deferring the write until after
  // sending is only half of what makes a failed send retryable — the baseline for
  // THAT alert has to be held back too. Advancing it regardless (which is what
  // this did) means the next run compares the new, lower price against itself,
  // sees no drop, and the alert the user asked for is gone for good: silent, and
  // invisible in the summary, which counts `updated` either way.
  //
  // Only alerts whose digest failed (a drop, or a first-price notice) are held. A
  // rise, or any other move, sends no email and still advances — otherwise a
  // single failing address would freeze baselines it has nothing to do with.
  const notifiedSet = new Set(notifiedIds);
  // Two reasons a baseline is held back, and they mean the same thing: this drop
  // has not reached the subscriber yet, so the next run must still see it.
  //   • its digest failed to send, or
  //   • the weekly cap (or FIRST_PRICE_SEND_CAP / PAID_SEND_CAP) deferred it.
  const heldIds = new Set<string>(deferredIds);
  if (failedEmails.size) {
    for (const a of alerts) {
      if (failedEmails.has(a.email) && notifiedSet.has(a.id)) heldIds.add(a.id);
    }
  }
  const dueUpdates = heldIds.size ? updates.filter((u) => !heldIds.has(u.id)) : updates;
  // The emailed-and-sent alerts (notified minus any held for a failed digest).
  // Every one of these is also in dueUpdates — a drop moved its baseline, and a
  // fired paid row is pushed even unmoved — so its watermark/notified-at can be
  // written in the same per-row update below.
  const dueNotifiedSet = new Set(heldIds.size ? notifiedIds.filter((id) => !heldIds.has(id)) : notifiedIds);

  summary.updated = dueUpdates.length;
  summary.held = updates.length - dueUpdates.length;
  if (dueUpdates.length) {
    await db.$transaction(
      dueUpdates.map((u) => {
        // Every moved baseline advances lastPriceCents. An alert we ALSO emailed
        // advances its lowest-emailed watermark and lastNotifiedAt in the SAME
        // write, so the anti-spam state can never drift from the baseline it was
        // decided against. A held (failed-send) drop is already excluded from
        // dueUpdates, so it keeps its old watermark and re-fires next run.
        const data: { lastPriceCents: number; lowestEmailedCents?: number; lastNotifiedAt?: Date } = {
          lastPriceCents: u.price,
        };
        if (dueNotifiedSet.has(u.id)) {
          data.lowestEmailedCents = notifiedLowest.get(u.id)!;
          data.lastNotifiedAt = now;
        }
        return db.priceAlert.update({ where: { id: u.id }, data });
      })
    );
  }

  return summary;
}

// The in-app notification's title for one digest.
function notificationTitle(items: PriceDropItem[]): string {
  const one = items.length === 1 ? items[0]! : null;
  if (items.some((i) => i.kind === "target")) {
    return one ? `${one.name} hit your target price` : `${items.length} watched cards have price news`;
  }
  if (items.every((i) => i.kind === "listed")) {
    return one ? `${one.name} is now in stock` : `${items.length} watched cards are now in stock`;
  }
  return one ? `${one.name} just dropped` : `${items.length} watched cards just dropped`;
}

const storeKey = (market: string, cardId: string) => `${market}:${cardId}`;

// The listing behind each emailed price: ONE query for every fired card, capped
// at STORE_ROWS_PER_CARD rows per card, reduced to the cheapest per (market,
// card). Each card's clause is bounded by the price we are about to email —
// Card.lowestPriceCents* is exactly the minimum over these same rows (in stock,
// no reference/fallback retailer), so the row at that price is the store that
// set it — which also keeps a card with dozens of cheap listings from eating
// another card's share of the cap. Shows that row's own price (and condition,
// and postage when the store states it). A row the import has since moved
// simply isn't found, and the email falls back to the card page link. Never
// throws: the store line is a courtesy, the alert is the point.
async function cheapestStores(
  db: Pick<typeof prisma, "retailerPrice">,
  items: PriceDropItem[],
): Promise<Map<string, AlertStore>> {
  const wanted = new Map<string, { cardId: string; country: string; priceCents: { lte: number } }>();
  for (const i of items) {
    if (!i.cardId) continue;
    const k = storeKey(i.market, i.cardId);
    if (!wanted.has(k)) wanted.set(k, { cardId: i.cardId, country: i.market, priceCents: { lte: i.newCents } });
  }
  const out = new Map<string, AlertStore>();
  if (!wanted.size) return out;
  try {
    const rows = await db.retailerPrice.findMany({
      where: {
        inStock: true,
        retailer: { notIn: [...ALL_FALLBACK_RETAILERS] },
        OR: [...wanted.values()],
      },
      select: { cardId: true, country: true, retailer: true, retailerName: true, priceCents: true, shippingCents: true, condition: true, url: true },
      orderBy: { priceCents: "asc" },
      take: wanted.size * STORE_ROWS_PER_CARD,
    });
    for (const r of rows) {
      const k = storeKey(r.country, r.cardId);
      if (out.has(k) || !wanted.has(k)) continue;
      out.set(k, {
        name: r.retailerName,
        url: affiliateUrl(r.url, r.retailer, "/watching"),
        priceCents: r.priceCents,
        shippingCents: r.shippingCents ?? null,
        condition: r.condition ?? null,
      });
    }
  } catch {
    /* no store lines this run — the digest still goes, linking the card page */
  }
  return out;
}
