import type { prisma } from "./db";
import type { Country } from "./country";
import { SITE_URL } from "./site";
import { cardHref } from "./card-url";
import { alertPairKey, computeAlertPrices, type AlertPrice, type AlertPriceDb } from "./alert-price";
import { CONFIRMATION_CARD_ROWS, type AlertConfirmationCard } from "./email";

// THE GLOBAL DAILY CAP ON WATCH-CONFIRMATION EMAILS (/api/alerts/subscribe).
//
// That route takes any address with no double opt-in, and Resend's 100/day
// quota is shared with verification, password reset and the alert digests
// themselves, so ~100 posted addresses could starve all of them. rateLimit()
// cannot be the cap — it is per serverless instance — so the database keeps
// the count.
//
// This bounds the CONFIRMATIONS only. The drop digests those posted addresses
// would get on the next daily run are bounded separately, by
// FIRST_CONTACT_SEND_CAP in lib/price-alerts.ts (review, 2026-09-25).
//
// WHAT IS COUNTED: confirmations sent, one per call, and nothing else. The
// first version counted anonymous PriceAlert rows created in the last 24h,
// which is a different number. A returning anonymous watcher adds a row on
// every heart click (PriceAlertModal's silent path) but is never re-confirmed,
// so 30 such clicks shut new addresses out; and a signed-in subscriber's
// confirmation (userId set) was sent but never counted. The route calls this
// only at the moment it is about to send, so the counter IS the confirmations.
//
// The count lives in the existing Counter table (one row per UTC day, key
// "alert-confirm:YYYY-MM-DD" — a few bytes a day, no schema change). The
// upsert is a single INSERT … ON CONFLICT DO UPDATE on the primary key, so two
// concurrent requests can't both read 29. Fails CLOSED: any error (including
// the rare first-of-the-day insert race) sends nothing — a capped confirmation
// costs only the courtesy email; the watch itself is already saved.
export const CONFIRMATION_DAILY_CAP = 30;

export type ConfirmationDb = {
  counter: Pick<typeof prisma.counter, "upsert">;
};

export function confirmationKey(now: Date): string {
  return `alert-confirm:${now.toISOString().slice(0, 10)}`;
}

// Claim one of today's confirmation slots. true = send it; false = the cap is
// reached (or the count failed). Every call claims, so call it only when the
// email is otherwise certain to go.
export async function claimConfirmationSlot(db: ConfirmationDb, now: Date = new Date()): Promise<boolean> {
  const key = confirmationKey(now);
  try {
    const row = await db.counter.upsert({
      where: { key },
      create: { key, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    return row.value <= CONFIRMATION_DAILY_CAP;
  } catch {
    return false;
  }
}

// ── What the confirmation lists ──────────────────────────────────────────────
// The confirmation names the cards being watched, each with TODAY'S ALERT
// PRICE (lib/alert-price.ts: cheapest in-stock Near Mint or unstated-condition
// copy at a store, no eBay) and that copy's condition — the same figure the
// alerts compare and the new watch is seeded from (the subscribe route passes
// its own read as `known`), so the first alert's "was" and this email agree. One bounded query for at most CONFIRMATION_CARD_ROWS cards;
// only ever reached by a confirmation that is about to be sent (the daily cap
// above has already been claimed).
export async function confirmationCards(
  db: AlertPriceDb,
  cards: readonly { id: string; name: string; slug: string | null; setCode: string; collectorNumber: string }[],
  market: Country,
  now: Date = new Date(),
  // The subscribe route already read these prices to seed the new watches;
  // passing them keeps the email and the baseline on the same read.
  known?: Map<string, AlertPrice> | null,
): Promise<AlertConfirmationCard[]> {
  const shown = cards.slice(0, CONFIRMATION_CARD_ROWS);
  const missing = shown.filter((c) => !known?.has(alertPairKey(market, c.id)));
  const read = missing.length
    ? await computeAlertPrices(db, missing.map((c) => ({ cardId: c.id, market })), now, { slim: true }).catch(() => null)
    : null;
  const prices = { get: (k: string) => known?.get(k) ?? read?.get(k) };
  return shown.map((c) => {
    const p = prices?.get(alertPairKey(market, c.id));
    const priced = p?.state === "priced";
    return {
      name: c.name,
      setCode: c.setCode,
      collectorNumber: c.collectorNumber,
      url: `${SITE_URL}${cardHref(c)}`,
      market,
      priceCents: priced ? p!.priceCents : null,
      storeName: priced ? p!.stores[0]?.name ?? null : null,
      condition: priced ? p!.condition : null,
    };
  });
}
