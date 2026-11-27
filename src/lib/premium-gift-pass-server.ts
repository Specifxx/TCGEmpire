// The 3-day Premium pass email's database and mail half (rules in lib/premium-gift-pass.ts). Runs on Vercel, behind
// /api/cron/premium-gift-pass, because the mail keys are Vercel variables (the same split as lib/premium-offer.ts).
//
// A batch is per site: the route names one (`site=dex`) and only that site's accounts are sent, newest first. Each
// account is sent once (Counter row gp3:<id>, written with the grant in one transaction, only after the provider took
// the email), so a run is resumable and a failed send is retried by the next one. Dry run is the default.
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { getLastEmailError, isBrevoEnabled, sendEmailBrevo, sendEmailBrevoAccount } from "./email";
import { NOT_SEED_WHERE } from "./premium";
import { RIFT_BRAND, brandFrom, brandFromSignupSource, type PremiumBrand } from "./premium-brand";
import { SITE_URL } from "./site";
import {
  GIFT_DEFAULT_BATCH,
  GIFT_FEATURES,
  GIFT_MAX_BATCH,
  GIFT_PASS,
  buildGiftPassEmail,
  giftAudience,
  giftPassCounterKey,
  giftPassOpen,
  giftPassUntil,
  type GiftAudience,
  type GiftUserRow,
} from "./premium-gift-pass";

export interface GiftRunResult {
  ok: boolean;
  error?: string;
  dryRun: boolean;
  site: string | null;
  open: boolean;
  bySite?: GiftAudience["bySite"];
  excluded?: GiftAudience["excluded"];
  pending?: number;
  sent?: number;
  failed?: number;
  remaining?: number;
  errors?: string[];
}

const THROTTLE_MS = 600;

export function giftBrand(site: string): PremiumBrand {
  return site === "rift" ? RIFT_BRAND : brandFromSignupSource(`sister:${site}`);
}

/** The opt-out page in the member's own site's name (it writes the same AnnouncementOptOut row every announcement reads). */
export function giftUnsubUrls(token: string, site: string): { unsubUrl: string; oneClickUrl: string } {
  const q = `token=${encodeURIComponent(token)}&site=${encodeURIComponent(site)}`;
  return { unsubUrl: `${SITE_URL}/api/premium-gift-pass/unsubscribe?${q}`, oneClickUrl: `${SITE_URL}/api/premium-gift-pass/unsubscribe?${q}` };
}

async function loadRows(): Promise<GiftUserRow[]> {
  return prisma.user.findMany({
    where: { AND: [NOT_SEED_WHERE, { isAdmin: false }, { OR: [{ premiumUntil: null }, { premiumUntil: { lte: new Date() } }] }] },
    orderBy: { createdAt: "desc" },
    take: 20_000,
    select: {
      id: true,
      email: true,
      displayName: true,
      isAdmin: true,
      premiumUntil: true,
      premiumTier: true,
      premiumTierFloor: true,
      emailVerified: true,
      googleId: true,
      signupSource: true,
      priceDropEmailSentAt: true,
    },
  });
}

async function loadSent(): Promise<Set<string>> {
  const rows = await prisma.counter.findMany({ where: { key: { startsWith: `${GIFT_PASS.key}:` } }, select: { key: true } });
  return new Set(rows.map((r) => r.key.slice(GIFT_PASS.key.length + 1)));
}

async function loadOptedOut(): Promise<Set<string>> {
  const rows = await prisma.announcementOptOut.findMany({ where: { optedOutAt: { not: null } }, select: { email: true } }).catch(() => [] as { email: string }[]);
  return new Set(rows.map((r) => r.email.trim().toLowerCase()));
}

/** Dex mail goes through Dex's own Brevo account when its key is set (its own daily allowance); everything else through RiftCompare's. */
async function send(site: string, to: string, subject: string, html: string, extras: { text: string; headers: Record<string, string> }): Promise<boolean> {
  const brand = giftBrand(site);
  const common = { ...extras, marketing: true, campaign: "premium-gift-pass" } as const;
  const dexKey = process.env.DEX_BREVO_API_KEY?.trim();
  if (site === "dex" && dexKey) {
    const from = process.env.DEX_EMAIL_FROM?.replace(/^[^<]*</, "DexCompare <") ?? "DexCompare <alerts@dexcompare.app>";
    if (await sendEmailBrevoAccount(dexKey, "DEX_BREVO_API_KEY", from, to, subject, html, common)) return true;
  }
  return sendEmailBrevo(to, subject, html, { ...common, from: brandFrom(brand) });
}

/** Grant the pass and mark the account sent, together: extend-only, tier "premium" only when no period was active. */
async function grant(userId: string, now: number): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { premiumUntil: true } });
  const current = u?.premiumUntil ? u.premiumUntil.getTime() : null;
  const hadActive = current !== null && current > now;
  const until = giftPassUntil(now, current);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { premiumUntil: new Date(until), ...(hadActive ? {} : { premiumTier: "premium" }) } }),
    prisma.counter.upsert({ where: { key: giftPassCounterKey(userId) }, create: { key: giftPassCounterKey(userId), value: Math.floor(until / 1000) }, update: {} }),
  ]);
  return until;
}

export async function runGiftPassBatch(opts: { dryRun: boolean; site: string | null; limit?: number }): Promise<GiftRunResult> {
  const now = Date.now();
  const site = opts.site && (opts.site === "rift" || GIFT_FEATURES[opts.site]) ? opts.site : null;
  const open = giftPassOpen(now);
  const limit = Math.min(opts.limit && opts.limit > 0 ? opts.limit : GIFT_DEFAULT_BATCH, GIFT_MAX_BATCH);
  const [rows, optedOut, sent] = await Promise.all([loadRows(), loadOptedOut(), loadSent()]);
  const a = giftAudience(rows, { optedOut, sent, site, now });
  const base = { ok: true, dryRun: opts.dryRun, site, open, bySite: a.bySite, excluded: a.excluded, pending: a.pending.length };
  if (opts.dryRun) return { ...base, sent: 0, failed: 0, remaining: a.pending.length };
  if (!site) return { ...base, ok: false, error: "name one site (site=dex, mtg, rift…): batches are sent per site" };
  if (!open) return { ...base, ok: false, error: "the 3-day pass closed on 1 Dec 2026, 12:00 UTC; nothing is sent" };
  if (!isBrevoEnabled()) return { ...base, ok: false, error: "BREVO_API_KEY is not set in this environment; nothing would send" };

  let sentN = 0;
  let failed = 0;
  const errors = new Set<string>();
  const brand = giftBrand(site);
  for (const r of a.pending.slice(0, limit)) {
    const key = r.email.trim().toLowerCase();
    const token = await prisma.announcementOptOut
      .upsert({ where: { email: key }, create: { email: key, token: randomUUID() }, update: {} })
      .then((row) => row.token)
      .catch(() => null);
    if (!token) {
      failed++;
      if (errors.size < 5) errors.add("opt-out row could not be written");
      continue;
    }
    const until = giftPassUntil(Date.now(), r.currentUntil);
    const mail = buildGiftPassEmail({ brand, displayName: r.displayName, until, ...giftUnsubUrls(token, site) });
    const ok = await send(site, r.email, mail.subject, mail.html, { text: mail.text, headers: mail.headers }).catch(() => false);
    if (ok) {
      sentN++;
      await grant(r.id, Date.now()).catch((e: unknown) => {
        if (errors.size < 5) errors.add(`sent but the grant failed: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`.slice(0, 200));
      });
    } else {
      failed++;
      if (errors.size < 5) errors.add(getLastEmailError() ?? "the mail provider returned false with no reason");
      // Brevo's daily allowance is spent: stop the batch rather than fail every remaining address.
      if (/\b(402|429)\b|limit|quota|credits/i.test(getLastEmailError() ?? "")) break;
    }
    await new Promise((res) => setTimeout(res, THROTTLE_MS));
  }
  return { ...base, sent: sentN, failed, remaining: a.pending.length - sentN, ...(errors.size ? { errors: [...errors] } : {}) };
}

/** May an account holding a pass start checkout although it is entitled? Yes while the pass is its only Premium. */
export async function giftPassHolder(userId: string): Promise<boolean> {
  return !!(await prisma.counter.findUnique({ where: { key: giftPassCounterKey(userId) }, select: { key: true } }).catch(() => null));
}
