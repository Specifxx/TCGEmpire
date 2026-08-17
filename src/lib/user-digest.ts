// Weekly digest to every REGISTERED ACCOUNT that isn't already an opt-in
// NewsletterSubscriber (they get the same content Fridays via lib/newsletter.ts
// + Resend) and hasn't opted out. Sent through Brevo, not Resend — see
// sendEmailBrevo in lib/email.ts — so this much larger audience never eats
// into the Resend quota transactional email (verification, password reset,
// price alerts) depends on.
//
// Free-tier email providers cap sends per day (Brevo: 300/day), so ONE weekly
// edition can take several days to fully deliver to a growing user base. This
// job is meant to run on a DAILY cron (see app/api/cron/user-digest +
// vercel.json): each run sends up to DEFAULT_BATCH accounts still due for the
// current ISO-week edition. It's naturally resumable/idempotent via
// UserDigestOptOut.lastEditionKey — a rerun, or the next day's run, only
// emails whoever's still pending, exactly like lib/release-day.ts's batching.
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { getPriceMovers } from "./price-history";
import { sendUserDigestEmail, isBrevoEnabled } from "./email";
import { normalizeCountry, type Country } from "./country";
import { SITE_URL } from "./site";
import { editionKey, buildDigest, type Digest } from "./newsletter";

export interface UserDigestRunSummary {
  edition: string;
  users: number; // total registered accounts with an email
  excluded: number; // already an opt-in subscriber, or suppressed — out of scope entirely
  audienceSize: number; // in scope for this edition
  due: number; // not yet sent this edition, before this run's cap
  emails: number; // sent this run
  failed: number;
  remaining: number; // still due after this run — next day's cron picks these up
  quietMarkets: string[];
}

const DEFAULT_BATCH = 280; // stay under Brevo's free-tier 300/day cap
const THROTTLE_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runUserDigest(opts?: { limit?: number }): Promise<UserDigestRunSummary> {
  const edition = editionKey();
  const limit = opts?.limit && opts.limit > 0 ? opts.limit : DEFAULT_BATCH;

  const [users, subscriberRows, optOutRows] = await Promise.all([
    prisma.user.findMany({ select: { email: true, preferredCountry: true } }),
    prisma.newsletterSubscriber.findMany({ select: { email: true } }),
    prisma.userDigestOptOut.findMany({ select: { email: true, token: true, optedOutAt: true, lastEditionKey: true } }),
  ]);

  const subscriberEmails = new Set(subscriberRows.map((r) => r.email.trim().toLowerCase()));
  const optOutByEmail = new Map(optOutRows.map((r) => [r.email, r]));

  // Build the in-scope audience: registered accounts, deduped by lowercased
  // email, minus anyone already covered by the opt-in newsletter or who has
  // ever clicked unsubscribe on this digest.
  const byEmail = new Map<string, { email: string; market: Country }>();
  let excluded = 0;
  for (const u of users) {
    const key = u.email.trim().toLowerCase();
    if (!key) continue;
    const optOut = optOutByEmail.get(key);
    if (subscriberEmails.has(key) || optOut?.optedOutAt) {
      excluded++;
      continue;
    }
    if (!byEmail.has(key)) byEmail.set(key, { email: u.email, market: normalizeCountry(u.preferredCountry) });
  }

  const audience = [...byEmail.values()];
  const due = audience.filter((r) => optOutByEmail.get(r.email.trim().toLowerCase())?.lastEditionKey !== edition);

  const summary: UserDigestRunSummary = {
    edition,
    users: users.length,
    excluded,
    audienceSize: audience.length,
    due: due.length,
    emails: 0,
    failed: 0,
    remaining: due.length,
    quietMarkets: [],
  };
  if (!due.length || !isBrevoEnabled()) return summary;

  // One digest per market, computed once and reused for every recipient in it.
  const digests = new Map<Country, Digest | null>();
  const batch = due.slice(0, limit);
  for (const r of batch) {
    if (!digests.has(r.market)) {
      const movers = await getPriceMovers(r.market, 8);
      digests.set(r.market, buildDigest(movers, r.market));
      if (!digests.get(r.market)) summary.quietMarkets.push(r.market);
    }
    const digest = digests.get(r.market);
    if (!digest) continue; // quiet week in this market — try again next edition

    const key = r.email.trim().toLowerCase();
    const token = optOutByEmail.get(key)?.token ?? randomUUID();
    const row = await prisma.userDigestOptOut
      .upsert({ where: { email: key }, create: { email: key, token }, update: {} })
      .catch(() => null);
    if (!row) {
      summary.failed++;
      continue;
    }
    const unsubUrl = `${SITE_URL}/user-digest/unsubscribe?token=${encodeURIComponent(row.token)}`;

    const sent = await sendUserDigestEmail(r.email, digest.subject, digest.heading, digest.inner, unsubUrl);
    if (sent) {
      summary.emails++;
      // Stamp ONLY on success, so a failure is retried by tomorrow's run
      // rather than silently skipped for the rest of the edition.
      await prisma.userDigestOptOut.update({ where: { email: key }, data: { lastEditionKey: edition } }).catch(() => {});
    } else {
      summary.failed++;
    }
    if (batch.length > 1) await sleep(THROTTLE_MS);
  }

  summary.remaining = due.length - summary.emails;
  return summary;
}
