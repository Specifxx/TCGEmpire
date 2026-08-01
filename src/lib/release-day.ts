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

// WHO gets the blast.
//   subscribers — the opt-IN newsletter list only (NewsletterSubscriber).
//   users       — registered accounts (User). They never opted into marketing, so
//                 these get a real one-click opt-out (see AnnouncementOptOut) and
//                 are checked against the suppression list before every send.
//   all         — both, de-duplicated by email so nobody is emailed twice.
export type ReleaseDayAudience = "subscribers" | "users" | "all";

export interface ReleaseDayResult {
  ok: boolean;
  error?: string;
  dryRun: boolean;
  audience?: ReleaseDayAudience;
  set?: string;
  stats?: ReleaseDayStats;
  subscribers?: number; // opt-in list size
  users?: number; // registered accounts with an email
  suppressed?: number; // recipients skipped: previously opted out of announcements
  audienceSize?: number; // unique addresses in scope after dedupe + suppression
  pending?: number; // of those, not yet emailed for this campaign
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
  audience?: ReleaseDayAudience;
}): Promise<ReleaseDayResult> {
  const { setSlug, dryRun } = opts;
  const audience: ReleaseDayAudience = opts.audience ?? "subscribers";
  const limit = opts.limit && opts.limit > 0 ? opts.limit : DEFAULT_BATCH;
  const campaign = `release-${setSlug}`;

  const set = setBySlug(setSlug);
  if (!set) return { ok: false, dryRun, audience, error: `Unknown set slug "${setSlug}"` };
  // Never announce a set that isn't actually out. `comingSoon` is the codebase's
  // own source of truth for release status (lib/constants.ts).
  if (set.comingSoon) return { ok: false, dryRun, audience, error: `${set.name} is still flagged comingSoon` };
  if (!dryRun && !isEmailEnabled()) {
    return { ok: false, dryRun, audience, error: "RESEND_API_KEY is not set in this environment — nothing would send" };
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
  if (cardCount === 0) {
    return { ok: false, dryRun, audience, set: set.name, stats, error: "Zero cards tracked for this set" };
  }

  // ── Build the audience ─────────────────────────────────────────────────────
  // A recipient is either an opt-in subscriber (unsubscribe = the newsletter list)
  // or a registered account (unsubscribe = the announcement suppression list).
  // Deduped by lowercased email, subscribers winning, so someone who is BOTH is
  // emailed once and keeps their existing newsletter unsubscribe.
  type Recipient = {
    email: string;
    kind: "subscriber" | "user";
    subId?: string;
    unsubToken?: string | null;
    alreadySent?: boolean; // subscriber already stamped for THIS campaign
  };

  const subRows =
    audience === "users"
      ? []
      : await prisma.newsletterSubscriber.findMany({
          select: { id: true, email: true, unsubToken: true, lastEditionKey: true },
        });
  const userRows =
    audience === "subscribers"
      ? []
      : await prisma.user.findMany({ select: { email: true } });

  const subscribers = await prisma.newsletterSubscriber.count();
  const users = await prisma.user.count();

  const byEmail = new Map<string, Recipient>();
  for (const u of userRows) {
    const key = u.email.trim().toLowerCase();
    if (key) byEmail.set(key, { email: u.email, kind: "user" });
  }
  // Subscribers overwrite users: they have a real opt-in and their own unsub token.
  for (const r of subRows) {
    const key = r.email.trim().toLowerCase();
    if (key)
      byEmail.set(key, {
        email: r.email,
        kind: "subscriber",
        subId: r.id,
        unsubToken: r.unsubToken,
        alreadySent: r.lastEditionKey === campaign,
      });
  }

  // Suppression: anyone who has ever opted out of announcements is removed, no
  // matter which bucket they landed in. Checked at BUILD time (not per-send) so
  // the dry run reports the true reachable audience.
  const optedOut = await prisma.announcementOptOut
    .findMany({ where: { optedOutAt: { not: null } }, select: { email: true } })
    .catch(() => [] as { email: string }[]);
  let suppressed = 0;
  for (const o of optedOut) {
    const key = o.email.trim().toLowerCase();
    if (byEmail.delete(key)) suppressed++;
  }

  const all = [...byEmail.values()];
  const audienceSize = all.length;

  // Campaign idempotency. Subscribers use lastEditionKey (as before). Users have
  // no such column, so their "already emailed" marker is the existence of their
  // AnnouncementOptOut row — which is created at send time to mint the unsub
  // token, and therefore doubles as the sent-record.
  const emailedUsers = new Set(
    (await prisma.announcementOptOut.findMany({ select: { email: true } }).catch(() => []))
      .map((r: { email: string }) => r.email.trim().toLowerCase())
  );
  const pendingRows = all.filter((r) =>
    r.kind === "subscriber" ? !r.alreadySent : !emailedUsers.has(r.email.trim().toLowerCase())
  );
  const pending = pendingRows.length;

  if (dryRun) {
    return {
      ok: true, dryRun, audience, set: set.name, stats,
      subscribers, users, suppressed, audienceSize, pending,
      sent: 0, failed: 0, remaining: pending,
    };
  }

  const batch = pendingRows.slice(0, limit);
  let sent = 0;
  let failed = 0;
  for (const r of batch) {
    let unsubUrl: string;
    if (r.kind === "subscriber") {
      let token = r.unsubToken;
      if (!token) {
        token = randomUUID();
        await prisma.newsletterSubscriber.update({ where: { id: r.subId }, data: { unsubToken: token } }).catch(() => {});
      }
      unsubUrl = `${SITE_URL}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
    } else {
      // Mint (or reuse) the announcement opt-out token BEFORE sending, so the
      // unsubscribe link in the email is live the moment it lands. optedOutAt
      // stays null — the row means "was emailed", not "opted out".
      const key = r.email.trim().toLowerCase();
      const token = randomUUID();
      const row = await prisma.announcementOptOut
        .upsert({ where: { email: key }, create: { email: key, token }, update: {} })
        .catch(() => null);
      if (!row) { failed++; continue; }
      unsubUrl = `${SITE_URL}/announcements/unsubscribe?token=${encodeURIComponent(row.token)}`;
    }

    const ok = await sendReleaseDayEmail(
      r.email, set.name, setSlug, unsubUrl, stats,
      r.kind === "user" ? "account" : "subscriber"
    );
    if (ok) {
      sent++;
      // Stamp ONLY on success, so a failure is retried by the next run rather
      // than silently skipped forever. (Users are already marked by the upsert
      // above — that row is what excludes them next run.)
      if (r.kind === "subscriber") {
        await prisma.newsletterSubscriber
          .update({ where: { id: r.subId }, data: { lastEditionKey: campaign } })
          .catch(() => {});
      }
    } else {
      failed++;
    }
    if (batch.length > 1) await new Promise((r2) => setTimeout(r2, THROTTLE_MS));
  }

  return {
    ok: true, dryRun, audience, set: set.name, stats,
    subscribers, users, suppressed, audienceSize, pending,
    sent, failed, remaining: pending - sent,
  };
}
