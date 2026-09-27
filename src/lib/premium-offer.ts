// One-off PRICE-DROP announcement to every account that is not currently
// paying (2026-09-27).
//
// HISTORY. This file held the "a full month of Premium, on us" offer from
// 2026-09-10 (DECISIONS.md, "Premium offer email to every free-tier account").
// After the 2026-09-26 price cut the owner asked for the same machinery to
// announce the new prices instead: "send emails to all non premium users
// saying premium is now $3.33 a month and plus is now $1.99 a month, and give
// them links to subscribe" — Plus yearly then stayed at $23.99, so the email
// quotes whatever premiumEffectiveMonthly() says ($3.33 and $2.00 today), and
// only ever as "…/mo billed yearly". The old offer's deadline, its two trial
// wordings and its by-hand grant are gone; any grant still owed from it is
// done from /admin/accounts. The email itself is buildPremiumOfferEmail in
// lib/email.ts. See DECISIONS.md, "Price-drop announcement", 2026-09-27.
//
// WHY THIS IS A LIB (and the send runs on VERCEL, not in CI): identical to
// lib/release-day.ts — the mail keys are Vercel environment variables, a GitHub
// runner has the database but not the keys, so the send lives behind
// /api/cron/premium-offer (and the admin console's /api/admin/premium-offer)
// and the workflow only authenticates the trigger.
//
// AUDIENCE (priceDropAudience below — pure, so the tests exercise it):
// registered accounts that are NOT currently entitled — isPremium(), the same
// check every paid gate uses, so an active Plus or Premium subscription, an
// active comp and a hand-set premiumTierFloor all count as paying — and are not
// admins, not seed personas, and have not opted out of announcements. Free
// accounts, lapsed subscribers and cancelled trialists are all in. Deduped by
// lowercased email. Idempotent per account via User.priceDropEmailSentAt
// (stamped ONLY on a successful send), so the batched run is resumable: call it
// again to continue. The old offer's premiumOfferSentAt is deliberately NOT
// read — everyone that campaign reached should still hear about the new prices.
//
// PROVIDER. Brevo by default — the same choice lib/user-digest.ts made for the
// registered-account audience, so a blast to every account can't eat the
// Resend quota that verification, password-reset and price-alert email depend
// on. `via: "resend"` is available for a small audience or if Brevo is down.
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { PRICE_DROP_SRC, getLastEmailError, isBrevoEnabled, isEmailEnabled, sendPremiumOfferEmail, type PremiumOfferEmailOpts } from "./email";
import { NOT_SEED_WHERE, isPremium, isSeedEmail } from "./premium";
import { SITE_URL } from "./site";

export const PREMIUM_OFFER_CAMPAIGN = "price-drop-2026-09";

export type PremiumOfferProvider = "brevo" | "resend";

export interface PremiumOfferResult {
  ok: boolean;
  error?: string;
  dryRun: boolean;
  via: PremiumOfferProvider;
  users?: number; // registered accounts (excl. seed personas)
  paying?: number; // excluded: currently Plus/Premium (isPremium)
  admins?: number; // excluded: admin accounts
  suppressed?: number; // excluded: opted out of announcements
  audienceSize?: number; // in scope after dedupe + exclusions
  alreadySent?: number; // of those, stamped by an earlier run
  pending?: number;
  sent?: number;
  failed?: number;
  remaining?: number; // still pending after this run (batch cap hit)
  // WHY sends failed — the first few distinct reasons (provider + HTTP status
  // + response body, or "opt-out row could not be written"). Never includes a
  // recipient address: this lands in a workflow log.
  errors?: string[];
}

// Brevo's free tier caps at 300 sends/day; Resend's at 100/day. The batch
// default sits under the smaller provider's daily cap so a run can never burn
// a day's allowance on its own, and the throttle keeps well inside ~2 req/s.
export const DEFAULT_BATCH = 90;
const THROTTLE_MS = 600;

// ── The audience, as a pure function ─────────────────────────────────────────

export interface PriceDropUserRow {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  premiumUntil: Date | null;
  premiumTier: string | null;
  premiumTierFloor: string | null;
  priceDropEmailSentAt: Date | null;
}

export interface PriceDropRecipient {
  id: string;
  email: string;
  displayName: string;
  alreadySent: boolean;
}

export interface PriceDropAudience {
  paying: number;
  admins: number;
  seeds: number;
  suppressed: number;
  audience: PriceDropRecipient[];
  pending: PriceDropRecipient[];
}

/**
 * Who the announcement reaches. `rows` are User rows (the query already drops
 * seed personas; they are dropped again here so this function is the whole
 * rule). `optedOut` holds lowercased emails with AnnouncementOptOut.optedOutAt
 * set. `only` narrows to hand-picked ids (the admin console's ticks) — it can
 * never widen past the exclusions. `resend` re-sends to stamped accounts, and
 * only together with `only`, so it can never become a second blast to all.
 */
export function priceDropAudience(
  rows: PriceDropUserRow[],
  optedOut: Set<string>,
  opts: { only?: Set<string> | null; resend?: boolean } = {},
): PriceDropAudience {
  const only = opts.only && opts.only.size ? opts.only : null;
  const resend = !!opts.resend && only != null;
  let paying = 0;
  let admins = 0;
  let seeds = 0;
  let suppressed = 0;
  const suppressedKeys = new Set<string>();
  const byEmail = new Map<string, PriceDropRecipient>();
  for (const u of rows) {
    const key = u.email.trim().toLowerCase();
    if (!key) continue;
    if (only && !only.has(u.id)) continue;
    if (isSeedEmail(key)) {
      seeds++;
      continue;
    }
    if (u.isAdmin) {
      admins++;
      continue;
    }
    // The site's own entitlement check: an active paid period at Plus or
    // above, with premiumTierFloor applied by effectiveTier(). Lapsed
    // subscribers and cancelled trialists (premiumUntil in the past) fall
    // through to the audience.
    if (isPremium(u)) {
      paying++;
      continue;
    }
    if (optedOut.has(key)) {
      // Count each opted-out address once, however many accounts share it.
      if (!suppressedKeys.has(key)) suppressed++;
      suppressedKeys.add(key);
      continue;
    }
    if (byEmail.has(key)) continue;
    byEmail.set(key, { id: u.id, email: u.email, displayName: u.displayName, alreadySent: u.priceDropEmailSentAt != null });
  }
  const audience = [...byEmail.values()];
  const pending = audience.filter((r) => resend || !r.alreadySent);
  return { paying, admins, seeds, suppressed, audience, pending };
}

// ── The run ──────────────────────────────────────────────────────────────────

// Everything that touches the database or the mail provider, injectable so the
// tests can run the real loop (dry run, stamping, resumability) with fakes.
export interface PriceDropDeps {
  loadUsers(): Promise<PriceDropUserRow[]>;
  loadOptedOut(): Promise<Set<string>>;
  /** Mint (or reuse) the announcement opt-out token for this address. */
  optOutToken(email: string): Promise<string>;
  send(to: string, opts: PremiumOfferEmailOpts): Promise<boolean>;
  stamp(userId: string): Promise<void>;
  providerConfigured(via: PremiumOfferProvider): boolean;
  lastError(): string | null;
  sleep(ms: number): Promise<void>;
}

export const prismaPriceDropDeps: PriceDropDeps = {
  loadUsers: () =>
    prisma.user.findMany({
      where: NOT_SEED_WHERE,
      select: {
        id: true,
        email: true,
        displayName: true,
        isAdmin: true,
        premiumUntil: true,
        premiumTier: true,
        premiumTierFloor: true,
        priceDropEmailSentAt: true,
      },
    }),
  loadOptedOut: async () => {
    const rows = await prisma.announcementOptOut
      .findMany({ where: { optedOutAt: { not: null } }, select: { email: true } })
      .catch(() => [] as { email: string }[]);
    return new Set(rows.map((o) => o.email.trim().toLowerCase()));
  },
  // optedOutAt stays null — the row means "was emailed", never "opted out".
  optOutToken: async (email) => {
    const row = await prisma.announcementOptOut.upsert({ where: { email }, create: { email, token: randomUUID() }, update: {} });
    return row.token;
  },
  send: (to, opts) => sendPremiumOfferEmail(to, opts),
  stamp: async (userId) => {
    await prisma.user.update({ where: { id: userId }, data: { priceDropEmailSentAt: new Date() } });
  },
  providerConfigured: (via) => (via === "brevo" ? isBrevoEnabled() : isEmailEnabled()),
  lastError: () => getLastEmailError(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export function announcementUnsubUrls(token: string): { unsubUrl: string; oneClickUrl: string } {
  const t = encodeURIComponent(token);
  return {
    unsubUrl: `${SITE_URL}/announcements/unsubscribe?token=${t}`,
    // RFC 8058 target for the List-Unsubscribe header: the API route takes the
    // one-click POST with the token in the query string.
    oneClickUrl: `${SITE_URL}/api/announcements/unsubscribe?token=${t}`,
  };
}

export interface PremiumOfferOpts {
  dryRun: boolean;
  limit?: number;
  via?: PremiumOfferProvider;
  // Restrict the send to these account ids (the admin console's checkbox
  // selection). The exclusions STILL apply — a hand-picked account that is
  // paying, an admin, a seed persona or opted out is skipped, never
  // force-sent — so "choose who to send to" can narrow the audience, not widen it.
  userIds?: string[];
  // Email an account again even though it is already stamped. Only honoured
  // together with `userIds`, so a re-send is always a deliberate, named choice.
  resend?: boolean;
}

export async function runPremiumOfferBlast(opts: PremiumOfferOpts, deps: PriceDropDeps = prismaPriceDropDeps): Promise<PremiumOfferResult> {
  const { dryRun } = opts;
  const via: PremiumOfferProvider = opts.via === "resend" ? "resend" : "brevo";
  const limit = opts.limit && opts.limit > 0 ? opts.limit : DEFAULT_BATCH;
  const only = opts.userIds?.length ? new Set(opts.userIds) : null;

  if (!dryRun && !deps.providerConfigured(via)) {
    return { ok: false, dryRun, via, error: `${via === "brevo" ? "BREVO_API_KEY" : "RESEND_API_KEY"} is not set in this environment — nothing would send` };
  }

  const [rows, optedOut] = await Promise.all([deps.loadUsers(), deps.loadOptedOut()]);
  // Exclusions are computed at BUILD time, not per send, so the dry run
  // reports the true reachable audience.
  const a = priceDropAudience(rows, optedOut, { only, resend: opts.resend });
  const base = {
    ok: true,
    dryRun,
    via,
    users: rows.length - a.seeds,
    paying: a.paying,
    admins: a.admins,
    suppressed: a.suppressed,
    audienceSize: a.audience.length,
    alreadySent: a.audience.length - a.pending.length,
    pending: a.pending.length,
  };

  if (dryRun) return { ...base, sent: 0, failed: 0, remaining: a.pending.length };

  const batch = a.pending.slice(0, limit);
  let sent = 0;
  let failed = 0;
  const errors = new Set<string>();
  const noteError = (reason: string) => {
    if (errors.size < 5) errors.add(reason);
  };
  for (const r of batch) {
    // Mint (or reuse) the announcement opt-out token BEFORE sending, so the
    // unsubscribe link is live the moment the email lands.
    const key = r.email.trim().toLowerCase();
    const token = await deps.optOutToken(key).catch((e: unknown) => {
      noteError(`opt-out row could not be written: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`.slice(0, 300));
      return null;
    });
    if (!token) {
      failed++;
      continue;
    }

    const ok = await deps
      .send(r.email, { displayName: r.displayName, ...announcementUnsubUrls(token), via })
      .catch(() => false);

    if (ok) {
      sent++;
      // Stamp ONLY on success, so a failed send is retried by the next run
      // rather than silently skipped forever.
      await deps.stamp(r.id).catch(() => {});
    } else {
      failed++;
      noteError(deps.lastError() ?? "the mail provider returned false with no recorded reason");
    }
    if (batch.length > 1) await deps.sleep(THROTTLE_MS);
  }

  return { ...base, sent, failed, remaining: a.pending.length - sent, ...(errors.size ? { errors: [...errors] } : {}) };
}

// ── Admin console support ────────────────────────────────────────────────────

export type PremiumOfferStatus = "pending" | "sent" | "paying" | "optedOut";

export interface PremiumOfferAudienceRow {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  premiumUntil: Date | null;
  sentAt: Date | null;
  // The account followed one of the email's links (PremiumClick source
  // "price-drop-email") — the "came back" signal ahead of converting.
  clickedAt: Date | null;
  status: PremiumOfferStatus;
}

// Everything /admin/premium-offer needs to render its table, classified by the
// SAME priceDropAudience() the send uses, so "pending" here is exactly who a
// send would reach.
export async function listPremiumOfferAudience(opts?: { take?: number }): Promise<PremiumOfferAudienceRow[]> {
  const take = opts?.take && opts.take > 0 ? opts.take : 1000;
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
        isAdmin: true,
        premiumUntil: true,
        premiumTier: true,
        premiumTierFloor: true,
        priceDropEmailSentAt: true,
      },
    }),
    prismaPriceDropDeps.loadOptedOut(),
    prisma.premiumClick
      .findMany({ where: { source: PRICE_DROP_SRC, userId: { not: null } }, select: { userId: true, createdAt: true } })
      .catch(() => [] as { userId: string | null; createdAt: Date }[]),
  ]);
  const lastClick = new Map<string, Date>();
  for (const c of clicks) {
    if (!c.userId) continue;
    const prev = lastClick.get(c.userId);
    if (!prev || c.createdAt > prev) lastClick.set(c.userId, c.createdAt);
  }
  return users.map((u) => {
    const a = priceDropAudience([u], optedOut);
    const status: PremiumOfferStatus = a.paying ? "paying" : a.suppressed ? "optedOut" : u.priceDropEmailSentAt ? "sent" : "pending";
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      createdAt: u.createdAt,
      premiumUntil: u.premiumUntil,
      sentAt: u.priceDropEmailSentAt,
      clickedAt: lastClick.get(u.id) ?? null,
      status,
    };
  });
}

// A single test copy to one inbox: no stamp, no opt-out row, no audience check
// — so the copy and the four links can be checked in a real mail client before
// anyone else sees it. The unsubscribe token is a dummy that the opt-out page
// reports as "not recognised".
export async function sendPremiumOfferTest(
  to: string,
  via: PremiumOfferProvider = "brevo",
  send: (to: string, opts: PremiumOfferEmailOpts) => Promise<boolean> = sendPremiumOfferEmail,
): Promise<{ ok: boolean; error?: string }> {
  const configured = via === "brevo" ? isBrevoEnabled() : isEmailEnabled();
  if (!configured) return { ok: false, error: `${via === "brevo" ? "BREVO_API_KEY" : "RESEND_API_KEY"} is not set` };
  const ok = await send(to, { displayName: "Test Recipient", ...announcementUnsubUrls("test"), via }).catch(() => false);
  return ok ? { ok: true } : { ok: false, error: getLastEmailError() ?? "the mail provider rejected the test email" };
}
