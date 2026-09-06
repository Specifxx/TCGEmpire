import { prisma } from "./db";
import { pickPrice, type Country } from "./country";
import { cardHref } from "./card-url";
import { sendPriceDropEmail, type PriceDropItem } from "./email";
import { SITE_URL } from "./site";

export interface AlertRunSummary {
  alerts: number; // rows examined
  drops: number; // individual card price drops found
  suppressed: number; // drops NOT emailed (not a new low, and no reminder due) — anti-spam
  emails: number; // recipients emailed
  updated: number; // baselines moved (up or down)
  held: number; // baselines deliberately NOT moved because their digest failed to send
}

// How long after the last email a repeat drop notification is allowed even when
// the price is NOT a new low — a gentle "still cheap" nudge rather than spam.
export const REMINDER_INTERVAL_MS = 60 * 24 * 60 * 60 * 1000; // ≈ 2 months

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
export async function runPriceAlerts(): Promise<AlertRunSummary> {
  const alerts = await prisma.priceAlert.findMany({
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

  const summary: AlertRunSummary = { alerts: alerts.length, drops: 0, suppressed: 0, emails: 0, updated: 0, held: 0 };
  const now = new Date();

  // email → { token, items[] } for cards that dropped.
  const byEmail = new Map<string, { token: string; items: PriceDropItem[]; anonymous: boolean }>();
  // Baseline writes to apply after we've decided who to notify.
  const updates: { id: string; price: number }[] = [];
  const notifiedIds: string[] = [];
  // For each alert we DID email, the lowest-emailed watermark to persist
  // (min of its old watermark and the price we just sent).
  const notifiedLowest = new Map<string, number>();

  for (const a of alerts) {
    const market = a.market as Country;
    const current = pickPrice(a.card, market);
    if (current == null) continue; // no price in this market yet — nothing to compare

    const prev = a.lastPriceCents;
    if (prev != null && current < prev) {
      // A genuine drop from the last price we saw. Whether we actually EMAIL it
      // is a separate, anti-spam decision (see shouldEmailDrop).
      summary.drops++;
      if (shouldEmailDrop({ current, lowestEmailedCents: a.lowestEmailedCents, lastNotifiedAt: a.lastNotifiedAt, now })) {
        notifiedIds.push(a.id);
        notifiedLowest.set(a.id, a.lowestEmailedCents == null ? current : Math.min(a.lowestEmailedCents, current));
        const item: PriceDropItem = {
          name: a.card.name,
          setCode: a.card.setCode,
          collectorNumber: a.card.collectorNumber,
          url: `${SITE_URL}${cardHref(a.card)}`,
          oldCents: prev,
          newCents: current,
          market,
        };
        const bucket = byEmail.get(a.email) ?? { token: a.unsubToken, items: [], anonymous: true };
        bucket.items.push(item);
        // ANY linked row means this address has an account (claimAlertsForUser
        // adopts them all on signup, but pre-claim mixes can exist briefly).
        if (a.userId != null) bucket.anonymous = false;
        byEmail.set(a.email, bucket);
      } else {
        // A real drop we deliberately stay quiet about: not a new low, and the
        // last email is too recent to repeat. Counted so the cron log shows it.
        summary.suppressed++;
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
  for (const [email, { token, items, anonymous }] of byEmail) {
    const unsubUrl = `${SITE_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
    const sent = await sendPriceDropEmail(email, items, unsubUrl, anonymous);
    if (sent) summary.emails++;
    else failedEmails.add(email);
  }

  // Persist new baselines + note who we notified. Deferring the write until after
  // sending is only half of what makes a failed send retryable — the baseline for
  // THAT alert has to be held back too. Advancing it regardless (which is what
  // this did) means the next run compares the new, lower price against itself,
  // sees no drop, and the alert the user asked for is gone for good: silent, and
  // invisible in the summary, which counts `updated` either way.
  //
  // Only drop-bearing alerts whose digest failed are held. A rise, or a first-ever
  // observation, sends no email and still advances — otherwise a single failing
  // address would freeze baselines it has nothing to do with.
  const notifiedSet = new Set(notifiedIds);
  const heldIds = failedEmails.size
    ? new Set(alerts.filter((a) => failedEmails.has(a.email) && notifiedSet.has(a.id)).map((a) => a.id))
    : new Set<string>();
  const dueUpdates = heldIds.size ? updates.filter((u) => !heldIds.has(u.id)) : updates;
  // The emailed-and-sent alerts (notified minus any held for a failed digest).
  // Every one of these is also in dueUpdates — a drop moved its baseline — so its
  // watermark/notified-at can be written in the same per-row update below.
  const dueNotifiedSet = new Set(heldIds.size ? notifiedIds.filter((id) => !heldIds.has(id)) : notifiedIds);

  summary.updated = dueUpdates.length;
  summary.held = updates.length - dueUpdates.length;
  if (dueUpdates.length) {
    await prisma.$transaction(
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
        return prisma.priceAlert.update({ where: { id: u.id }, data });
      })
    );
  }

  return summary;
}
