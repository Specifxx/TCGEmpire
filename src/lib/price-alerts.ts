import { prisma } from "./db";
import { pickPrice, type Country } from "./country";
import { cardHref } from "./card-url";
import { sendPriceDropEmail as sendPriceDropEmailImpl, type PriceDropItem } from "./email";
import { SITE_URL } from "./site";
import { notify } from "./notifications";

export interface AlertRunSummary {
  alerts: number; // rows examined
  drops: number; // individual card price drops found
  listed: number; // watched cards that got their FIRST price in the alert's market
  suppressed: number; // drops NOT emailed (not a new low, and no reminder due) — anti-spam
  deferred: number; // drops/first listings worth sending, held for the weekly cap (or FIRST_PRICE_SEND_CAP) — they WILL send later
  emails: number; // recipients emailed
  updated: number; // baselines moved (up or down)
  held: number; // baselines deliberately NOT moved (failed digest, or deferred above)
}

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
// no new query or column. prev == null only ever means "never priced" — the loop
// skips a null CURRENT price without touching the baseline, so a card that goes
// out of stock and relists keeps its old non-null baseline and does NOT fire.
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
// sender (tests/price-alerts-first-price.test.ts); the cron passes nothing.
// notify() is not injectable — test rows carry no userId, so it never runs.
export interface AlertRunDeps {
  db?: Pick<typeof prisma, "priceAlert" | "$transaction">;
  sendPriceDropEmail?: typeof sendPriceDropEmailImpl;
  now?: Date;
}

export async function runPriceAlerts(deps: AlertRunDeps = {}): Promise<AlertRunSummary> {
  const db = deps.db ?? prisma;
  const sendPriceDropEmail = deps.sendPriceDropEmail ?? sendPriceDropEmailImpl;
  const alerts = await db.priceAlert.findMany({
    select: {
      id: true,
      email: true,
      market: true,
      lastPriceCents: true,
      // The anti-spam watermark + when we last emailed, both read by
      // shouldEmailDrop() below to decide whether a fresh drop is worth sending.
      lowestEmailedCents: true,
      lastNotifiedAt: true,
      unsubToken: true,
      // Whether this watch belongs to an account — decides if the drop email
      // carries the "create a free account" block (anonymous watchers only).
      userId: true,
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

  const summary: AlertRunSummary = { alerts: alerts.length, drops: 0, listed: 0, suppressed: 0, deferred: 0, emails: 0, updated: 0, held: 0 };
  const now = deps.now ?? new Date();

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

  for (const a of alerts) {
    const market = a.market as Country;
    const current = pickPrice(a.card, market);
    if (current == null) continue; // no price in this market yet — nothing to compare

    const prev = a.lastPriceCents;
    if (isFirstPrice(prev, current)) {
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
        queue(a, {
          kind: "listed",
          name: a.card.name,
          setCode: a.card.setCode,
          collectorNumber: a.card.collectorNumber,
          url: `${SITE_URL}${cardHref(a.card)}`,
          oldCents: null,
          newCents: current,
          market,
        });
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
        queue(a, {
          kind: "drop",
          name: a.card.name,
          setCode: a.card.setCode,
          collectorNumber: a.card.collectorNumber,
          url: `${SITE_URL}${cardHref(a.card)}`,
          oldCents: prev,
          newCents: current,
          market,
        });
      }
    }

    // Advance the baseline whenever the price moved (up or down, or first time),
    // even for a suppressed drop — so the NEXT drop is still measured against the
    // most recent price, not a stale one.
    if (prev !== current) updates.push({ id: a.id, price: current });
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
      if (userId) {
        const allListed = items.every((i) => i.kind === "listed");
        const title = allListed
          ? items.length === 1 ? `${items[0].name} is now in stock` : `${items.length} watched cards are now in stock`
          : items.length === 1 ? `${items[0].name} just dropped` : `${items.length} watched cards just dropped`;
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
  //   • the weekly cap (or, for a first price, FIRST_PRICE_SEND_CAP) deferred it.
  const heldIds = new Set<string>(deferredIds);
  if (failedEmails.size) {
    for (const a of alerts) {
      if (failedEmails.has(a.email) && notifiedSet.has(a.id)) heldIds.add(a.id);
    }
  }
  const dueUpdates = heldIds.size ? updates.filter((u) => !heldIds.has(u.id)) : updates;
  // The emailed-and-sent alerts (notified minus any held for a failed digest).
  // Every one of these is also in dueUpdates — a drop moved its baseline — so its
  // watermark/notified-at can be written in the same per-row update below.
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
