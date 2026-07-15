// RiftCompare Premium + the collection portfolio engine.
//
// Premium is a Stripe subscription: the webhook stamps User.premiumUntil with the
// paid period's end on every successful payment, so entitlement is a simple date
// check — no live Stripe call on page loads, and a lapsed sub just stops being
// extended. Inert until STRIPE_PREMIUM_PRICE_ID is configured.
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { pickPrice, priceField, type Country } from "./country";
import { CONDITION_MULTIPLIER } from "./constants";
import { getMarketIndex, sydneyDayKey } from "./market-index";
import { CONTENT_TAG } from "./revalidate-content";

// The portfolio's PriceHistory read, day-scoped per (exact card set, market). The
// wishlist itself is fetched fresh above (edits reflect instantly); only the heavy
// history read is cached — so viewing your portfolio repeatedly in a day reads the
// history DB once. Keyed by the sorted card-id list so any wishlist change re-keys.
function portfolioHistory(
  cardIds: string[],
  country: Country,
  windowDays: number,
): Promise<{ cardId: string; day: Date; lowestPriceCents: number }[]> {
  const cutoff = new Date(Date.now() - windowDays * 86400_000);
  return unstable_cache(
    () =>
      dbHistory.priceHistory.findMany({
        where: { country, cardId: { in: cardIds }, day: { gte: cutoff } },
        orderBy: { day: "asc" },
        select: { cardId: true, day: true, lowestPriceCents: true },
      }),
    ["rc-portfolio-hist", country, String(windowDays), sydneyDayKey(), cardIds.join(",")],
    { revalidate: 172800, tags: [CONTENT_TAG] },
  )();
}
import { cardTileSelect } from "./cards";
import type { CardTileData } from "@/components/CardTile";
import type { PricePoint } from "./price-history";

export const PREMIUM_PRICE_ID = process.env.STRIPE_PREMIUM_PRICE_ID ?? "";
export function premiumCheckoutEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && PREMIUM_PRICE_ID);
}

// Free-trial length (days) for a first-time subscriber. 0 = OFF (immediate charge,
// the default and current behaviour). Set PREMIUM_TRIAL_DAYS=1 to switch on the
// card-gated free trial — do this ONLY after enabling the Stripe customer portal +
// the trial-ending reminder email, so trialists can cancel and aren't surprise-
// charged. Abuse is blocked by card fingerprint regardless (see the webhook).
export const PREMIUM_TRIAL_DAYS = Math.max(0, Math.floor(Number(process.env.PREMIUM_TRIAL_DAYS ?? 0)));
export function premiumTrialEnabled(): boolean {
  return PREMIUM_TRIAL_DAYS > 0;
}

// Annual plan — inert until STRIPE_PREMIUM_ANNUAL_PRICE_ID is set (a yearly Stripe
// price). When present, the /premium page shows an annual option alongside monthly.
export const PREMIUM_ANNUAL_PRICE_ID = process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID ?? "";
export function premiumAnnualEnabled(): boolean {
  return premiumCheckoutEnabled() && Boolean(PREMIUM_ANNUAL_PRICE_ID);
}

// The portfolio tracker (value history, cost-basis P&L, benchmark, CSV export) is
// FREE for now to drive adoption — flip this to false to put it back behind
// Premium. Gates read `isPremium(user) || PORTFOLIO_FREE`, so re-gating is a
// one-line change with no other edits.
export const PORTFOLIO_FREE = true;

export function isPremium(user: { premiumUntil: Date | null; isAdmin?: boolean } | null | undefined): boolean {
  if (!user) return false;
  // Admins always count as Premium — the team can use every paid feature without
  // holding a subscription. Otherwise it's an active paid period.
  if (user.isAdmin) return true;
  return !!user.premiumUntil && user.premiumUntil.getTime() > Date.now();
}

export async function getPremiumUntil(userId: string): Promise<Date | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { premiumUntil: true } });
  return u?.premiumUntil ?? null;
}

// ── Promotional Premium grants (early adopters + feedback reward) ────────────────
// These grant Premium WITHOUT Stripe (a comp), by extending premiumUntil directly.
// Both default to 3 months and are env-tunable; set the months to 0 to switch a
// promo off (e.g. EARLY_PREMIUM_MONTHS=0, or =12 for a full year).
export const EARLY_PREMIUM_MONTHS = Math.max(0, Math.floor(Number(process.env.EARLY_PREMIUM_MONTHS ?? 1)));
export const EARLY_PREMIUM_LIMIT = Math.max(0, Math.floor(Number(process.env.EARLY_PREMIUM_LIMIT ?? 100)));
export const FEEDBACK_PREMIUM_MONTHS = Math.max(0, Math.floor(Number(process.env.FEEDBACK_PREMIUM_MONTHS ?? 1)));
// +1 month of Premium to the REFERRER for each friend who signs up via their link.
export const REFERRAL_PREMIUM_MONTHS = Math.max(0, Math.floor(Number(process.env.REFERRAL_PREMIUM_MONTHS ?? 1)));
export function earlyPremiumPromoActive(): boolean {
  return EARLY_PREMIUM_MONTHS > 0 && EARLY_PREMIUM_LIMIT > 0;
}
export function feedbackPremiumActive(): boolean {
  return FEEDBACK_PREMIUM_MONTHS > 0;
}
export function referralPremiumActive(): boolean {
  return REFERRAL_PREMIUM_MONTHS > 0;
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Extend a user's Premium by `months`, STACKING onto any current future period (so a
// reward always adds time; it never shortens an existing/paid subscription). Returns
// the new premiumUntil.
export async function grantPremiumMonths(userId: string, months: number): Promise<Date | null> {
  if (months <= 0) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { premiumUntil: true } });
  if (!u) return null;
  const now = new Date();
  const base = u.premiumUntil && u.premiumUntil > now ? u.premiumUntil : now;
  const until = addMonths(base, months);
  await prisma.user.update({ where: { id: userId }, data: { premiumUntil: until } });
  return until;
}

// Synthetic seed accounts (forum personas + the marketplace test buyer) — never real
// users, so they're excluded from the "first 100 users" promo and its rank count.
export function isSeedEmail(email: string): boolean {
  return email.endsWith("@riftcompare.seed") || email.endsWith("@tcgempire.au") || email === "test@test.com";
}
export const NOT_SEED_WHERE = {
  NOT: {
    OR: [
      { email: { endsWith: "@riftcompare.seed" } },
      { email: { endsWith: "@tcgempire.au" } },
      { email: { equals: "test@test.com" } },
    ],
  },
};

// Grant the early-adopter comp to a user IF they're within the first
// EARLY_PREMIUM_LIMIT REAL registrations and haven't already been granted. Idempotent
// via the earlyPremiumGranted flag, so it's safe to run on every signup AND re-run as
// a backfill. Seed accounts are skipped and don't consume a slot. No-op when the promo
// is off. Returns true if a grant happened.
export async function grantEarlyAdopterPremium(userId: string): Promise<boolean> {
  if (!earlyPremiumPromoActive()) return false;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, earlyPremiumGranted: true, email: true },
  });
  if (!u || u.earlyPremiumGranted || isSeedEmail(u.email)) return false;
  // Registration rank among REAL accounts, up to and including this one.
  const rank = await prisma.user.count({ where: { AND: [NOT_SEED_WHERE, { createdAt: { lte: u.createdAt } }] } });
  if (rank > EARLY_PREMIUM_LIMIT) return false;
  await grantPremiumMonths(userId, EARLY_PREMIUM_MONTHS);
  await prisma.user.update({ where: { id: userId }, data: { earlyPremiumGranted: true } });
  return true;
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export interface Holding {
  card: CardTileData; // full tile data so a holding can open the QuickView popup
  cardId: string;
  name: string;
  slug: string | null;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  quantity: number;
  condition: string;
  isFoil: boolean;
  unitCents: number | null; // current lowest market price × condition multiplier
  valueCents: number; // unit × quantity (0 when unpriced)
  d7pct: number | null; // the card's own 7-day price move
  costBasisCents: number | null; // what the owner paid per unit (null = unknown)
  plCents: number | null; // unrealised profit/loss for this row (null without cost+price)
  plPct: number | null;
}

// Cost-basis profit & loss, over holdings that have BOTH a recorded cost and a
// current price (so the comparison is coherent).
export interface PnL {
  investedCents: number; // total paid across costed holdings
  valueCents: number; // current value of those same holdings
  plCents: number;
  plPct: number | null;
  costedRows: number; // how many holdings have a cost basis recorded
}

export interface Portfolio {
  totalCents: number;
  pricedCount: number; // holdings rows with a live price
  unpricedCount: number;
  holdings: Holding[]; // dearest first
  series: PricePoint[]; // total collection value per day (premium feature)
  d1: number | null; // % move of the total vs yesterday
  d7: number | null;
  d30: number | null;
  pnl: PnL | null; // null when no cost basis is recorded anywhere
  // Benchmark: the RiftCompare Index move over the same windows, so the portfolio's
  // performance can be read against the market ("you're beating the market by X").
  index: { d7: number | null; d30: number | null } | null;
}

const condMult = (condition: string) => CONDITION_MULTIPLIER[condition] ?? 1;

const pctChange = (now: number, then: number | undefined): number | null =>
  then == null || then === 0 ? null : Math.round(((now - then) / then) * 1000) / 10;

// Value the user's collection in their market: current totals for everyone, plus
// a daily value-over-time series rebuilt from PriceHistory (same carry-forward
// approach as the market index, weighted by owned quantity × condition).
export async function getPortfolio(userId: string, country: Country, windowDays = 90): Promise<Portfolio> {
  const rows = await prisma.collectionCard.findMany({
    where: { userId },
    include: {
      card: { select: cardTileSelect(country) },
    },
  });

  const cardIds = [...new Set(rows.map((r) => r.cardId))].sort();
  const hist = cardIds.length ? await portfolioHistory(cardIds, country, windowDays) : [];

  // Per-card daily price map + the card's own 7d move.
  const byCard = new Map<string, Map<number, number>>();
  const daySet = new Set<number>();
  for (const h of hist) {
    const t = h.day.getTime();
    daySet.add(t);
    (byCard.get(h.cardId) ?? byCard.set(h.cardId, new Map()).get(h.cardId)!).set(t, h.lowestPriceCents);
  }
  const d7ByCard = new Map<string, number | null>();
  for (const [cardId, series] of byCard) {
    const ts = [...series.keys()].sort((a, b) => a - b);
    const last = ts[ts.length - 1];
    let then = ts[0];
    for (const t of ts) if (t <= last - 7 * 86400_000) then = t;
    d7ByCard.set(cardId, then === last ? null : pctChange(series.get(last)!, series.get(then)));
  }

  const holdings: Holding[] = rows
    .map((r) => {
      const market = pickPrice(r.card, country);
      const unit = market != null ? Math.round(market * condMult(r.condition)) : null;
      const valueCents = (unit ?? 0) * r.quantity;
      const cost = r.costBasisCents ?? null;
      const investedRow = cost != null ? cost * r.quantity : null;
      // P&L only when we know both what they paid AND the current value.
      const plCents = cost != null && unit != null ? valueCents - cost * r.quantity : null;
      const plPct = plCents != null && investedRow != null && investedRow > 0 ? Math.round((plCents / investedRow) * 1000) / 10 : null;
      return {
        card: r.card as unknown as CardTileData,
        cardId: r.cardId,
        name: r.card.name,
        slug: r.card.slug,
        setCode: r.card.setCode,
        collectorNumber: r.card.collectorNumber,
        imageThumbUrl: r.card.imageThumbUrl,
        quantity: r.quantity,
        condition: r.condition,
        isFoil: r.isFoil,
        unitCents: unit,
        valueCents,
        d7pct: d7ByCard.get(r.cardId) ?? null,
        costBasisCents: cost,
        plCents,
        plPct,
      };
    })
    .sort((a, b) => b.valueCents - a.valueCents);

  // Aggregate P&L over holdings that have both a cost and a current price.
  const costed = holdings.filter((h) => h.costBasisCents != null && h.unitCents != null);
  const anyCost = holdings.some((h) => h.costBasisCents != null);
  const pnl: PnL | null = anyCost
    ? (() => {
        const investedCents = costed.reduce((s, h) => s + (h.costBasisCents ?? 0) * h.quantity, 0);
        const valueCents = costed.reduce((s, h) => s + h.valueCents, 0);
        const plCents = valueCents - investedCents;
        return {
          investedCents,
          valueCents,
          plCents,
          plPct: investedCents > 0 ? Math.round((plCents / investedCents) * 1000) / 10 : null,
          costedRows: holdings.filter((h) => h.costBasisCents != null).length,
        };
      })()
    : null;

  // Market benchmark for the same windows (best-effort — never block the page).
  const idx = await getMarketIndex(country).catch(() => null);
  const index = idx ? { d7: idx.d7, d30: idx.d30 } : null;

  // Daily total series (carry-forward per card so gaps don't crater the line).
  const days = [...daySet].sort((a, b) => a - b);
  const carried = new Map<string, number>();
  const series: PricePoint[] = [];
  for (const t of days) {
    let total = 0;
    for (const r of rows) {
      const p = byCard.get(r.cardId)?.get(t) ?? carried.get(`${r.id}`);
      if (p == null) continue;
      carried.set(`${r.id}`, byCard.get(r.cardId)?.get(t) ?? p);
      total += Math.round(p * condMult(r.condition)) * r.quantity;
    }
    if (total > 0) series.push({ t, v: total });
  }

  const latest = series[series.length - 1]?.v ?? 0;
  const at = (daysBack: number): number | undefined => {
    if (!series.length) return undefined;
    const target = series[series.length - 1].t - daysBack * 86400_000;
    let best: PricePoint | undefined;
    for (const p of series) if (p.t <= target) best = p;
    return best?.v;
  };

  return {
    totalCents: holdings.reduce((s, h) => s + h.valueCents, 0),
    pricedCount: holdings.filter((h) => h.unitCents != null).length,
    unpricedCount: holdings.filter((h) => h.unitCents == null).length,
    holdings,
    series,
    d1: pctChange(latest, series[series.length - 2]?.v),
    d7: pctChange(latest, at(7)),
    d30: pctChange(latest, at(30)),
    pnl,
    index,
  };
}

export { priceField };
