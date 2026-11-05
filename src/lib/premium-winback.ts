// One-off "3 days of Premium, free, no card, one link, one use" win-back email
// to accounts that registered recently and are not currently on a paid tier.
//
// HOW THIS DIFFERS FROM lib/premium-offer.ts. That campaign emails, then the
// OWNER manually extends premiumUntil by hand, only after a real Stripe
// subscription lands — nothing there ever writes premiumUntil itself. This
// one grants immediately, off a single-use link, with no checkout involved.
// That is a real change of shape: it is closer to the SIGNUP_PREMIUM_DAYS
// auto-grant lib/premium.ts's "NO PREMIUM ON SIGNUP" note describes as
// "REMOVED ... DELIBERATELY AND ENTIRELY" (twice, in fact — a week-long
// version first, then a 3-day version). Rebuilding this shape of grant was a
// deliberate, informed decision for this specific campaign, not an
// oversight — kept as ONE campaign-scoped table (PremiumWinbackTrial) rather
// than a reusable generic "grant link" framework, so it can be torn out
// again as a whole without leaving a general-purpose auto-grant mechanism
// lying around for the next request to reuse by accident.
//
// WHY A LINK CAN'T JUST GRANT ON PAGE LOAD. Some corporate mail gateways and
// webmail clients (Outlook Safe Links, Gmail's image/link proxy) pre-fetch
// URLs found inside an email to scan them, via a plain GET, before a human
// ever opens the message. If visiting the claim URL itself granted and
// consumed the one-time token, a scanner would burn it before the real
// recipient saw the email. So GET only ever LOOKS UP token status (see
// src/app/premium/claim/page.tsx); the grant happens on an explicit POST
// (src/app/api/premium/winback-claim/route.ts), fired by a button the human
// clicks on that page — never on page load.
//
// WHY THIS IS A LIB (and the send runs on VERCEL, not in CI): identical to
// lib/premium-offer.ts — the mail keys are Vercel environment variables, a
// GitHub runner has the database but not the keys.
//
// AUDIENCE. Registered accounts that signed up on or after a caller-supplied
// date, are not currently Plus or Premium (checked with the same isPremium()
// every paid gate on the site uses — so "not entitled" here means exactly
// what it means everywhere else, active trial included), not admins, not
// seed personas, and have not opted out of announcements. Deduped by
// lowercased email. Idempotent per account via the existence of a
// PremiumWinbackTrial row (created ONLY on a successful send), so the
// batched run is resumable: call it again to continue.
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { getLastEmailError, isBrevoEnabled, isEmailEnabled, sendPremiumWinbackEmail } from "./email";
import { NOT_SEED_WHERE, grantPremiumDays, isPremium } from "./premium";
import { SITE_URL } from "./site";

// How many days of Premium the claim grants. Env-overridable, day-granular —
// see lib/premium.ts's FEEDBACK_PREMIUM_DAYS/REFERRAL_PREMIUM_DAYS for the
// same convention.
export const WINBACK_TRIAL_DAYS = Math.max(0, Math.floor(Number(process.env.PREMIUM_WINBACK_DAYS ?? 3)));
// How long a minted claim link stays live before it's treated as expired —
// separate from the one-time-use lock (claimedAt). A win-back nudge sitting
// in an inbox unclaimed for months and then suddenly redeemed reads as a
// data problem, not a feature; a stated, real window avoids that without
// pretending it is scarcer than it is (no countdown is ever shown for it).
export const WINBACK_CLAIM_EXPIRES_DAYS = Math.max(1, Math.floor(Number(process.env.PREMIUM_WINBACK_CLAIM_WINDOW_DAYS ?? 14)));

export type PremiumWinbackProvider = "brevo" | "resend";

export interface PremiumWinbackResult {
  ok: boolean;
  error?: string;
  dryRun: boolean;
  via: PremiumWinbackProvider;
  registeredAfter?: string;
  users?: number; // registered accounts (excl. seed personas)
  paid?: number; // excluded: currently Plus/Premium (incl. an active trial) or admin
  tooOld?: number; // excluded: registered before the cutoff
  suppressed?: number; // excluded: opted out of announcements
  audienceSize?: number; // in scope after dedupe + exclusions
  alreadySent?: number; // of those, already have a PremiumWinbackTrial row
  pending?: number;
  sent?: number;
  failed?: number;
  remaining?: number; // still pending after this run (batch cap hit)
  errors?: string[];
}

// Same cap/throttle reasoning as premium-offer.ts: sit under the smaller
// provider's daily cap (Brevo 300/day, Resend 100/day) so one run can never
// burn a day's allowance, and stay well inside ~2 req/s.
const DEFAULT_BATCH = 90;
const THROTTLE_MS = 600;

// "2026-08-14" → a real calendar date, or null. Required and explicit rather
// than an implicit "now minus 30 days" computed fresh on every call: a
// resumable batch may span several invocations over several days, and a
// rolling cutoff would silently narrow the audience between them (someone
// who qualified on day one no longer would on day three). Pinning the date
// once, the same way premium-offer.ts pins offerEnds, keeps one campaign's
// audience stable for its whole run.
export function parseRegisteredAfter(raw: string | null | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export interface PremiumWinbackOpts {
  registeredAfter: string; // YYYY-MM-DD — accounts created on/after this date
  dryRun: boolean;
  limit?: number;
  via?: PremiumWinbackProvider;
  // Restrict the send to these account ids (admin console checkbox
  // selection). The exclusions below still apply.
  userIds?: string[];
}

export async function runPremiumWinbackBlast(opts: PremiumWinbackOpts): Promise<PremiumWinbackResult> {
  const { dryRun } = opts;
  const via: PremiumWinbackProvider = opts.via === "resend" ? "resend" : "brevo";
  const limit = opts.limit && opts.limit > 0 ? opts.limit : DEFAULT_BATCH;
  const only = opts.userIds?.length ? new Set(opts.userIds) : null;

  const cutoff = parseRegisteredAfter(opts.registeredAfter);
  if (!cutoff) return { ok: false, dryRun, via, error: `registeredAfter must be a YYYY-MM-DD date, got "${opts.registeredAfter}"` };
  if (cutoff.getTime() > Date.now()) {
    return { ok: false, dryRun, via, registeredAfter: opts.registeredAfter, error: `registeredAfter ${opts.registeredAfter} is in the future — nothing would be in scope` };
  }
  if (!dryRun) {
    const configured = via === "brevo" ? isBrevoEnabled() : isEmailEnabled();
    if (!configured) {
      return { ok: false, dryRun, via, registeredAfter: opts.registeredAfter, error: `${via === "brevo" ? "BREVO_API_KEY" : "RESEND_API_KEY"} is not set in this environment — nothing would send` };
    }
  }

  const rows = await prisma.user.findMany({
    where: NOT_SEED_WHERE,
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
      isAdmin: true,
      premiumUntil: true,
      premiumTier: true,
      premiumTierFloor: true,
    },
  });

  let paid = 0;
  let tooOld = 0;
  type Candidate = { id: string; email: string; displayName: string };
  const byEmail = new Map<string, Candidate>();
  for (const u of rows) {
    const key = u.email.trim().toLowerCase();
    if (!key) continue;
    if (only && !only.has(u.id)) continue;
    // isPremium() is the SAME check every paid gate on the site uses — an
    // account mid Stripe trial reads as "currently Premium" here too, which
    // is correct: it already has what this campaign is offering.
    if (isPremium(u)) {
      paid++;
      continue;
    }
    if (u.createdAt.getTime() < cutoff.getTime()) {
      tooOld++;
      continue;
    }
    if (byEmail.has(key)) continue;
    byEmail.set(key, { id: u.id, email: u.email, displayName: u.displayName });
  }

  const optedOut = await prisma.announcementOptOut
    .findMany({ where: { optedOutAt: { not: null } }, select: { email: true } })
    .catch(() => [] as { email: string }[]);
  let suppressed = 0;
  for (const o of optedOut) {
    if (byEmail.delete(o.email.trim().toLowerCase())) suppressed++;
  }

  const audience = [...byEmail.values()];
  const existing = await prisma.premiumWinbackTrial.findMany({
    where: { userId: { in: audience.map((a) => a.id) } },
    select: { userId: true },
  });
  const alreadySentIds = new Set(existing.map((e) => e.userId));
  const pendingRows = audience.filter((r) => !alreadySentIds.has(r.id));

  const base = {
    ok: true,
    dryRun,
    via,
    registeredAfter: opts.registeredAfter,
    users: rows.length,
    paid,
    tooOld,
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
    const token = randomUUID();
    const claimUrl = `${SITE_URL}/premium/claim?token=${encodeURIComponent(token)}`;
    // Announcement opt-out link travels on this email too — it's a marketing
    // send to a registered account, same disclosure convention as every
    // other campaign here. Minted BEFORE sending, matching premium-offer.ts:
    // if it can't be minted, the send is skipped rather than going out
    // without a working unsubscribe link.
    const key = r.email.trim().toLowerCase();
    const optOutRow = await prisma.announcementOptOut
      .upsert({ where: { email: key }, create: { email: key, token: randomUUID() }, update: {} })
      .catch((e: unknown) => {
        noteError(`opt-out row could not be written: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`.slice(0, 300));
        return null;
      });
    if (!optOutRow) {
      failed++;
      continue;
    }
    const unsubUrl = `${SITE_URL}/announcements/unsubscribe?token=${encodeURIComponent(optOutRow.token)}`;

    const ok = await sendPremiumWinbackEmail(r.email, {
      displayName: r.displayName,
      days: WINBACK_TRIAL_DAYS,
      claimUrl,
      claimWindowDays: WINBACK_CLAIM_EXPIRES_DAYS,
      unsubUrl,
      via,
    }).catch(() => false);

    if (ok) {
      sent++;
      // Mint the claim row ONLY on a successful send — mirrors
      // User.premiumOfferSentAt's "stamped ONLY on success" rule, so a
      // failed send is retried by the next run rather than skipped, and a
      // token is never live before its email actually went out.
      await prisma.premiumWinbackTrial.create({ data: { userId: r.id, email: r.email, token } }).catch((e: unknown) => {
        noteError(`claim row could not be written: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`.slice(0, 300));
      });
    } else {
      failed++;
      noteError(getLastEmailError() ?? "the mail provider returned false with no recorded reason");
    }
    if (batch.length > 1) await new Promise((res) => setTimeout(res, THROTTLE_MS));
  }

  return { ...base, sent, failed, remaining: pendingRows.length - sent, ...(errors.size ? { errors: [...errors] } : {}) };
}

// ── Admin console support ────────────────────────────────────────────────────

export type PremiumWinbackStatus = "pending" | "sent" | "claimed" | "paid" | "optedOut";

export interface PremiumWinbackAudienceRow {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  premiumUntil: Date | null;
  sentAt: Date | null;
  claimedAt: Date | null;
  status: PremiumWinbackStatus;
}

// Mirrors runPremiumWinbackBlast's own exclusions, so what the console shows
// as "pending" is exactly who a send would reach.
export async function listPremiumWinbackAudience(opts: { registeredAfter: string; take?: number }): Promise<PremiumWinbackAudienceRow[]> {
  const take = opts.take && opts.take > 0 ? opts.take : 1000;
  const cutoff = parseRegisteredAfter(opts.registeredAfter) ?? new Date(0);
  const [users, optedOut, trials] = await Promise.all([
    prisma.user.findMany({
      where: { AND: [NOT_SEED_WHERE, { isAdmin: false }, { createdAt: { gte: cutoff } }] },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, email: true, displayName: true, createdAt: true, premiumUntil: true, premiumTier: true, premiumTierFloor: true },
    }),
    prisma.announcementOptOut
      .findMany({ where: { optedOutAt: { not: null } }, select: { email: true } })
      .catch(() => [] as { email: string }[]),
    prisma.premiumWinbackTrial.findMany({ select: { userId: true, createdAt: true, claimedAt: true } }),
  ]);
  const optedOutEmails = new Set(optedOut.map((o) => o.email.trim().toLowerCase()));
  const byUserId = new Map(trials.map((t) => [t.userId, t]));
  return users.map((u) => {
    const trial = byUserId.get(u.id);
    const optedOutNow = optedOutEmails.has(u.email.trim().toLowerCase());
    const status: PremiumWinbackStatus = optedOutNow
      ? "optedOut"
      : isPremium(u)
        ? "paid"
        : trial?.claimedAt
          ? "claimed"
          : trial
            ? "sent"
            : "pending";
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      createdAt: u.createdAt,
      premiumUntil: u.premiumUntil,
      sentAt: trial?.createdAt ?? null,
      claimedAt: trial?.claimedAt ?? null,
      status,
    };
  });
}

// A single test copy to the admin's own inbox: real copy, a token that
// doesn't exist in PremiumWinbackTrial (so nothing can claim off it), no
// stamp, no audience check — proofread before anyone else sees it.
export async function sendPremiumWinbackTest(to: string, via: PremiumWinbackProvider = "brevo"): Promise<{ ok: boolean; error?: string }> {
  const configured = via === "brevo" ? isBrevoEnabled() : isEmailEnabled();
  if (!configured) return { ok: false, error: `${via === "brevo" ? "BREVO_API_KEY" : "RESEND_API_KEY"} is not set` };
  const ok = await sendPremiumWinbackEmail(to, {
    displayName: "Test Recipient",
    days: WINBACK_TRIAL_DAYS,
    claimUrl: `${SITE_URL}/premium/claim?token=test-token-does-not-exist`,
    claimWindowDays: WINBACK_CLAIM_EXPIRES_DAYS,
    unsubUrl: `${SITE_URL}/announcements/unsubscribe?token=test`,
    via,
  }).catch(() => false);
  return ok ? { ok: true } : { ok: false, error: "the mail provider rejected the test email" };
}

export type ClaimStatus = "valid" | "not-found" | "already-claimed" | "expired";

// Read-only status check for the claim PAGE's server-rendered GET — never
// mutates anything, so a mail scanner's pre-fetch of the page URL (as
// opposed to the POST claim route, which has no GET handler at all) sees the
// same "valid" state the real recipient will, with nothing consumed.
export async function peekPremiumWinbackTrial(token: string): Promise<{ status: ClaimStatus; days: number }> {
  const trial = await prisma.premiumWinbackTrial.findUnique({ where: { token } });
  if (!trial) return { status: "not-found", days: WINBACK_TRIAL_DAYS };
  if (trial.claimedAt) return { status: "already-claimed", days: WINBACK_TRIAL_DAYS };
  const expiresAt = trial.createdAt.getTime() + WINBACK_CLAIM_EXPIRES_DAYS * 86_400_000;
  if (Date.now() > expiresAt) return { status: "expired", days: WINBACK_TRIAL_DAYS };
  return { status: "valid", days: WINBACK_TRIAL_DAYS };
}

export type ClaimResult =
  | { ok: true; premiumUntil: Date }
  | { ok: false; reason: "not-found" | "already-claimed" | "expired" | "grant-failed" };

// The actual claim: atomically flips PremiumWinbackTrial.claimedAt from null,
// and ONLY on winning that flip, grants the days. `updateMany` with a
// `claimedAt: null` guard in the WHERE clause is a single conditional UPDATE
// in Postgres — two concurrent requests for the same token can never both
// report count 1, so this can never double-grant even without a
// transaction. Kept in the lib (not the route) so it has its own tests.
export async function claimPremiumWinbackTrial(token: string): Promise<ClaimResult> {
  const trial = await prisma.premiumWinbackTrial.findUnique({ where: { token } });
  if (!trial) return { ok: false, reason: "not-found" };
  if (trial.claimedAt) return { ok: false, reason: "already-claimed" };
  const expiresAt = trial.createdAt.getTime() + WINBACK_CLAIM_EXPIRES_DAYS * 86_400_000;
  if (Date.now() > expiresAt) return { ok: false, reason: "expired" };

  const flipped = await prisma.premiumWinbackTrial.updateMany({
    where: { token, claimedAt: null },
    data: { claimedAt: new Date() },
  });
  if (flipped.count !== 1) return { ok: false, reason: "already-claimed" };

  const until = await grantPremiumDays(trial.userId, WINBACK_TRIAL_DAYS, "premium");
  if (!until) return { ok: false, reason: "grant-failed" };

  // A no-checkout entitlement change must be traceable in the function logs,
  // same as every other grant path (see /api/admin/grant-premium).
  console.log(`premium-winback: claimed by ${trial.email} — granted ${WINBACK_TRIAL_DAYS}d premium, premiumUntil → ${until.toISOString()}`);
  return { ok: true, premiumUntil: until };
}
