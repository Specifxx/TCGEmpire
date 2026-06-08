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
      card: {
        select: {
          id: true,
          name: true,
          slug: true,
          setCode: true,
          collectorNumber: true,
          lowestPriceCents: true,
          lowestPriceCentsNz: true,
          lowestPriceCentsUs: true,
          lowestPriceCentsUk: true,
        },
      },
    },
  });

  const summary: AlertRunSummary = { alerts: alerts.length, drops: 0, emails: 0, updated: 0 };

  // email → { token, items[] } for cards that dropped.
  const byEmail = new Map<string, { token: string; items: PriceDropItem[] }>();
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
      const bucket = byEmail.get(a.email) ?? { token: a.unsubToken, items: [] };
      bucket.items.push(item);
      byEmail.set(a.email, bucket);
    }

    // Advance the baseline whenever the price moved (up or down, or first time).
    if (prev !== current) updates.push({ id: a.id, price: current });
  }

  // Send one digest per email. Sequential to stay gentle on the email provider's
  // rate limits; the daily volume is small.
  for (const [email, { token, items }] of byEmail) {
    const unsubUrl = `${SITE_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
    const sent = await sendPriceDropEmail(email, items, unsubUrl);
    if (sent) summary.emails++;
  }

  // Persist new baselines + note who we notified. Done after sending so a send
  // failure doesn't swallow the drop (we'd retry it on the next run).
  summary.updated = updates.length;
  if (updates.length) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.priceAlert.update({ where: { id: u.id }, data: { lastPriceCents: u.price } })
      )
    );
  }
  if (notifiedIds.length) {
    await prisma.priceAlert.updateMany({
      where: { id: { in: notifiedIds } },
      data: { lastNotifiedAt: new Date() },
    });
  }

  return summary;
}
