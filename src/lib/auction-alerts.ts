import { prisma } from "./db";
import { COUNTRIES, type Country } from "./country";
import { isPremium, type EntitlementUser } from "./premium";
import { isAdminEmail, ADMIN_EMAILS } from "./admin-emails";
import { ALERT_BUDGET_WINDOW_MS, alertDailyBudget } from "./price-alerts";
import { recentlyEmailedAddresses, RunBudget, type AlertBudgetDb } from "./alert-budget";
import { pausedAddresses } from "./alert-mute";
import { watchActionLinks } from "./alert-actions";
import { cardIdentityStages, type EbayCardIdentity } from "./ebay";
import { sendAuctionAlertEmail as sendImpl, type AuctionAlertItem } from "./watch-emails";
import { cardHref } from "./card-url";
import { SITE_URL } from "./site";

// ─────────────────────────────────────────────────────────────────────────────
// AUCTION ALERTS (2026-10-09, owner: a Premium feature). When a card on a
// Premium member's watchlist has a live eBay auction in their market ending
// within the next 24 hours, they get one email listing those auctions. Runs
// after every auction sweep (refresh-auctions.yml → /api/cron/auction-alerts).
//
// The auction rows carry no card id, deliberately (schema.prisma: "a wrong card
// link is worse than no card link"), so this matches each watched card against
// the auction titles with the SAME identity rules the daily eBay price pass
// uses (cardIdentityStages, graded slabs allowed): name, collector number,
// signature and promo flags, no lots, no foreign printings. The email says the
// match is by title. Each auction goes to an address once (AuctionAlertSent).
// Uses no eBay API calls: it reads what the sweep already stored.
// ─────────────────────────────────────────────────────────────────────────────

export const AUCTION_ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Auctions in one email, soonest ending first. */
export const AUCTION_ALERT_MAX_ITEMS = 6;
/** New addresses one run may open on the shared alert budget. */
export const AUCTION_ALERT_SEND_CAP = 20;
const WATCH_READ_CAP = 5000;
const AUCTION_READ_CAP = 2000;
const SENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Db = typeof prisma;

export interface AuctionRow {
  itemId: string;
  country: string;
  title: string;
  url: string;
  currentBidCents: number;
  currency: string;
  bidCount: number;
  endsAt: Date;
}

export function identityOf(card: { name: string; setCode: string; collectorNumber: string; isPromo: boolean }): EbayCardIdentity {
  const [rawNum, total] = card.collectorNumber.split("/");
  return {
    name: card.name,
    setCode: card.setCode,
    number: (rawNum ?? "").replace(/\*/g, ""),
    total: total ?? "",
    isSignature: card.collectorNumber.includes("*"),
    isPromo: card.isPromo,
  };
}

/** Does this auction's title describe this exact card and printing? */
export function auctionMatchesCard(a: Pick<AuctionRow, "title">, card: EbayCardIdentity): boolean {
  const item = { title: a.title, price: { value: "1" } };
  return cardIdentityStages(card, { allowGraded: true }).every((s) => s.pred(item));
}

export interface AuctionAlertRunSummary {
  members: number;
  lapsed: number;
  off: number;
  auctions: number;
  matched: number;
  alreadySent: number;
  paused: number;
  deferred: number;
  emails: number;
  pruned: number;
}

export async function runAuctionAlerts(
  deps: { db?: Db; now?: Date; sendCap?: number; dailyBudget?: number; send?: typeof sendImpl } = {},
): Promise<AuctionAlertRunSummary> {
  const db = deps.db ?? prisma;
  const now = deps.now ?? new Date();
  const send = deps.send ?? sendImpl;
  const summary: AuctionAlertRunSummary = { members: 0, lapsed: 0, off: 0, auctions: 0, matched: 0, alreadySent: 0, paused: 0, deferred: 0, emails: 0, pruned: 0 };

  // Old dedupe rows go first: an auction ends within a day, so a week is plenty.
  summary.pruned = (await db.auctionAlertSent.deleteMany({ where: { sentAt: { lt: new Date(now.getTime() - SENT_TTL_MS) } } })).count;

  const auctions: AuctionRow[] = await db.ebayAuctionListing.findMany({
    where: { endsAt: { gt: now, lte: new Date(now.getTime() + AUCTION_ALERT_WINDOW_MS) } },
    orderBy: { endsAt: "asc" },
    take: AUCTION_READ_CAP,
    select: { itemId: true, country: true, title: true, url: true, currentBidCents: true, currency: true, bidCount: true, endsAt: true },
  });
  summary.auctions = auctions.length;
  if (!auctions.length) return summary;

  // Premium members' watched cards, signed-in watches only.
  const watches = await db.priceAlert.findMany({
    where: {
      userId: { not: null },
      user: {
        is: {
          auctionAlertsOff: false,
          OR: [
            { isAdmin: true },
            { premiumUntil: { gt: now } },
            ...(ADMIN_EMAILS.length ? [{ email: { in: ADMIN_EMAILS, mode: "insensitive" as const } }] : []),
          ],
        },
      },
    },
    take: WATCH_READ_CAP,
    select: {
      email: true,
      market: true,
      userId: true,
      card: { select: { id: true, slug: true, name: true, setCode: true, collectorNumber: true, isPromo: true } },
      user: { select: { email: true, isAdmin: true, premiumUntil: true, premiumTier: true, premiumTierFloor: true, auctionAlertsSnoozedUntil: true } },
    },
  });

  const byCountry = new Map<string, AuctionRow[]>();
  for (const a of auctions) (byCountry.get(a.country) ?? byCountry.set(a.country, []).get(a.country)!).push(a);

  // Per member (one address): the auctions that match their watched cards.
  const perMember = new Map<string, { userId: string; email: string; items: (AuctionItemWithKey)[] }>();
  const members = new Set<string>();
  for (const w of watches) {
    if (!w.userId || !w.user) continue;
    members.add(w.userId);
    const user: EntitlementUser = { ...w.user, isAdmin: w.user.isAdmin || isAdminEmail(w.user.email) };
    if (!isPremium(user, "premium")) {
      summary.lapsed++;
      continue;
    }
    if (w.user.auctionAlertsSnoozedUntil && w.user.auctionAlertsSnoozedUntil > now) {
      summary.off++;
      continue;
    }
    if (!(w.market in COUNTRIES)) continue;
    const identity = identityOf(w.card);
    for (const a of byCountry.get(w.market) ?? []) {
      if (!auctionMatchesCard(a, identity)) continue;
      const entry = perMember.get(w.userId) ?? perMember.set(w.userId, { userId: w.userId, email: w.user.email.toLowerCase(), items: [] }).get(w.userId)!;
      if (entry.items.some((x) => x.itemId === a.itemId && x.country === a.country)) continue;
      entry.items.push({
        itemId: a.itemId,
        country: a.country,
        cardName: w.card.name,
        cardUrl: `${SITE_URL}${cardHref(w.card)}`,
        title: a.title,
        url: a.url,
        currentBidCents: a.currentBidCents,
        currency: a.currency,
        bidCount: a.bidCount,
        endsAt: a.endsAt,
        market: a.country as Country,
      });
      summary.matched++;
    }
  }
  summary.members = members.size;
  if (!perMember.size) return summary;

  // Drop what each address has already been sent.
  const emails = [...new Set([...perMember.values()].map((m) => m.email))];
  const sent = await db.auctionAlertSent.findMany({ where: { email: { in: emails } }, select: { email: true, itemId: true, country: true }, take: 20_000 });
  const sentKey = new Set(sent.map((s) => `${s.email}|${s.itemId}|${s.country}`));
  for (const m of perMember.values()) {
    const before = m.items.length;
    m.items = m.items.filter((it) => !sentKey.has(`${m.email}|${it.itemId}|${it.country}`));
    summary.alreadySent += before - m.items.length;
  }
  const ready = [...perMember.values()].filter((m) => m.items.length);
  if (!ready.length) return summary;

  const paused = await pausedAddresses(db, ready.map((m) => m.email));
  const recent = await recentlyEmailedAddresses(db as unknown as AlertBudgetDb, now, ALERT_BUDGET_WINDOW_MS);
  const budget = new RunBudget(recent, Math.max(0, (deps.dailyBudget ?? alertDailyBudget()) - recent.size), deps.sendCap ?? AUCTION_ALERT_SEND_CAP, 1);
  for (const m of ready) {
    if (paused.has(m.email)) {
      summary.paused++;
      continue;
    }
    if (budget.reason(m.email)) {
      summary.deferred++;
      continue;
    }
    budget.open(m.email);
    const items = m.items.sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime()).slice(0, AUCTION_ALERT_MAX_ITEMS);
    const ok = await send(m.email, items, watchActionLinks({ kind: "auction", id: m.userId, now }));
    if (!ok) continue;
    summary.emails++;
    // Everything matched for this address is marked sent, including any past
    // the email's cap: the email links to /auctions for the rest.
    await db.auctionAlertSent.createMany({
      data: m.items.map((it) => ({ email: m.email, itemId: it.itemId, country: it.country, sentAt: now })),
      skipDuplicates: true,
    });
  }
  return summary;
}

type AuctionItemWithKey = AuctionAlertItem & { itemId: string; country: string };
