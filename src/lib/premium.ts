// RiftCompare Premium + the collection portfolio engine.
//
// Premium is a Stripe subscription: the webhook stamps User.premiumUntil with the
// paid period's end on every successful payment, so entitlement is a simple date
// check — no live Stripe call on page loads, and a lapsed sub just stops being
// extended. Inert until STRIPE_PREMIUM_PRICE_ID is configured.
import { unstable_cache } from "next/cache";
import type Stripe from "stripe";
import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { pickPrice, priceField, type Country } from "./country";
import { CONDITION_MULTIPLIER } from "./constants";
import { investedCents, unitCostCents } from "./collection-cost";
import { sydneyWeekKey, historySource } from "./price-history";
import { getMarketIndex } from "./market-index";
import { HISTORY_TAG } from "./revalidate-content";
import { stripe, stripeEnabled } from "./stripe";
import { sendTrialEndingEmail, sendCheckoutRecoveryEmail } from "./email";
import { formatMoney } from "./format";
import { PREMIUM_PRICE_AMOUNT, PREMIUM_PRICE_PERIOD, premiumFromLine } from "./site";

// The portfolio's PriceHistory read, day-scoped per (exact card set, market). The
// wishlist itself is fetched fresh above (edits reflect instantly); only the heavy
// history read is cached — so viewing your portfolio repeatedly in a day reads the
// history DB once. Keyed by the sorted card-id list so any wishlist change re-keys.
//
// LIVE CRASH (2026-09-01): "t.day.getTime is not a function". unstable_cache
// persists its return value as JSON — a real Prisma call hands back genuine
// Date objects, but a CACHE HIT replays them through a JSON round-trip first,
// which turns every Date into an ISO string (Date has a toJSON, a plain string
// does not turn back into a Date on the way out). The type below still says
// `day: Date` because that's true on a cache MISS, so nothing caught this at
// compile time — only a warm cache, in production, exposed the lie. Every
// caller (getPortfolio's `h.day.getTime()`) trusted that type completely.
// Re-hydrating `day` here, once, at the one place this cache is read, means
// every consumer gets a real Date either way instead of each one needing to
// remember to guard against a cache hit that looks identical to a miss until
// this exact line throws.
function portfolioHistory(
  cardIds: string[],
  country: Country,
  windowDays: number,
): Promise<{ cardId: string; day: Date; lowestPriceCents: number }[]> {
  const { source, convert } = historySource(country);
  const cutoff = new Date(Date.now() - windowDays * 86400_000);
  return unstable_cache(
    () =>
      dbHistory.priceHistory.findMany({
        where: { country: source, cardId: { in: cardIds }, day: { gte: cutoff } },
        orderBy: { day: "asc" },
        select: { cardId: true, day: true, lowestPriceCents: true },
      }),
    ["rc-portfolio-hist", country, String(windowDays), sydneyWeekKey(), cardIds.join(",")],
    { revalidate: 8 * 86400, tags: [HISTORY_TAG] },
  )().then((rows) => rows.map((r) => ({ ...r, day: new Date(r.day), lowestPriceCents: convert(r.lowestPriceCents) })));
}
import { cardTileSelect } from "./cards";
import type { CardTileData } from "@/components/CardTile";
import type { PricePoint } from "./price-history";

export const PREMIUM_PRICE_ID = process.env.STRIPE_PREMIUM_PRICE_ID ?? "";
export function premiumCheckoutEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && PREMIUM_PRICE_ID);
}

// ── Plus: the second, cheaper paid tier (2026-09-11) ────────────────────────
// Same "inert until the price id is set" pattern as the annual price below.
// Plus is ad-free plus the full lists (Deal Finder, Rising Cards, Rising
// Sealed); Premium is Plus plus the four pro tools (Value Finder, Bulk Pricer,
// Best Basket, Demand Finder). See the access-tier note further down.
export type PremiumTier = "plus" | "premium";
const TIER_RANK: Record<PremiumTier, number> = { plus: 1, premium: 2 };
export function normalizeTier(v: unknown): PremiumTier {
  return v === "plus" ? "plus" : "premium";
}
export const PLUS_PRICE_ID = process.env.STRIPE_PLUS_PRICE_ID ?? "";
export const PLUS_ANNUAL_PRICE_ID = process.env.STRIPE_PLUS_ANNUAL_PRICE_ID ?? "";
export function premiumPlusEnabled(): boolean {
  return premiumCheckoutEnabled() && Boolean(PLUS_PRICE_ID);
}
export function plusAnnualEnabled(): boolean {
  return premiumPlusEnabled() && Boolean(PLUS_ANNUAL_PRICE_ID);
}
// The price id for a given tier/interval — falls back to the tier's monthly
// price if the annual one isn't configured, same fallback checkout already
// does for Premium. Called after the caller has already confirmed the tier is
// enabled; an unconfigured tier returns "" (checkout's own gate stops it there).
export function priceIdFor(tier: PremiumTier, plan: "monthly" | "annual"): string {
  if (tier === "plus") {
    return plan === "annual" && PLUS_ANNUAL_PRICE_ID ? PLUS_ANNUAL_PRICE_ID : PLUS_PRICE_ID;
  }
  return plan === "annual" && PREMIUM_ANNUAL_PRICE_ID ? PREMIUM_ANNUAL_PRICE_ID : PREMIUM_PRICE_ID;
}
// Resolve a live Stripe price id back to a tier. Unknown/retired price ids —
// including a price that used to be a standalone offer and was retired —
// resolve to "premium", the grandfathered default, rather than silently
// downgrading someone. Only a price id that IS a currently configured Plus
// price counts as Plus.
export function tierFromPriceId(priceId: string | null | undefined): PremiumTier {
  if (priceId && (priceId === PLUS_PRICE_ID || priceId === PLUS_ANNUAL_PRICE_ID)) return "plus";
  return "premium";
}

// Free-trial length (days) for a first-time subscriber. Defaults to 14 — set
// PREMIUM_TRIAL_DAYS=0 in the environment to switch it back off (immediate charge,
// no trial). Card-gated: a card is still required up front (payment_method_collection
// in the checkout route), so the trial auto-converts to paid unless cancelled.
// Turning this on requires BOTH the Stripe customer portal (api/premium/portal —
// done) AND the trial-ending reminder email (runPremiumTrialReminders below — done)
// so trialists can see the charge coming and cancel before it happens. Abuse is
// blocked by card fingerprint regardless of trial length (see the webhook).
export const PREMIUM_TRIAL_DAYS = Math.max(0, Math.floor(Number(process.env.PREMIUM_TRIAL_DAYS ?? 14)));
export function premiumTrialEnabled(): boolean {
  return PREMIUM_TRIAL_DAYS > 0;
}

// The reminder half of the trial precondition above. Stripe's own
// customer.subscription.trial_will_end webhook only fires 3 days before a trial
// converts, which is too coarse to rely on alone (and fires too late to matter at
// all for a trial 3 days or shorter) — so this runs as a daily cron (see
// api/cron/premium-trial-reminders) instead of reacting to that webhook.
//
// Finds trials converting to paid within the next 24h that haven't been warned yet,
// looks up each trialist's OWN live Stripe subscription for the real charge amount
// (never PREMIUM_PRICE_AMOUNT alone — an annual trial converts to the yearly price,
// and guessing wrong in a billing email is worse than the extra API call), and
// stamps trialReminderSentAt regardless of send success so a lost email doesn't
// retry forever (same convention as Order.shipReminderAt).
export async function runPremiumTrialReminders(): Promise<number> {
  if (!stripeEnabled()) return 0;

  const cutoff = new Date(Date.now() + 86_400_000);
  const candidates = await prisma.user.findMany({
    where: {
      trialStartedAt: { not: null },
      trialReminderSentAt: null,
      stripeCustomerId: { not: null },
      premiumUntil: { gt: new Date(), lte: cutoff },
    },
    select: { id: true, email: true, stripeCustomerId: true },
  });
  if (!candidates.length) return 0;

  let sent = 0;
  for (const u of candidates) {
    try {
      const subs = await stripe().subscriptions.list({ customer: u.stripeCustomerId!, status: "trialing", limit: 1 });
      const sub = subs.data[0];
      if (sub?.trial_end) {
        const price = sub.items.data[0]?.price;
        const amountLabel =
          price?.unit_amount != null
            ? `${formatMoney(price.unit_amount, price.currency.toUpperCase())}/${price.recurring?.interval ?? "mo"}`
            : `${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD}`;
        if (await sendTrialEndingEmail(u.email, new Date(sub.trial_end * 1000), amountLabel)) sent++;
      }
      // No active trialing subscription (already converted, cancelled, or a lookup
      // race) — nothing to warn about, but still stamp below so this account is
      // never re-checked.
    } catch {
      /* best-effort — one failed lookup must not block the rest of the batch */
    }
    await prisma.user.update({ where: { id: u.id }, data: { trialReminderSentAt: new Date() } }).catch(() => {});
  }
  return sent;
}

// The highest-intent, still-unconverted signal on the site: someone who opened
// Stripe checkout for Premium (recorded server-side the moment checkout starts
// — see api/premium/checkout's PremiumClick write) but never came back with a
// paid or trialing subscription. Runs as a daily cron (see
// api/cron/premium-checkout-recovery), same idempotent-stamp shape as
// runPremiumTrialReminders above: the stamp is written unconditionally after
// each attempt, outside the try, with .catch — a lost email must never retry
// forever.
//
// WINDOWED 20h-72h after the click: the lower bound avoids nagging someone
// still mid-checkout (a card can take a few minutes, or they may have simply
// tabbed away and come back); the upper bound means a click older than 3 days
// is treated as cold rather than "still waiting". Capped at 200/run for the
// same reason the maintenance workflow's other batch jobs cap themselves.
export async function runCheckoutRecovery(): Promise<number> {
  const now = Date.now();
  const windowStart = new Date(now - 72 * 3600_000);
  const windowEnd = new Date(now - 20 * 3600_000);

  // groupBy, NOT findMany({ distinct: [...] }) — Prisma's `distinct` dedupes in
  // the CLIENT (every matching row still comes back over the wire), where a
  // real GROUP BY pushes the dedup into Postgres. See
  // tests/prisma-client-side-distinct.test.ts for the incident this rule
  // exists to prevent.
  const clicks = await prisma.premiumClick.groupBy({
    by: ["userId"],
    where: { source: "checkout", userId: { not: null }, createdAt: { gte: windowStart, lte: windowEnd } },
  });
  const userIds = clicks.map((c) => c.userId).filter((id): id is string => id != null);
  if (!userIds.length) return 0;

  const candidates = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      checkoutRecoverySentAt: null,
      isAdmin: false,
      // Never nag someone who's already Premium right now — the checkout they
      // abandoned may have been superseded by a later, successful one.
      OR: [{ premiumUntil: null }, { premiumUntil: { lt: new Date() } }],
    },
    select: { id: true, email: true, trialStartedAt: true },
    take: 200,
  });
  if (!candidates.length) return 0;

  let sent = 0;
  for (const u of candidates) {
    try {
      // Only offer the trial framing if this account genuinely hasn't used one
      // yet — otherwise state the plain price, never a trial that no longer applies.
      const trialDays = premiumTrialEnabled() && !u.trialStartedAt ? PREMIUM_TRIAL_DAYS : 0;
      if (await sendCheckoutRecoveryEmail(u.email, trialDays, premiumFromLine())) sent++;
    } catch {
      /* best-effort — one failed send must not block the rest of the batch */
    }
    await prisma.user.update({ where: { id: u.id }, data: { checkoutRecoverySentAt: new Date() } }).catch(() => {});
  }
  return sent;
}

// Annual plan — inert until STRIPE_PREMIUM_ANNUAL_PRICE_ID is set (a yearly Stripe
// price). When present, the /premium page shows an annual option alongside monthly.
export const PREMIUM_ANNUAL_PRICE_ID = process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID ?? "";
export function premiumAnnualEnabled(): boolean {
  return premiumCheckoutEnabled() && Boolean(PREMIUM_ANNUAL_PRICE_ID);
}

// ── Live subscription detail, for a Premium user looking at their OWN account ──
export interface PremiumSubscriptionDetails {
  status: Stripe.Subscription.Status;
  interval: "month" | "year" | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
  tier: PremiumTier;
}

// Real, live Stripe read for the /premium page's "Your subscription" card —
// deliberately a SEPARATE query from api/premium/subscription/route.ts's, not a
// shared call: that route restricts to status:"active" on purpose (it drives the
// annual-switch nudge, which must never fire for someone mid-trial who hasn't
// paid yet), while a Premium user checking their own account is just as often
// trialing as paying, and both deserve their real status here — narrowing to
// "active" would make every trialist's subscription card come back empty.
//
// Returns null for anyone without a real Stripe subscription at all — an
// admin-granted comp (feedback/referral reward, isAdmin) has a premiumUntil date
// but no Stripe customer behind it, and the page falls back to stating just that
// date rather than inventing a plan/renewal status that doesn't exist.
export async function getPremiumSubscriptionDetails(stripeCustomerId: string | null | undefined): Promise<PremiumSubscriptionDetails | null> {
  if (!stripeCustomerId || !stripeEnabled()) return null;
  try {
    const subs = await stripe().subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 10,
      expand: ["data.items.data.price"],
    });
    // Several subscriptions can exist for one customer over time (a cancelled
    // one from before a resubscribe, say) — the live one, trialing or paying,
    // is what the account page is about; fall back to the most recent of
    // whatever's there rather than showing nothing.
    const sub = subs.data.find((s) => s.status === "active" || s.status === "trialing") ?? subs.data[0];
    if (!sub) return null;
    const price = sub.items.data[0]?.price as Stripe.Price | undefined;
    const interval = price?.recurring?.interval;
    return {
      status: sub.status,
      interval: interval === "month" || interval === "year" ? interval : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      tier: tierFromPriceId(price?.id),
    };
  } catch (e) {
    console.error("premium subscription detail read failed:", e);
    return null;
  }
}

// The portfolio tracker (value history, cost-basis P&L, benchmark, CSV export) is
// FREE for now to drive adoption — flip this to false to put it back behind
// Premium. Gates read `isPremium(user) || PORTFOLIO_FREE`, so re-gating is a
// one-line change with no other edits.
export const PORTFOLIO_FREE = true;

// ── Access tiers ──────────────────────────────────────────────────────────────
// The site has FOUR tiers (2026-09-11, Premium went two-tier), and every gate
// is one of three checks:
//
//   1. SIGNED OUT — the whole public site: search, browse, card/set/store pages,
//      the deck builder, trade calculator, box EV, sealed prices, the index and
//      movers. No wall anywhere.
//   2. ACCOUNT (free, `hasAccount`) — the above PLUS watchlists, price alerts,
//      and the portfolio.
//   3. PLUS (paid, `isPremium(user)` — the default `min` of "plus") — the above
//      plus no ads and the FULL LISTS: Deal Finder, Rising Cards, Rising Sealed
//      (free/account only ever see the top pick).
//   4. PREMIUM (paid, `isPremium(user, "premium")`) — everything in Plus, plus
//      the four pro tools: Value Finder, Bulk Pricer, Best Basket, Demand
//      Finder.
//
// `isPremium`'s `min` argument is the only thing that changed on any existing
// gate: a plain `isPremium(user)` still means "any paid tier", exactly as it
// did as a single-tier boolean, so every list gate and every ad component
// needed no edit at all. Only the four pro-tool gates pass "premium" as the
// second argument. `premiumTierOf(user)` returns the actual tier name (or
// null) for surfaces that need to SAY which one, rather than just gate on it.
//
// Best Basket moved BACK to tier 3, reversing the tier-2 experiment described in
// an earlier version of this comment (giving it away free to grow signups). It
// is Premium again, alongside the Bulk Pricer it briefly sat next to before —
// the two tools are allowed to sit on different tiers independently (see
// tests/access-tiers.test.ts), it just happens that they agree again now. Every
// surface that pitched Best Basket as a free-account perk (the header nav link,
// SignupPromoPopup's comparison, articles.ts's own copy, /premium's feature
// list) had to be updated in the same pass this comment was — see git history
// for the full file list, the same six-plus-files problem TierComparisonTable's
// own header comment warns about.
//
// Tier 2 replaced a "free week of Premium on signup" comp that handed new
// accounts the PAID tier and silently withdrew it a week later — that reasoning
// (a durable free payoff beats a comp that expires) still holds for
// watchlists/alerts/portfolio, which stay free regardless of Premium. The grant
// machinery for that WEEK-long comp (and its signup email) is gone rather than
// switched off by env, so a stale EARLY_PREMIUM_DAYS in a deploy environment
// can't quietly resurrect it.
//
// A shorter Premium preview was reintroduced after that, then removed outright
// on 2026-08-23 — see the "NO PREMIUM ON SIGNUP" note further down.
// The old comp's problem was duration, not the idea of a taste: a week is long
// enough to feel like the account's own tier, so losing it read as a downgrade.
// A day reads as exactly what it is — a preview — with tier 2's own perks above
// still the thing signing up permanently keeps.
export function hasAccount(user: { id: string } | null | undefined): boolean {
  return !!user;
}

// `min` defaults to "plus" — the historical, single-tier meaning of "is this
// account entitled at all" — so every existing call site (all 17 server gates
// bar the four pro tools, all six ad components) is unchanged by the tiering
// split. Only the four pro-tool gates pass `isPremium(user, "premium")`.
export function isPremium(
  user: { premiumUntil: Date | null; isAdmin?: boolean; premiumTier?: string | null } | null | undefined,
  min: PremiumTier = "plus",
): boolean {
  if (!user) return false;
  // Admins always count as Premium (top tier) — the team can use every paid
  // feature without holding a subscription. Otherwise it's an active paid
  // period AT OR ABOVE the requested tier.
  if (user.isAdmin) return true;
  const active = !!user.premiumUntil && user.premiumUntil.getTime() > Date.now();
  if (!active) return false;
  return TIER_RANK[normalizeTier(user.premiumTier)] >= TIER_RANK[min];
}

// The tier a user is actually on right now, or null if they aren't entitled at
// all. Admins read as "premium" (the top tier) even with no subscription —
// mirrors isPremium's own admin short-circuit. Used by /api/me and the
// account-detail card, which both need to NAME the tier, not just a boolean.
export function premiumTierOf(
  user: { premiumUntil: Date | null; isAdmin?: boolean; premiumTier?: string | null } | null | undefined,
): PremiumTier | null {
  if (!user) return null;
  if (user.isAdmin) return "premium";
  const active = !!user.premiumUntil && user.premiumUntil.getTime() > Date.now();
  return active ? normalizeTier(user.premiumTier) : null;
}

export async function getPremiumUntil(userId: string): Promise<Date | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { premiumUntil: true } });
  return u?.premiumUntil ?? null;
}

// ── Promotional Premium grants (feedback + referral + signup preview) ───────────
// These grant Premium WITHOUT Stripe (a comp), by extending premiumUntil directly.
// Feedback and referral are earned by an action after signup. The automatic
// signup-time grant that used to sit alongside them
// below is the one exception — a short preview handed out for merely registering,
// deliberately reintroduced; see its own comment and the access-tier note above
// for why this is safe against the failure mode the original, week-long version
// of this had.
//
// Day-granular, not month-granular: a full calendar month was a disproportionate
// reward for a single form submission or a single friend signing up (2026-08-31 —
// cut from 1 month to 1 week for feedback, 3 days for referral).
export const FEEDBACK_PREMIUM_DAYS = Math.max(0, Math.floor(Number(process.env.FEEDBACK_PREMIUM_DAYS ?? 7)));
// +3 days of Premium to the REFERRER for each friend who signs up via their link.
export const REFERRAL_PREMIUM_DAYS = Math.max(0, Math.floor(Number(process.env.REFERRAL_PREMIUM_DAYS ?? 3)));
export function feedbackPremiumActive(): boolean {
  return FEEDBACK_PREMIUM_DAYS > 0;
}
export function referralPremiumActive(): boolean {
  return REFERRAL_PREMIUM_DAYS > 0;
}

// NO PREMIUM ON SIGNUP. REMOVED 2026-08-23, DELIBERATELY AND ENTIRELY.
//
// New accounts used to receive an automatic 3-day Premium grant in the OAuth
// callback's isNew branch (SIGNUP_PREMIUM_DAYS, env-overridable). The whole
// mechanism is gone: the constant, the grant call, and the pitches on /login,
// AuthForm and /premium.
//
// DELETED RATHER THAN DEFAULTED TO ZERO, on purpose. SIGNUP_PREMIUM_DAYS read
// from the environment, so a lingering SIGNUP_PREMIUM_DAYS=3 in Vercel would
// have kept granting silently while the code said the feature was off — the
// failure would be invisible until someone audited premiumUntil against
// Stripe. With no constant to read, no environment can turn it back on.
//
// What a new account still gets is the free ACCOUNT tier — watchlist, price
// alerts, portfolio — which is permanent and is the durable reason to sign up.
// Premium is now reached only by: the card-gated Stripe trial
// (PREMIUM_TRIAL_DAYS), checkout, feedback, or a referral.


function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// Extend a user's Premium by `months`, STACKING onto any current future period (so a
// reward always adds time; it never shortens an existing/paid subscription). Returns
// the new premiumUntil.
//
// `tier` defaults to "premium" (every comp path predates tiering and should keep
// granting full access). The tier is written ONLY when this grant is creating
// access from nothing (no active premiumUntil) — an extension of an existing
// paid period must never change what tier that period already is, or a 7-day
// feedback comp could flip a paying Plus subscriber to Premium and then flip
// back on their next renewal.
export async function grantPremiumMonths(userId: string, months: number, tier: PremiumTier = "premium"): Promise<Date | null> {
  if (months <= 0) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { premiumUntil: true } });
  if (!u) return null;
  const now = new Date();
  const hadActive = !!u.premiumUntil && u.premiumUntil > now;
  const base = hadActive ? u.premiumUntil! : now;
  const until = addMonths(base, months);
  await prisma.user.update({
    where: { id: userId },
    data: { premiumUntil: until, ...(hadActive ? {} : { premiumTier: tier }) },
  });
  return until;
}

// Same as grantPremiumMonths, but day-granular, for any comp whose natural unit is
// days rather than calendar months (support goodwill, a short campaign). See
// grantPremiumMonths for why `tier` only applies when there's no active period.
export async function grantPremiumDays(userId: string, days: number, tier: PremiumTier = "premium"): Promise<Date | null> {
  if (days <= 0) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { premiumUntil: true } });
  if (!u) return null;
  const now = new Date();
  const hadActive = !!u.premiumUntil && u.premiumUntil > now;
  const base = hadActive ? u.premiumUntil! : now;
  const until = addDays(base, days);
  await prisma.user.update({
    where: { id: userId },
    data: { premiumUntil: until, ...(hadActive ? {} : { premiumTier: tier }) },
  });
  return until;
}

// Synthetic seed accounts (local dev-reset personas + the marketplace test buyer) —
// never real users, so they're excluded from real-user counts and reporting.
export function isSeedEmail(email: string): boolean {
  return email.endsWith("@tcgempire.au") || email === "test@test.com";
}
export const NOT_SEED_WHERE = {
  NOT: {
    OR: [{ email: { endsWith: "@tcgempire.au" } }, { email: { equals: "test@test.com" } }],
  },
};

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
  costBasisCents: number | null; // per-copy cost (averaged when the row stores a total); null = unknown
  investedCents: number | null; // what the owner actually paid for this row; null = unknown
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
// a daily value-over-time series rebuilt from PriceHistory (carry-forward per
// card, weighted by owned quantity × condition).
export async function getPortfolio(userId: string, country: Country, windowDays = 90): Promise<Portfolio> {
  const rows = await prisma.collectionCard.findMany({
    where: { userId },
    include: {
      card: { select: cardTileSelect(country) },
    },
  });

  // Defensive: CollectionCard.card is a required relation, but a stale cardId
  // that no longer resolves to a real Card row (a database restore/migration
  // that didn't carry every row across in lockstep, or a card removed from
  // the catalogue some other way) makes Prisma's `include` come back with a
  // row whose `card` is actually missing at runtime despite the non-null
  // type. One bad row must not 500 the entire portfolio for every OTHER
  // holding the visitor has — drop it and keep going.
  const validRows = rows.filter((r) => r.card != null);

  const cardIds = [...new Set(validRows.map((r) => r.cardId))].sort();
  // Best-effort: a history-DB hiccup should cost the value chart and d7/d30
  // deltas, not the whole portfolio page.
  const hist = cardIds.length ? await portfolioHistory(cardIds, country, windowDays).catch(() => []) : [];

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

  const holdings: Holding[] = validRows
    .map((r) => {
      const market = pickPrice(r.card, country);
      const unit = market != null ? Math.round(market * condMult(r.condition)) : null;
      const valueCents = (unit ?? 0) * r.quantity;
      // NEVER `cost * quantity` BY HAND. A row's recorded figure is per-copy or
      // the whole row's outlay depending on costBasisIsTotal — see
      // lib/collection-cost.ts, and the feedback that made the flag exist.
      const investedRow = investedCents(r);
      const cost = unitCostCents(r);
      // P&L only when we know both what they paid AND the current value.
      const plCents = investedRow != null && unit != null ? valueCents - investedRow : null;
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
        investedCents: investedRow,
        plCents,
        plPct,
      };
    })
    .sort((a, b) => b.valueCents - a.valueCents);

  // Aggregate P&L over holdings that have both a cost and a current price.
  const costed = holdings.filter((h) => h.investedCents != null && h.unitCents != null);
  const anyCost = holdings.some((h) => h.investedCents != null);
  const pnl: PnL | null = anyCost
    ? (() => {
        // Each holding already carries what was PAID for it, flag applied. The
        // old `costBasisCents * quantity` here was the second place that
        // multiply was written out, and a row recording a total would have been
        // counted quantity times over.
        const invested = costed.reduce((s, h) => s + (h.investedCents ?? 0), 0);
        const valueCents = costed.reduce((s, h) => s + h.valueCents, 0);
        const plCents = valueCents - invested;
        return {
          investedCents: invested,
          valueCents,
          plCents,
          plPct: invested > 0 ? Math.round((plCents / invested) * 1000) / 10 : null,
          costedRows: holdings.filter((h) => h.investedCents != null).length,
        };
      })()
    : null;

  // Daily total series (carry-forward per card so gaps don't crater the line).
  const days = [...daySet].sort((a, b) => a - b);
  const carried = new Map<string, number>();
  const series: PricePoint[] = [];
  for (const t of days) {
    let total = 0;
    for (const r of validRows) {
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

  // Market benchmark for the same windows (best-effort — never block the page).
  const idx = await getMarketIndex(country).catch(() => null);
  const index = idx ? { d7: idx.d7, d30: idx.d30 } : null;

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
