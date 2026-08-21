import { prisma } from "./db";
import { pickPrice, type Country } from "./country";
import { cardHref } from "./card-url";
import { sendPriceDropEmail, type PriceDropItem } from "./email";
import { SITE_URL } from "./site";

export interface AlertRunSummary {
  alerts: number; // rows examined
  drops: number; // individual card price drops found
  emails: number; // recipients emailed
  updated: number; // baselines moved (up or down)
  held: number; // baselines deliberately NOT moved because their digest failed to send
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
        },
      },
    },
  });

  const summary: AlertRunSummary = { alerts: alerts.length, drops: 0, emails: 0, updated: 0, held: 0 };

  // email → { token, items[] } for cards that dropped.
  const byEmail = new Map<string, { token: string; items: PriceDropItem[]; anonymous: boolean }>();
  // Baseline writes to apply after we've decided who to notify.
  const updates: { id: string; price: number }[] = [];
  const notifiedIds: string[] = [];

  for (const a of alerts) {
    const market = a.market as Country;
    const current = pickPrice(a.card, market);
    if (current == null) continue; // no price in this market yet — nothing to compare

    const prev = a.lastPriceCents;
    if (prev != null && current < prev) {
      // A genuine drop.
      summary.drops++;
      notifiedIds.push(a.id);
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
    }

    // Advance the baseline whenever the price moved (up or down, or first time).
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
  const dueNotifiedIds = heldIds.size ? notifiedIds.filter((id) => !heldIds.has(id)) : notifiedIds;

  summary.updated = dueUpdates.length;
  summary.held = updates.length - dueUpdates.length;
  if (dueUpdates.length) {
    await prisma.$transaction(
      dueUpdates.map((u) =>
        prisma.priceAlert.update({ where: { id: u.id }, data: { lastPriceCents: u.price } })
      )
    );
  }
  if (dueNotifiedIds.length) {
    await prisma.priceAlert.updateMany({
      where: { id: { in: dueNotifiedIds } },
      data: { lastNotifiedAt: new Date() },
    });
  }

  return summary;
}
