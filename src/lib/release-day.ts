// Release-day blast: "the set is out, the card database + live prices are up,
// sealed is priced too" to the newsletter list.
//
// WHY THIS IS A LIB (and the send runs on VERCEL, not in CI): RESEND_API_KEY is a
// Vercel environment variable — that's how the weekly digest, verification and
// price-alert emails all send. A GitHub Actions job has the DB but NOT the mail
// key, so running the blast there silently delivers nothing. So the actual send
// lives behind /api/cron/release-day-email (Vercel, where mail works) and CI's
// only job is to authenticate the trigger — exactly the split refresh-prices.yml
// already uses for /api/revalidate.
//
// Every figure in the email is queried here and passed in; nothing is hardcoded in
// the template. Any stat that fails to resolve is omitted from the copy rather
// than guessed (see lib/email.ts).
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { sendReleaseDayEmail, isEmailEnabled, type ReleaseDayStats } from "./email";
import { SITE_URL } from "./site";
import { setBySlug } from "./constants";
import { RETAILER_LIST } from "./retailers";
import { COUNTRY_LIST, DEFAULT_COUNTRY, priceField } from "./country";
import { getSealedGroups } from "./sealed-import";

export interface ReleaseDayResult {
  ok: boolean;
  error?: string;
  dryRun: boolean;
  set?: string;
  stats?: ReleaseDayStats;
  subscribers?: number;
  pending?: number; // not yet emailed for this campaign
  sent?: number;
  failed?: number;
  remaining?: number; // still pending after this run (batch cap hit)
}

// Serverless functions have a wall-clock ceiling, and the provider is rate-limited
// to ~2 req/s, so a run is capped and RESUMABLE rather than risking a timeout
// mid-blast. Callers can just invoke the endpoint again; the per-subscriber
// campaign marker means nobody is emailed twice.
const DEFAULT_BATCH = 200;
const THROTTLE_MS = 600;

export async function runReleaseDayBlast(opts: {
  setSlug: string;
  dryRun: boolean;
  limit?: number;
}): Promise<ReleaseDayResult> {
  const { setSlug, dryRun } = opts;
  const limit = opts.limit && opts.limit > 0 ? opts.limit : DEFAULT_BATCH;
  const campaign = `release-${setSlug}`;

  const set = setBySlug(setSlug);
  if (!set) return { ok: false, dryRun, error: `Unknown set slug "${setSlug}"` };
  // Never announce a set that isn't actually out. `comingSoon` is the codebase's
  // own source of truth for release status (lib/constants.ts).
  if (set.comingSoon) return { ok: false, dryRun, error: `${set.name} is still flagged comingSoon` };
  if (!dryRun && !isEmailEnabled()) {
    return { ok: false, dryRun, error: "RESEND_API_KEY is not set in this environment — nothing would send" };
  }

  const cardCount = await prisma.card.count({ where: { setCode: set.code } }).catch(() => null);
  const pricedCount = await prisma.card
    .count({ where: { setCode: set.code, [priceField(DEFAULT_COUNTRY)]: { not: null } } })
    .catch(() => null);
  const sealedAvailable = await getSealedGroups(DEFAULT_COUNTRY)
    .then((g) => g.some((x) => x.setCode === set.code))
    .catch(() => false);

  const stats: ReleaseDayStats = {
    cardCount,
    pricedCount,
    storeCount: RETAILER_LIST.length,
    marketCount: COUNTRY_LIST.length,
    sealedAvailable,
  };

  // Refuse to announce an empty database.
  if (cardCount === 0) return { ok: false, dryRun, set: set.name, stats, error: "Zero cards tracked for this set" };

  const subscribers = await prisma.newsletterSubscriber.count();
  const pendingRows = await prisma.newsletterSubscriber.findMany({
    where: { NOT: { lastEditionKey: campaign } },
    select: { id: true, email: true, unsubToken: true },
  });
  const pending = pendingRows.length;

  if (dryRun) {
    return { ok: true, dryRun, set: set.name, stats, subscribers, pending, sent: 0, failed: 0, remaining: pending };
  }

  const batch = pendingRows.slice(0, limit);
  let sent = 0;
  let failed = 0;
  for (const s of batch) {
    let token = s.unsubToken;
    if (!token) {
      token = randomUUID();
      await prisma.newsletterSubscriber.update({ where: { id: s.id }, data: { unsubToken: token } }).catch(() => {});
    }
    const unsubUrl = `${SITE_URL}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
    const ok = await sendReleaseDayEmail(s.email, set.name, setSlug, unsubUrl, stats);
    if (ok) {
      sent++;
      // Stamp ONLY on success, so a failure is retried by the next run rather than
      // silently skipped forever.
      await prisma.newsletterSubscriber
        .update({ where: { id: s.id }, data: { lastEditionKey: campaign } })
        .catch(() => {});
    } else {
      failed++;
    }
    if (batch.length > 1) await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  return { ok: true, dryRun, set: set.name, stats, subscribers, pending, sent, failed, remaining: pending - sent };
}
