// One-off "a full month of Premium, on us" email to every FREE-TIER account.
//
// THE OFFER. Anyone on the free tier who subscribes before a stated date gets
// their Premium trial extended to a full month (30 days). The extension is
// applied BY HAND by the owner after the subscription lands — nothing here
// touches Stripe or premiumUntil. The email says exactly that, because the
// alternative (implying checkout itself grants 30 days) would be false: Stripe
// still runs the normal PREMIUM_TRIAL_DAYS trial, and an account that has
// already used its trial is charged on day one as usual. See
// sendPremiumOfferEmail in lib/email.ts for how the two cases are worded.
//
// WHY THIS IS A LIB (and the send runs on VERCEL, not in CI): identical to
// lib/release-day.ts — the mail keys are Vercel environment variables, a GitHub
// runner has the database but not the keys, so the send lives behind
// /api/cron/premium-offer and the workflow only authenticates the trigger.
//
// AUDIENCE. Registered accounts that are not currently Premium, not admins, not
// seed personas, and have not opted out of announcements. Deduped by lowercased
// email. Idempotent per account via User.premiumOfferSentAt (stamped ONLY on a
// successful send), so the batched run is resumable: call it again to continue.
//
// PROVIDER. Brevo by default — the same choice lib/user-digest.ts made for the
// registered-account audience, so a blast to every account can't eat the
// Resend quota that verification, password-reset and price-alert email depend
// on. `via: "resend"` is available for a small audience or if Brevo is down.
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { getLastEmailError, isBrevoEnabled, isEmailEnabled, sendPremiumOfferEmail } from "./email";
import { NOT_SEED_WHERE, PREMIUM_TRIAL_DAYS, premiumTrialEnabled } from "./premium";
import { SITE_URL } from "./site";

export const PREMIUM_OFFER_CAMPAIGN = "premium-offer";
// What the owner grants by hand: the trial becomes this many days in total.
export const PREMIUM_OFFER_DAYS = 30;

export type PremiumOfferProvider = "brevo" | "resend";

export interface PremiumOfferResult {
  ok: boolean;
  error?: string;
  dryRun: boolean;
  via: PremiumOfferProvider;
  offerEnds?: string; // ISO date the offer closes, as given
  users?: number; // registered accounts (excl. seed personas)
  premium?: number; // excluded: currently Premium or admin
  suppressed?: number; // excluded: opted out of announcements
  audienceSize?: number; // in scope after dedupe + exclusions
  alreadySent?: number; // of those, stamped by an earlier run
  pending?: number;
  sent?: number;
  failed?: number;
  remaining?: number; // still pending after this run (batch cap hit)
  // WHY sends failed — the first few distinct reasons (provider + HTTP status
  // + response body, or "opt-out row could not be written"). Never includes a
  // recipient address: this lands in a workflow log. Added after a first live
  // run reported failed:90 with nothing to say which of the two things that can
  // fail per recipient actually did.
  errors?: string[];
}

// Brevo's free tier caps at 300 sends/day; Resend's at 100/day. The batch
// default sits under the smaller provider's daily cap so a run can never burn
// a day's allowance on its own, and the throttle keeps well inside ~2 req/s.
const DEFAULT_BATCH = 90;
const THROTTLE_MS = 600;

// "2026-09-30" → a real, future calendar date, or null. The deadline is what
// makes "subscribe now" an honest sentence, so a live send refuses to run
// without one (see tests/premium-zero-today.test.ts's no-fake-scarcity rule —
// a real date is the opposite of a fake countdown).
export function parseOfferEnds(raw: string | null | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T23:59:59Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function formatOfferEnds(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export interface PremiumOfferOpts {
  offerEnds: string;
  dryRun: boolean;
  limit?: number;
  via?: PremiumOfferProvider;
  // Restrict the send to these account ids (the admin console's checkbox
  // selection). The exclusions above STILL apply — a hand-picked account that
  // is Premium, an admin, a seed persona or opted out is skipped, never
  // force-sent — so "choose who to send to" can narrow the audience but not
  // widen it past what the offer is honest for.
  userIds?: string[];
  // Email an account again even though it is already stamped. Only honoured
  // together with `userIds`, so a re-send is always a deliberate, named choice
  // and can never turn into a second blast to everyone.
  resend?: boolean;
}

export async function runPremiumOfferBlast(opts: PremiumOfferOpts): Promise<PremiumOfferResult> {
  const { dryRun } = opts;
  const via: PremiumOfferProvider = opts.via === "resend" ? "resend" : "brevo";
  const limit = opts.limit && opts.limit > 0 ? opts.limit : DEFAULT_BATCH;
  const only = opts.userIds?.length ? new Set(opts.userIds) : null;
  const resend = !!opts.resend && only != null;

  const ends = parseOfferEnds(opts.offerEnds);
  if (!ends) return { ok: false, dryRun, via, error: `offerEnds must be a YYYY-MM-DD date, got "${opts.offerEnds}"` };
  if (ends.getTime() < Date.now()) {
    return { ok: false, dryRun, via, offerEnds: opts.offerEnds, error: `The offer deadline ${opts.offerEnds} is in the past — nothing would be honest to send` };
  }
  if (!dryRun) {
    const configured = via === "brevo" ? isBrevoEnabled() : isEmailEnabled();
    if (!configured) {
      return { ok: false, dryRun, via, offerEnds: opts.offerEnds, error: `${via === "brevo" ? "BREVO_API_KEY" : "RESEND_API_KEY"} is not set in this environment — nothing would send` };
    }
  }

  const now = new Date();
  const rows = await prisma.user.findMany({
    where: NOT_SEED_WHERE,
    select: {
      id: true,
      email: true,
      displayName: true,
      isAdmin: true,
      premiumUntil: true,
      trialStartedAt: true,
      premiumOfferSentAt: true,
    },
  });

  // Exclusions are computed at BUILD time, not per send, so the dry run
  // reports the true reachable audience.
  let premium = 0;
  type Recipient = { id: string; email: string; displayName: string; trialAvailable: boolean; alreadySent: boolean };
  const byEmail = new Map<string, Recipient>();
  for (const u of rows) {
    const key = u.email.trim().toLowerCase();
    if (!key) continue;
    if (only && !only.has(u.id)) continue;
    if (u.isAdmin || (u.premiumUntil && u.premiumUntil > now)) {
      premium++;
      continue;
    }
    if (byEmail.has(key)) continue;
    byEmail.set(key, {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      // One trial per account: only offer the trial framing when Stripe will
      // actually run one; otherwise the email says "a free month on top".
      trialAvailable: premiumTrialEnabled() && !u.trialStartedAt,
      alreadySent: u.premiumOfferSentAt != null,
    });
  }

  const optedOut = await prisma.announcementOptOut
    .findMany({ where: { optedOutAt: { not: null } }, select: { email: true } })
    .catch(() => [] as { email: string }[]);
  let suppressed = 0;
  for (const o of optedOut) {
    if (byEmail.delete(o.email.trim().toLowerCase())) suppressed++;
  }

  const audience = [...byEmail.values()];
  const pendingRows = audience.filter((r) => resend || !r.alreadySent);
  const base = {
    ok: true,
    dryRun,
    via,
    offerEnds: opts.offerEnds,
    users: rows.length,
    premium,
    suppressed,
    audienceSize: audience.length,
    alreadySent: audience.length - pendingRows.length,
    pending: pendingRows.length,
  };

  if (dryRun) return { ...base, sent: 0, failed: 0, remaining: pendingRows.length };

  const batch = pendingRows.slice(0, limit);
  let sent = 0;
  let failed = 0;
  const errors = new Set<string>();
  const noteError = (reason: string) => {
    if (errors.size < 5) errors.add(reason);
  };
  for (const r of batch) {
    // Mint (or reuse) the announcement opt-out token BEFORE sending, so the
    // unsubscribe link is live the moment the email lands. optedOutAt stays
    // null — the row means "was emailed", never "opted out".
    const key = r.email.trim().toLowerCase();
    const row = await prisma.announcementOptOut
      .upsert({ where: { email: key }, create: { email: key, token: randomUUID() }, update: {} })
      .catch((e: unknown) => {
        noteError(`opt-out row could not be written: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`.slice(0, 300));
        return null;
      });
    if (!row) {
      failed++;
      continue;
    }
    const unsubUrl = `${SITE_URL}/announcements/unsubscribe?token=${encodeURIComponent(row.token)}`;

    const ok = await sendPremiumOfferEmail(r.email, {
      displayName: r.displayName,
      trialDays: r.trialAvailable ? PREMIUM_TRIAL_DAYS : 0,
      offerDays: PREMIUM_OFFER_DAYS,
      offerEnds: formatOfferEnds(ends),
      unsubUrl,
      via,
    }).catch(() => false);

    if (ok) {
      sent++;
      // Stamp ONLY on success, so a failed send is retried by the next run
      // rather than silently skipped forever.
      await prisma.user.update({ where: { id: r.id }, data: { premiumOfferSentAt: new Date() } }).catch(() => {});
    } else {
      failed++;
      noteError(getLastEmailError() ?? "the mail provider returned false with no recorded reason");
    }
    if (batch.length > 1) await new Promise((r2) => setTimeout(r2, THROTTLE_MS));
  }

  return { ...base, sent, failed, remaining: pendingRows.length - sent, ...(errors.size ? { errors: [...errors] } : {}) };
}

// ── Admin console support ────────────────────────────────────────────────────

export type PremiumOfferStatus = "pending" | "sent" | "premium" | "optedOut";

export interface PremiumOfferAudienceRow {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  trialAvailable: boolean;
  premiumUntil: Date | null;
  offerSentAt: Date | null;
  // The account opened /premium from the offer email (PremiumClick source
  // "offer") — the "came back" signal ahead of converting.
  clickedOfferAt: Date | null;
  status: PremiumOfferStatus;
}

// Everything /admin/premium-offer needs to render its table, computed with the
// SAME exclusions runPremiumOfferBlast applies, so what the console shows as
// "pending" is exactly who a send would reach.
export async function listPremiumOfferAudience(opts?: { take?: number }): Promise<PremiumOfferAudienceRow[]> {
  const take = opts?.take && opts.take > 0 ? opts.take : 1000;
  const now = new Date();
  const [users, optedOut, clicks] = await Promise.all([
    prisma.user.findMany({
      where: { AND: [NOT_SEED_WHERE, { isAdmin: false }] },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
        trialStartedAt: true,
        premiumUntil: true,
        premiumOfferSentAt: true,
      },
    }),
    prisma.announcementOptOut
      .findMany({ where: { optedOutAt: { not: null } }, select: { email: true } })
      .catch(() => [] as { email: string }[]),
    prisma.premiumClick
      .findMany({ where: { source: "offer", userId: { not: null } }, select: { userId: true, createdAt: true } })
      .catch(() => [] as { userId: string | null; createdAt: Date }[]),
  ]);
  const optedOutEmails = new Set(optedOut.map((o) => o.email.trim().toLowerCase()));
  const lastClick = new Map<string, Date>();
  for (const c of clicks) {
    if (!c.userId) continue;
    const prev = lastClick.get(c.userId);
    if (!prev || c.createdAt > prev) lastClick.set(c.userId, c.createdAt);
  }
  return users.map((u) => {
    const isPremiumNow = !!u.premiumUntil && u.premiumUntil > now;
    const optedOutNow = optedOutEmails.has(u.email.trim().toLowerCase());
    const status: PremiumOfferStatus = optedOutNow ? "optedOut" : isPremiumNow ? "premium" : u.premiumOfferSentAt ? "sent" : "pending";
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      createdAt: u.createdAt,
      trialAvailable: premiumTrialEnabled() && !u.trialStartedAt,
      premiumUntil: u.premiumUntil,
      offerSentAt: u.premiumOfferSentAt,
      clickedOfferAt: lastClick.get(u.id) ?? null,
      status,
    };
  });
}

// A single test copy to the admin's own inbox: both wordings, no stamp, no
// opt-out row, no audience check — so the copy can be proofread in a real mail
// client before anyone else sees it.
export async function sendPremiumOfferTest(to: string, offerEnds: string, via: PremiumOfferProvider = "brevo"): Promise<{ ok: boolean; error?: string }> {
  const ends = parseOfferEnds(offerEnds);
  if (!ends) return { ok: false, error: `offerEnds must be a YYYY-MM-DD date, got "${offerEnds}"` };
  const configured = via === "brevo" ? isBrevoEnabled() : isEmailEnabled();
  if (!configured) return { ok: false, error: `${via === "brevo" ? "BREVO_API_KEY" : "RESEND_API_KEY"} is not set` };
  const unsubUrl = `${SITE_URL}/announcements/unsubscribe?token=test`;
  const common = { displayName: "Test Recipient", offerDays: PREMIUM_OFFER_DAYS, offerEnds: formatOfferEnds(ends), unsubUrl, via };
  const a = await sendPremiumOfferEmail(to, { ...common, trialDays: PREMIUM_TRIAL_DAYS }).catch(() => false);
  const b = await sendPremiumOfferEmail(to, { ...common, trialDays: 0 }).catch(() => false);
  return a && b ? { ok: true } : { ok: false, error: "the mail provider rejected one or both test emails" };
}
