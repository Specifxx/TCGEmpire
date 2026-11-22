// One-off "your watchlist" recap to DORMANT Rift accounts (Head of Retention, 2026-11-22;
// strategy/audience-programme Pillar 3: "one re-engagement email to dormant Rift accounts with
// their own watched cards' real price moves").
//
// AUDIENCE (recapAudience, pure): accounts older than DORMANT_DAYS that have not been active or
// signed in for DORMANT_DAYS, with at least one card on their watchlist (PriceAlert rows that
// carry their userId), not admins, not seed personas, not opted out of announcements. Deduped by
// lowercased email. Newest accounts first. Idempotent through User.watchRecapSentAt, stamped
// only after a successful send.
//
// CONTENT (recapRows, pure): each watched card's TCGplayer market price today and RECAP_DAYS ago,
// from the committed price history (lib/price-history-store.ts). Real figures only: a card
// without both points shows today's price with no change, and an account with no priced card
// at all is skipped, never sent an empty email.
//
// SENDING. A marketing send (MARKETING_EMAIL_OFF): it goes out only once the owner lets the
// "watch-recap" campaign through MARKETING_ALLOWED. Until then every send is refused and counts
// as failed, and nothing is stamped. The test send to the owner works the same way.
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { NOT_SEED_WHERE, isSeedEmail } from "./premium";
import { tcgMarketHistory } from "./price-history-store";
import { cardHref } from "./card-url";
import { formatMoney } from "./format";
import { SITE_URL } from "./site";
import { announcementUnsubUrls } from "./premium-offer";
import { getLastEmailError, isBrevoEnabled, sendWatchRecapEmail, type WatchRecapRow } from "./email";

export const WATCH_RECAP_CAMPAIGN = "watch-recap-2026-11";
export const DORMANT_DAYS = 30;
export const RECAP_DAYS = 30;
export const RECAP_MAX_ROWS = 6;
export const DEFAULT_RECAP_BATCH = 90;
const DAY = 86_400_000;

export interface RecapUserRow {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: Date;
  lastActiveAt: Date | null;
  lastLoginAt: Date | null;
  watchRecapSentAt: Date | null;
}

export function isDormant(u: Pick<RecapUserRow, "createdAt" | "lastActiveAt" | "lastLoginAt">, now: number): boolean {
  const cutoff = now - DORMANT_DAYS * DAY;
  if (u.createdAt.getTime() > cutoff) return false;
  const last = Math.max(u.lastActiveAt?.getTime() ?? 0, u.lastLoginAt?.getTime() ?? 0);
  return last <= cutoff;
}

export function recapAudience(
  rows: RecapUserRow[],
  watched: Map<string, string[]>,
  optedOut: Set<string>,
  now: number,
): { dormant: number; withWatches: number; optedOut: number; pending: RecapUserRow[]; alreadySent: number } {
  let dormant = 0;
  let withWatches = 0;
  let opted = 0;
  let alreadySent = 0;
  const seen = new Set<string>();
  const pending: RecapUserRow[] = [];
  const ordered = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const u of ordered) {
    const key = u.email.trim().toLowerCase();
    if (!key || seen.has(key) || u.isAdmin || isSeedEmail(key)) continue;
    if (!isDormant(u, now)) continue;
    dormant++;
    if (!(watched.get(u.id)?.length)) continue;
    withWatches++;
    if (optedOut.has(key)) {
      opted++;
      continue;
    }
    seen.add(key);
    if (u.watchRecapSentAt) {
      alreadySent++;
      continue;
    }
    pending.push(u);
  }
  return { dormant, withWatches, optedOut: opted, pending, alreadySent };
}

export interface RecapCard {
  id: string;
  slug: string | null;
  name: string;
  setName: string;
  imageUrl: string | null;
}

/** Today's TCGplayer market price and the one RECAP_DAYS ago, per watched card; biggest moves first. */
export function recapRows(
  cards: RecapCard[],
  history: (cardId: string) => { t: number; usdCents: number }[],
  now: number,
  utm: string,
): WatchRecapRow[] {
  const then = now - RECAP_DAYS * DAY;
  const rows: (WatchRecapRow & { abs: number })[] = [];
  for (const c of cards) {
    const h = history(c.id);
    if (!h.length) continue;
    const latest = h[h.length - 1];
    if (latest.t < now - 10 * DAY || !(latest.usdCents > 0)) continue; // a stale price is not "today"
    let past: { t: number; usdCents: number } | null = null;
    for (const p of h) if (p.t <= then) past = p;
    const pct = past && past.usdCents > 0 ? Math.round(((latest.usdCents - past.usdCents) / past.usdCents) * 1000) / 10 : null;
    rows.push({
      name: c.name,
      setName: c.setName,
      href: `${SITE_URL}${cardHref(c)}?${utm}`,
      imageUrl: c.imageUrl,
      now: formatMoney(latest.usdCents, "USD"),
      then: past ? formatMoney(past.usdCents, "USD") : null,
      changePct: pct,
      abs: pct == null ? -1 : Math.abs(pct),
    });
  }
  rows.sort((a, b) => b.abs - a.abs);
  return rows.slice(0, RECAP_MAX_ROWS).map(({ abs: _abs, ...r }) => r);
}

export interface WatchRecapResult {
  ok: boolean;
  dryRun: boolean;
  error?: string;
  dormant?: number;
  withWatches?: number;
  optedOut?: number;
  alreadySent?: number;
  pending?: number;
  sent?: number;
  failed?: number;
  skippedNoPrices?: number;
  remaining?: number;
  errors?: string[];
}

const UTM = `src=watch-recap&utm_source=email&utm_medium=email&utm_campaign=${WATCH_RECAP_CAMPAIGN}`;

async function loadWatched(userIds?: string[]): Promise<Map<string, string[]>> {
  const rows = await prisma.priceAlert.findMany({
    where: { userId: userIds ? { in: userIds } : { not: null } },
    select: { userId: true, cardId: true },
  });
  const m = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.userId) continue;
    const list = m.get(r.userId) ?? [];
    if (!list.includes(r.cardId)) list.push(r.cardId);
    m.set(r.userId, list);
  }
  return m;
}

async function loadCards(ids: string[]): Promise<RecapCard[]> {
  if (!ids.length) return [];
  const cards = await prisma.card.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true, name: true, setName: true, imageThumbUrl: true, imageUrl: true },
  });
  return cards.map((c) => ({ id: c.id, slug: c.slug, name: c.name, setName: c.setName, imageUrl: c.imageThumbUrl ?? c.imageUrl ?? null }));
}

async function loadOptedOut(): Promise<Set<string>> {
  const rows = await prisma.announcementOptOut
    .findMany({ where: { optedOutAt: { not: null } }, select: { email: true } })
    .catch(() => [] as { email: string }[]);
  return new Set(rows.map((o) => o.email.trim().toLowerCase()));
}

export async function runWatchRecap(opts: { dryRun: boolean; limit?: number }): Promise<WatchRecapResult> {
  const { dryRun } = opts;
  const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 300) : DEFAULT_RECAP_BATCH;
  if (!dryRun && !isBrevoEnabled()) return { ok: false, dryRun, error: "BREVO_API_KEY is not set in this environment — nothing would send" };
  const now = Date.now();
  const [users, watched, optedOut] = await Promise.all([
    prisma.user.findMany({
      where: NOT_SEED_WHERE,
      select: { id: true, email: true, displayName: true, isAdmin: true, createdAt: true, lastActiveAt: true, lastLoginAt: true, watchRecapSentAt: true },
    }),
    loadWatched(),
    loadOptedOut(),
  ]);
  const a = recapAudience(users, watched, optedOut, now);
  const base = { ok: true, dryRun, dormant: a.dormant, withWatches: a.withWatches, optedOut: a.optedOut, alreadySent: a.alreadySent, pending: a.pending.length };
  if (dryRun) return { ...base, sent: 0, failed: 0, remaining: a.pending.length };

  const batch = a.pending.slice(0, limit);
  const cards = new Map((await loadCards([...new Set(batch.flatMap((u) => watched.get(u.id) ?? []))])).map((c) => [c.id, c]));
  let sent = 0;
  let failed = 0;
  let skippedNoPrices = 0;
  const errors = new Set<string>();
  for (const u of batch) {
    const rows = recapRows((watched.get(u.id) ?? []).map((id) => cards.get(id)).filter((c): c is RecapCard => !!c), tcgMarketHistory, now, UTM);
    if (!rows.length) {
      skippedNoPrices++;
      continue;
    }
    const key = u.email.trim().toLowerCase();
    const token = await prisma.announcementOptOut
      .upsert({ where: { email: key }, create: { email: key, token: randomUUID() }, update: {} })
      .then((r) => r.token)
      .catch(() => null);
    if (!token) {
      failed++;
      if (errors.size < 5) errors.add("opt-out row could not be written");
      continue;
    }
    const ok = await sendWatchRecapEmail(u.email, { displayName: u.displayName, rows, days: RECAP_DAYS, watchlistUrl: `${SITE_URL}/watching?${UTM}`, ...announcementUnsubUrls(token) }).catch(() => false);
    if (ok) {
      sent++;
      await prisma.user.update({ where: { id: u.id }, data: { watchRecapSentAt: new Date() } }).catch(() => {});
    } else {
      failed++;
      if (errors.size < 5) errors.add(getLastEmailError() ?? "the mail provider returned false");
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return { ...base, sent, failed, skippedNoPrices, remaining: a.pending.length - sent - skippedNoPrices, ...(errors.size ? { errors: [...errors] } : {}) };
}

/**
 * A test copy to the owner (ops/owner.ts, chosen on the server), built from the dormant account with
 * the most watched cards, so the owner sees a real recap. No stamp, dummy unsubscribe token.
 */
export async function sendWatchRecapTest(to: string): Promise<{ ok: boolean; error?: string; cards?: number }> {
  if (!isBrevoEnabled()) return { ok: false, error: "BREVO_API_KEY is not set" };
  const now = Date.now();
  const [users, watched] = await Promise.all([
    prisma.user.findMany({ where: NOT_SEED_WHERE, select: { id: true, email: true, displayName: true, isAdmin: true, createdAt: true, lastActiveAt: true, lastLoginAt: true, watchRecapSentAt: true } }),
    loadWatched(),
  ]);
  const sample = recapAudience(users, watched, new Set(), now).pending.sort((x, y) => (watched.get(y.id)?.length ?? 0) - (watched.get(x.id)?.length ?? 0))[0];
  if (!sample) return { ok: false, error: "no dormant account with a watchlist" };
  const cards = await loadCards(watched.get(sample.id) ?? []);
  const rows = recapRows(cards, tcgMarketHistory, now, UTM);
  if (!rows.length) return { ok: false, error: "the sample account's cards have no current price" };
  const ok = await sendWatchRecapEmail(to, { displayName: "Test Recipient", rows, days: RECAP_DAYS, watchlistUrl: `${SITE_URL}/watching?${UTM}`, ...announcementUnsubUrls("test") }).catch(() => false);
  return ok ? { ok: true, cards: rows.length } : { ok: false, error: getLastEmailError() ?? "the mail provider rejected the test" };
}
