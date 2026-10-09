import { prisma } from "./db";
import { COUNTRIES, currencyOf, type Country } from "./country";
import { isPremium, type EntitlementUser } from "./premium";
import { isAdminEmail, ADMIN_EMAILS } from "./admin-emails";
import { ALERT_BUDGET_WINDOW_MS, PAID_SEND_CAP, alertDailyBudget, isMaterialDrop } from "./price-alerts";
import { recentlyEmailedAddresses, RunBudget, WATCH_EMAILS_PER_ADDRESS, type AlertBudgetDb } from "./alert-budget";
import { pausedAddresses } from "./alert-mute";
import { watchActionLinks } from "./alert-actions";
import { sendGradedWatchEmail as sendImpl, type GradedWatchItem } from "./watch-emails";
import { convertCents } from "./fx";
import { gradeLabel } from "./graded-history";
import { cardHref } from "./card-url";
import { SITE_URL } from "./site";
import { notify } from "./notifications";
import { formatMoney } from "./format";

// ─────────────────────────────────────────────────────────────────────────────
// GRADED WATCHES (2026-10-09, owner: a Plus feature). A Plus or Premium member
// watches one grade of one card ("PSA 10") in their market, and gets an email
// when the cheapest live eBay listing for that grade makes a MATERIAL new low
// (isMaterialDrop, the card alerts' own threshold) against the last price we
// emailed, or the first price we saw. Runs inside the paid alert route after
// the sealed pass and shares its send cap and the day's address budget.
//
// The data is EbayGradedListing, written by the daily eBay pass (lib/price-
// import.ts), at most six slabs per card per market. Markets rotate (UK, SG and
// EU are searched every third day) and a listing older than 72 hours is not
// trusted, so "no listing today" means UNKNOWN: the baseline is left alone and
// nothing is sent. A watch's first sighting sets the baseline without an email.
// ─────────────────────────────────────────────────────────────────────────────

export const GRADED_WATCH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const GRADED_WATCH_READ_CAP = 5000;
/** Per member: generous for Plus, a ceiling against a runaway client. */
export const GRADED_WATCH_LIMIT = 100;
const FRESH_MS = 72 * 60 * 60 * 1000;

type Db = typeof prisma;

export interface GradedLow {
  priceCents: number; // in the market's currency
  title: string;
  url: string;
  seenAt: Date;
}

/** Cheapest live listing per "cardId|market|grade", converted to the market's currency. */
export function cheapestByGrade(
  rows: { cardId: string; country: string; priceCents: number; currency: string; grader: string | null; grade: number | null; title: string; url: string; updatedAt: Date }[],
): Map<string, GradedLow> {
  const out = new Map<string, GradedLow>();
  for (const r of rows) {
    if (!(r.country in COUNTRIES) || !(r.priceCents > 0)) continue;
    const grade = gradeLabel(r.grader, r.grade);
    if (grade === "Graded") continue;
    const cur = currencyOf(r.country as Country);
    const cents = Math.round(r.currency === cur ? r.priceCents : convertCents(r.priceCents, r.currency, cur));
    const key = `${r.cardId}|${r.country}|${grade}`;
    const prev = out.get(key);
    if (!prev || cents < prev.priceCents) out.set(key, { priceCents: cents, title: r.title, url: r.url, seenAt: r.updatedAt });
  }
  return out;
}

/** Should this low be emailed? A material drop against the last emailed (else last seen) price. */
export function shouldEmailGraded(w: { lastLowCents: number | null; lastEmailedCents: number | null; lastNotifiedAt: Date | null; snoozedUntil: Date | null }, lowCents: number, now: Date): "first" | "drop" | "cooldown" | "snoozed" | "no" {
  if (w.lastLowCents == null && w.lastEmailedCents == null) return "first";
  if (w.snoozedUntil && w.snoozedUntil > now) return "snoozed";
  const ref = w.lastEmailedCents ?? w.lastLowCents!;
  if (!isMaterialDrop(ref, lowCents)) return "no";
  if (w.lastNotifiedAt && now.getTime() - w.lastNotifiedAt.getTime() < GRADED_WATCH_COOLDOWN_MS) return "cooldown";
  return "drop";
}

export interface GradedWatchRunSummary {
  watches: number;
  lapsed: number;
  unknown: number;
  baselines: number;
  drops: number;
  cooldown: number;
  snoozed: number;
  paused: number;
  deferred: number;
  emails: number;
  updated: number;
}

export async function runGradedWatches(
  deps: { db?: Db; now?: Date; sendCap?: number; dailyBudget?: number; send?: (to: string, item: GradedWatchItem) => Promise<boolean>; notifyUsers?: boolean } = {},
): Promise<GradedWatchRunSummary> {
  const db = deps.db ?? prisma;
  const now = deps.now ?? new Date();
  const send = deps.send ?? sendImpl;
  const summary: GradedWatchRunSummary = { watches: 0, lapsed: 0, unknown: 0, baselines: 0, drops: 0, cooldown: 0, snoozed: 0, paused: 0, deferred: 0, emails: 0, updated: 0 };

  const rows = await db.gradedWatch.findMany({
    where: {
      user: {
        is: {
          OR: [
            { isAdmin: true },
            { premiumUntil: { gt: now } },
            ...(ADMIN_EMAILS.length ? [{ email: { in: ADMIN_EMAILS, mode: "insensitive" as const } }] : []),
          ],
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: GRADED_WATCH_READ_CAP,
    select: {
      id: true,
      userId: true,
      email: true,
      cardId: true,
      market: true,
      grade: true,
      lastLowCents: true,
      lastEmailedCents: true,
      lastNotifiedAt: true,
      snoozedUntil: true,
      card: { select: { id: true, slug: true, name: true } },
      user: { select: { email: true, isAdmin: true, premiumUntil: true, premiumTier: true, premiumTierFloor: true } },
    },
  });
  summary.watches = rows.length;
  const live = rows.filter((w) => {
    const user: EntitlementUser = { ...w.user, isAdmin: w.user.isAdmin || isAdminEmail(w.user.email) };
    if (isPremium(user)) return true;
    summary.lapsed++;
    return false;
  });
  if (!live.length) return summary;

  // Only the watched cards' slabs, fresh ones only (egress rules 1 and 3).
  const slabs = await db.ebayGradedListing.findMany({
    where: { cardId: { in: [...new Set(live.map((w) => w.cardId))] }, updatedAt: { gte: new Date(now.getTime() - FRESH_MS) } },
    select: { cardId: true, country: true, priceCents: true, currency: true, grader: true, grade: true, title: true, url: true, updatedAt: true },
    take: 20_000,
  });
  const lows = cheapestByGrade(slabs);

  const writes: { id: string; data: { lastLowCents?: number; lastEmailedCents?: number; lastNotifiedAt?: Date } }[] = [];
  const candidates: { w: (typeof live)[number]; low: GradedLow }[] = [];
  for (const w of live) {
    const low = lows.get(`${w.cardId}|${w.market}|${w.grade}`);
    if (!low) {
      summary.unknown++;
      continue;
    }
    const verdict = shouldEmailGraded(w, low.priceCents, now);
    if (verdict === "first") {
      summary.baselines++;
      writes.push({ id: w.id, data: { lastLowCents: low.priceCents } });
    } else if (verdict === "drop") {
      candidates.push({ w, low });
    } else {
      if (verdict === "cooldown") summary.cooldown++;
      if (verdict === "snoozed") summary.snoozed++;
      writes.push({ id: w.id, data: { lastLowCents: low.priceCents } });
    }
  }
  summary.drops = candidates.length;

  const paused = candidates.length ? await pausedAddresses(db, [...new Set(candidates.map((c) => c.w.email))]) : new Set<string>();
  const recent = candidates.length ? await recentlyEmailedAddresses(db as unknown as AlertBudgetDb, now, ALERT_BUDGET_WINDOW_MS) : new Set<string>();
  const budget = new RunBudget(recent, Math.max(0, (deps.dailyBudget ?? alertDailyBudget()) - recent.size), deps.sendCap ?? PAID_SEND_CAP, WATCH_EMAILS_PER_ADDRESS);
  for (const { w, low } of candidates) {
    if (paused.has(w.email)) {
      summary.paused++;
      continue; // baseline held, so it re-detects when the address is unpaused
    }
    if (budget.reason(w.email)) {
      summary.deferred++;
      continue;
    }
    budget.open(w.email);
    const market = w.market as Country;
    const item: GradedWatchItem = {
      watchId: w.id,
      cardName: w.card.name,
      cardUrl: `${SITE_URL}${cardHref(w.card)}`,
      grade: w.grade,
      market,
      currency: currencyOf(market),
      priceCents: low.priceCents,
      referenceCents: w.lastEmailedCents ?? w.lastLowCents,
      listingTitle: low.title,
      listingUrl: low.url,
      checkedAt: low.seenAt,
      actions: watchActionLinks({ kind: "graded", id: w.id, now }),
    };
    if (!(await send(w.email, item))) continue;
    summary.emails++;
    writes.push({ id: w.id, data: { lastLowCents: low.priceCents, lastEmailedCents: low.priceCents, lastNotifiedAt: now } });
    if (deps.notifyUsers !== false) {
      void notify(w.userId, "graded_watch", `${w.card.name} ${w.grade} hit a new low: ${formatMoney(low.priceCents, item.currency)}`, "Graded price history is on the card page.", cardHref(w.card)).catch(() => {});
    }
  }
  summary.updated = writes.length;
  if (writes.length) await db.$transaction(writes.map((x) => db.gradedWatch.update({ where: { id: x.id }, data: x.data })));
  return summary;
}

// ── The route's logic (app/api/watches/graded) ───────────────────────────────

export async function listGradedWatches(userId: string, cardId: string) {
  return prisma.gradedWatch.findMany({ where: { userId, cardId }, select: { id: true, grade: true, market: true }, take: 50 });
}

export async function createGradedWatch(user: { id: string; email: string } & EntitlementUser, cardId: string, market: string, grade: string) {
  if (!isPremium(user)) return { status: 403, body: { error: "plus_required" } };
  if (!(market in COUNTRIES)) return { status: 400, body: { error: "market" } };
  if (!/^[A-Z]{2,4} \d{1,2}(\.\d)?$/.test(grade)) return { status: 400, body: { error: "grade" } };
  const card = await prisma.card.findFirst({ where: { OR: [{ id: cardId }, { slug: cardId }] }, select: { id: true } });
  if (!card) return { status: 404, body: { error: "card" } };
  const count = await prisma.gradedWatch.count({ where: { userId: user.id } });
  if (count >= GRADED_WATCH_LIMIT) return { status: 409, body: { error: "limit", limit: GRADED_WATCH_LIMIT } };
  const w = await prisma.gradedWatch.upsert({
    where: { userId_cardId_market_grade: { userId: user.id, cardId: card.id, market, grade } },
    create: { userId: user.id, email: user.email.toLowerCase(), cardId: card.id, market, grade },
    update: {},
    select: { id: true, grade: true, market: true },
  });
  return { status: 200, body: { ok: true, watch: w } };
}

export async function deleteGradedWatch(userId: string, id: string) {
  const r = await prisma.gradedWatch.deleteMany({ where: { id, userId } });
  return { status: 200, body: { ok: true, removed: r.count } };
}
