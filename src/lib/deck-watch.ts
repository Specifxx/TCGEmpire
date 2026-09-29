import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { COUNTRIES, currencyOf, priceField, type Country } from "./country";
import { parseDeckList, resolveDeckLines, DECK_LINE_CAP } from "./deck";
import { clampQty } from "./basket-request";
import { optimizeBasket, type BasketCard, type BasketPlan } from "./basket";
import { loadStoreListings } from "./basket-server";
import { basketStoresFor, postageOptionsFrom } from "./shipping";
import { isPremium, premiumTierOf, type EntitlementUser } from "./premium";
import { isAdminEmail, ADMIN_EMAILS } from "./admin-emails";
import { deckWatchLimit, DECK_WATCH_LIMIT } from "./alert-limits";
import { ALERT_BUDGET_WINDOW_MS, PAID_SEND_CAP, alertDailyBudget, liveWatermark } from "./price-alerts";
import { recentlyEmailedAddresses, RunBudget, WATCH_EMAILS_PER_ADDRESS } from "./alert-budget";
import { pausedAddresses } from "./alert-mute";
import { watchActionLinks } from "./alert-actions";
import { sendDeckWatchEmail as sendDeckWatchEmailImpl, type DeckWatchItem, type DeckWatchKind } from "./watch-emails";
import { notify } from "./notifications";
import { formatMoney } from "./format";
import { clampDeckTargetCents } from "./deck-watch-pure";
import { DEFAULT_MIN_CONDITION, isMinCondition, storedMinCondition, toStoredMinCondition, type MinCondition } from "./basket-condition";

// The client-safe pieces (friendlyTargetCents, clampDeckTargetCents and the
// DECK_TARGET_* bounds) live in ./deck-watch-pure so a "use client" component
// can import them without pulling prisma and node:crypto into the browser
// bundle (tests/client-imports.test.ts). Re-exported here for the server side.
export { friendlyTargetCents, clampDeckTargetCents, canWatchPricedResult, DECK_TARGET_MIN_CENTS, DECK_TARGET_MAX_CENTS } from "./deck-watch-pure";

// ─────────────────────────────────────────────────────────────────────────────
// DECK PRICE WATCH — Premium (2026-09-29, DECISIONS.md "Premium works while
// you're away").
// ─────────────────────────────────────────────────────────────────────────────
// A member saves a list (the text /deck and Best Basket take) with, optionally,
// a delivered-price target. After every price import the PAID alert run
// prices it EXACTLY as Best Basket would — the same resolver, the same
// in-stock store listings, the same optimiser and the same measured postage
// for the delivery the member saved (region, tracked-only) — and stores the
// delivered total. Then:
//   • deck_target  the total is at or under the target, and that is news: we
//                  have never emailed this watch, or the total is at least
//                  TARGET_REFIRE_PCT under the total we last emailed, or that
//                  email is older than WATERMARK_TTL_MS (30 days).
//   • deck_drop    no target, and the total is a MATERIAL drop (≥ DROP_MIN_PCT
//                  and ≥ DROP_MIN_CENTS) under the reference: the total we
//                  last emailed while that is under 30 days old, else the
//                  total the last run saw.
// Only a plan that covers EVERY copy on the list can fire: a total that
// silently leaves a card out is not "the deck for $X". The total is stored
// either way, and the email says what a plan covers.
//
// Only an owner who is entitled (isPremium(user, "premium")) is priced or
// emailed. A lapsed owner's rows are skipped untouched — kept, never deleted,
// live again on resubscribing. Snoozed watches and paused addresses
// (AlertMute) advance their baseline without an email, so nothing backs up.
//
// MINIMUM CONDITION (2026-09-29, lib/basket-condition.ts): a watch may carry a
// floor ("nm" or "lp"; null = any, which is every row saved before it). The run
// hands it to loadStoreListings, the same filter Best Basket's page applies, so
// the email and the page agree on the total. A floor that leaves a card
// uncovered makes the plan incomplete, so the watch stays quiet rather than
// naming a total that leaves a card out or fills it with a played copy.
// Changing a watch's floor re-baselines it (updateDeckWatch clears the last
// total and the emailed watermark): the new floor's total is recorded by the
// next run and can never read as a "drop" from the old floor's total.
//
// EGRESS: one bounded RetailerPrice read per watch (≤ DECK_LINE_CAP card ids,
// the narrow select in loadStoreListings), only for entitled owners, only in
// the cron. DECK_WATCH_LIMIT per account bounds the run.
//
// BUDGET: a NEW address opens a slot in the shared ALERT_DAILY_BUDGET
// (lib/alert-budget.ts) and counts against the paid run's shared PAID_SEND_CAP;
// one address gets at most WATCH_EMAILS_PER_ADDRESS emails from this pass (a
// deck watch is one email per watch, not a digest). What does not fit is
// deferred with its baseline held, so it re-detects at the next run.

/** After a target fires, it fires again only this % further down. */
export const DECK_TARGET_REFIRE_PCT = 5;
/** A material drop of a delivered total: at least this % of the reference… */
export const DECK_DROP_MIN_PCT = 5;
/** …and at least this many minor units (one whole dollar/pound). */
export const DECK_DROP_MIN_CENTS = 100;
/** Watches read per run — far past DECK_WATCH_LIMIT × any real member count. */
export const DECK_WATCH_READ_CAP = 2000;
/** Longest saved list, in characters (the Best Basket request cap). */
export const DECK_WATCH_TEXT_MAX = 20_000;
export const DECK_WATCH_NAME_MAX = 80;

// ── The pure rules ───────────────────────────────────────────────────────────

export function isDeckMaterialDrop(refCents: number, currentCents: number): boolean {
  return refCents - currentCents >= Math.max(Math.ceil((refCents * DECK_DROP_MIN_PCT) / 100), DECK_DROP_MIN_CENTS);
}

/** What a move is measured from: the emailed total while live, else the last total. */
export function deckReference(opts: { lastTotalCents: number | null; lastEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): {
  cents: number | null;
  basis: "emailed" | "last" | null;
} {
  const live = liveWatermark({ lowestEmailedCents: opts.lastEmailedCents, lastNotifiedAt: opts.lastNotifiedAt, now: opts.now });
  if (live != null) return { cents: live, basis: "emailed" };
  if (opts.lastTotalCents != null) return { cents: opts.lastTotalCents, basis: "last" };
  return { cents: null, basis: null };
}

/** The target trigger: at or under the target, and news against the emailed watermark. */
export function shouldEmailDeckTarget(opts: { totalCents: number; targetCents: number | null; lastEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): boolean {
  const { totalCents, targetCents } = opts;
  if (targetCents == null || totalCents > targetCents) return false;
  const live = liveWatermark({ lowestEmailedCents: opts.lastEmailedCents, lastNotifiedAt: opts.lastNotifiedAt, now: opts.now });
  if (live == null) return true; // never emailed, or the last email has lapsed (30 days)
  return totalCents <= Math.floor((live * (100 - DECK_TARGET_REFIRE_PCT)) / 100);
}

/** The drop trigger (no target): a material drop under the reference. */
export function shouldEmailDeckDrop(opts: { totalCents: number; targetCents: number | null; lastTotalCents: number | null; lastEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): boolean {
  if (opts.targetCents != null) return false;
  const ref = deckReference(opts).cents;
  return ref != null && isDeckMaterialDrop(ref, opts.totalCents);
}

const isSupportedMarket = (m: string): m is Country => Object.prototype.hasOwnProperty.call(COUNTRIES, m);

// ── Pricing one list, the Best Basket way ────────────────────────────────────

export type DeckPricingDb = {
  card: Pick<typeof prisma.card, "findMany">;
  retailerPrice: Pick<typeof prisma.retailerPrice, "findMany">;
};

export interface DeckPricing {
  plan: BasketPlan;
  requestedCopies: number;
  unmatchedLines: number;
  complete: boolean; // every requested copy is bought by the plan
}

/**
 * Resolve and price a saved list for a market and the saved delivery, with
 * Best Basket's own pieces (lib/deck.ts, lib/basket-server.ts, lib/shipping.ts,
 * lib/basket.ts). null when nothing on the list resolved to a card. Throws on
 * a failed read — a failed listing read must never price as "nothing in
 * stock".
 */
export async function priceDeckList(
  db: DeckPricingDb,
  opts: { listText: string; market: Country; region: string | null; trackedOnly: boolean | null; minCondition?: MinCondition },
): Promise<DeckPricing | null> {
  const lines = parseDeckList(opts.listText, { plainNames: true }).slice(0, DECK_LINE_CAP);
  if (!lines.length) return null;
  const orderBy = [{ [priceField(opts.market)]: { sort: "asc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput];
  const resolved = await resolveDeckLines(lines, (args) =>
    db.card.findMany({
      ...args,
      select: { id: true, name: true, slug: true, nameNormalized: true, setCode: true, collectorNumber: true, variant: true, isPromo: true },
      orderBy,
    }),
  );
  const wanted = new Map<string, number>();
  const info = new Map<string, { name: string; slug: string | null; setCode: string; collectorNumber: string }>();
  for (const m of resolved.matched) {
    wanted.set(m.card.id, clampQty((wanted.get(m.card.id) ?? 0) + m.line.qty));
    info.set(m.card.id, m.card);
  }
  if (!wanted.size) return null;
  const stores = basketStoresFor(opts.market, postageOptionsFrom(opts.market, opts.region, opts.trackedOnly ? "1" : null));
  const listings = await loadStoreListings([...wanted.keys()], opts.market, Object.keys(stores), db, opts.minCondition ?? "any");
  const cards: BasketCard[] = [...wanted].map(([cardId, qty]) => {
    const c = info.get(cardId)!;
    return { cardId, name: c.name, slug: c.slug, setCode: c.setCode, collectorNumber: c.collectorNumber, qty, listings: listings.get(cardId) ?? [] };
  });
  const plan = optimizeBasket(cards, stores);
  const requestedCopies = [...wanted.values()].reduce((n, q) => n + q, 0);
  return { plan, requestedCopies, unmatchedLines: resolved.unmatched.length, complete: plan.coveredCopies === requestedCopies && plan.coveredCopies > 0 };
}

// ── The run ──────────────────────────────────────────────────────────────────

export type DeckWatchDb = DeckPricingDb & {
  deckWatch: Pick<typeof prisma.deckWatch, "findMany" | "update">;
  priceAlert: Pick<typeof prisma.priceAlert, "groupBy">;
  sealedWatch: Pick<typeof prisma.sealedWatch, "groupBy">;
  alertMute: Pick<typeof prisma.alertMute, "findMany">;
  $transaction: typeof prisma.$transaction;
};

export interface DeckWatchRunDeps {
  db?: DeckWatchDb;
  now?: Date;
  sendDeckWatchEmail?: typeof sendDeckWatchEmailImpl;
  notifyUsers?: boolean;
  dailyBudget?: number;
  // New addresses this pass may open: what is left of PAID_SEND_CAP after the
  // card run (the paid route shares one cap across its three passes).
  sendCap?: number;
}

export interface DeckWatchRunSummary {
  watches: number; // rows read (entitled owners, by the query)
  lapsed: number; // rows whose owner is not entitled now — skipped untouched
  legacyMarket: number; // rows on an unsupported market — skipped
  priced: number; // lists that got a delivered total this run
  unpriced: number; // lists where nothing resolved, or nothing was in stock
  incomplete: number; // priced, but not every copy is buyable — no trigger
  targets: number; // deck_target worth telling
  drops: number; // deck_drop worth telling
  snoozed: number;
  paused: number;
  deferred: number;
  budgetDeferred: number;
  addressDeferred: number; // held past WATCH_EMAILS_PER_ADDRESS emails to one address this run
  newAddresses: number; // distinct addresses this pass opened (counts against PAID_SEND_CAP)
  emails: number;
  updated: number;
  held: number;
}

type Patch = { lastTotalCents?: number | null; lastCheckedAt?: Date; lastEmailedCents?: number; lastNotifiedAt?: Date };

export async function runDeckWatches(deps: DeckWatchRunDeps = {}): Promise<DeckWatchRunSummary> {
  const db = deps.db ?? (prisma as unknown as DeckWatchDb);
  const send = deps.sendDeckWatchEmail ?? sendDeckWatchEmailImpl;
  const now = deps.now ?? new Date();
  const summary: DeckWatchRunSummary = {
    watches: 0, lapsed: 0, legacyMarket: 0, priced: 0, unpriced: 0, incomplete: 0, targets: 0, drops: 0,
    snoozed: 0, paused: 0, deferred: 0, budgetDeferred: 0, addressDeferred: 0, newAddresses: 0, emails: 0, updated: 0, held: 0,
  };

  // Only rows whose owner is inside a paid period or is an admin (the same
  // trim as the paid card run); isPremium below is the real check.
  const rows = await db.deckWatch.findMany({
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
    take: DECK_WATCH_READ_CAP,
    select: {
      id: true,
      userId: true,
      market: true,
      name: true,
      listText: true,
      region: true,
      trackedOnly: true,
      minCondition: true,
      targetCents: true,
      lastTotalCents: true,
      lastEmailedCents: true,
      lastNotifiedAt: true,
      snoozedUntil: true,
      createdAt: true,
      user: { select: { email: true, isAdmin: true, premiumUntil: true, premiumTier: true, premiumTierFloor: true } },
    },
  });
  summary.watches = rows.length;

  const always = new Map<string, Patch>();
  const base = new Map<string, Patch>();
  const heldIds = new Set<string>();
  const patch = (m: Map<string, Patch>, id: string, p: Patch) => m.set(id, { ...(m.get(id) ?? {}), ...p });

  interface Candidate {
    id: string;
    userId: string;
    email: string;
    item: DeckWatchItem;
    order: number;
  }
  const candidates: Candidate[] = [];

  // Per-account cap, oldest first: rows past deckWatchLimit are never priced
  // (the create route refuses them; this guards a later lowering of the cap).
  const perUser = new Map<string, number>();

  for (const [order, w] of rows.entries()) {
    const user: EntitlementUser = { ...w.user, isAdmin: w.user.isAdmin || isAdminEmail(w.user.email) };
    if (!isPremium(user, "premium")) {
      summary.lapsed++;
      continue;
    }
    const n = (perUser.get(w.userId) ?? 0) + 1;
    perUser.set(w.userId, n);
    if (n > deckWatchLimit(premiumTierOf(user))) continue;
    if (!isSupportedMarket(w.market)) {
      summary.legacyMarket++;
      continue;
    }
    const market: Country = w.market;
    // A failed read throws out of the whole pass: nothing below is written.
    const floor = storedMinCondition(w.minCondition);
    const priced = await priceDeckList(db, { listText: w.listText, market, region: w.region, trackedOnly: w.trackedOnly, minCondition: floor });
    patch(always, w.id, { lastCheckedAt: now });
    if (!priced || priced.plan.coveredCopies === 0) {
      summary.unpriced++;
      continue;
    }
    summary.priced++;
    const total = priced.plan.totalCents;
    if (total !== w.lastTotalCents) patch(base, w.id, { lastTotalCents: total });
    if (!priced.complete) {
      summary.incomplete++;
      continue;
    }
    const refOpts = { lastTotalCents: w.lastTotalCents, lastEmailedCents: w.lastEmailedCents, lastNotifiedAt: w.lastNotifiedAt, now };
    let kind: DeckWatchKind | null = null;
    if (shouldEmailDeckTarget({ totalCents: total, targetCents: w.targetCents, lastEmailedCents: w.lastEmailedCents, lastNotifiedAt: w.lastNotifiedAt, now })) {
      kind = "deck_target";
      summary.targets++;
    } else if (shouldEmailDeckDrop({ totalCents: total, targetCents: w.targetCents, ...refOpts })) {
      kind = "deck_drop";
      summary.drops++;
    }
    if (!kind) continue;
    if (w.snoozedUntil != null && w.snoozedUntil.getTime() > now.getTime()) {
      summary.snoozed++;
      continue;
    }
    const ref = deckReference(refOpts);
    let actions: DeckWatchItem["actions"] = null;
    try {
      actions = watchActionLinks({ kind: "deck", id: w.id, now });
    } catch {
      actions = null;
    }
    candidates.push({
      id: w.id,
      userId: w.userId,
      email: w.user.email,
      order,
      item: {
        kind,
        watchId: w.id,
        name: w.name,
        market,
        currency: currencyOf(market),
        totalCents: total,
        itemsCents: priced.plan.itemsCents,
        shippingCents: priced.plan.shippingCents + priced.plan.topUpCents,
        storeCount: priced.plan.storeCount,
        coveredCopies: priced.plan.coveredCopies,
        requestedCopies: priced.requestedCopies,
        targetCents: w.targetCents,
        referenceCents: ref.cents,
        referenceBasis: ref.basis,
        minCondition: floor,
        stores: priced.plan.stores.slice(0, 3).map((s) => ({ name: s.name, subtotalCents: s.subtotalCents, shippingCents: s.shippingCents, items: s.items })),
        checkedAt: now,
        actions,
      },
    });
  }

  // Paused addresses (AlertMute): dropped like a snooze — baseline advances.
  // A failed read throws (emailing someone who asked for none is worse).
  const paused = candidates.length ? await pausedAddresses(db, [...new Set(candidates.map((c) => c.email))]) : new Set<string>();
  const live = candidates.filter((c) => {
    if (!paused.has(c.email)) return true;
    summary.paused++;
    return false;
  });

  // The shared budget: targets first, then oldest watch first.
  live.sort((x, y) => (x.item.kind === y.item.kind ? x.order - y.order : x.item.kind === "deck_target" ? -1 : 1));
  const recent = live.length ? await recentlyEmailedAddresses(db, now, ALERT_BUDGET_WINDOW_MS) : new Set<string>();
  const budgetTotal = deps.dailyBudget ?? alertDailyBudget();
  const budget = new RunBudget(recent, Math.max(0, budgetTotal - recent.size), deps.sendCap ?? PAID_SEND_CAP, WATCH_EMAILS_PER_ADDRESS);
  const notified = new Set<string>();
  for (const c of live) {
    const why = budget.reason(c.email);
    if (why) {
      summary.deferred++;
      if (why === "budget") summary.budgetDeferred++;
      if (why === "address") summary.addressDeferred++;
      heldIds.add(c.id);
      continue;
    }
    budget.open(c.email);
    const ok = await send(c.email, c.item);
    if (!ok) {
      heldIds.add(c.id);
      continue;
    }
    summary.emails++;
    notified.add(c.id);
    if (deps.notifyUsers !== false) {
      const money = formatMoney(c.item.totalCents, c.item.currency);
      const title = c.item.kind === "deck_target" ? `${c.item.name} is under your target: ${money} delivered` : `${c.item.name} is now ${money} delivered`;
      void notify(c.userId, "deck_watch", title, "Open Best Basket for the store-by-store plan.", "/watching").catch(() => {});
    }
  }

  // Persist: a held row keeps its baseline (lastTotalCents) so it re-detects.
  const writes: { id: string; data: Patch }[] = [];
  for (const w of rows) {
    const held = heldIds.has(w.id);
    const data: Patch = { ...(always.get(w.id) ?? {}) };
    if (!held) Object.assign(data, base.get(w.id) ?? {});
    if (notified.has(w.id)) {
      const item = live.find((c) => c.id === w.id)!.item;
      data.lastEmailedCents = item.totalCents;
      data.lastNotifiedAt = now;
    }
    if (Object.keys(data).length) writes.push({ id: w.id, data });
  }
  summary.held = heldIds.size;
  summary.newAddresses = budget.newAddresses;
  summary.updated = writes.length;
  if (writes.length) await db.$transaction(writes.map((x) => db.deckWatch.update({ where: { id: x.id }, data: x.data })));
  return summary;
}

// ── The routes' logic (app/api/watches/deck) ─────────────────────────────────

export type DeckWatchRouteDb = {
  deckWatch: Pick<typeof prisma.deckWatch, "count" | "create" | "findFirst" | "findMany" | "update" | "deleteMany">;
};

export interface WatchRouteResult {
  status: number;
  body: Record<string, unknown>;
}

export type RouteUser = EntitlementUser & { id: string; email: string };

const DECK_WATCH_SELECT = {
  id: true,
  market: true,
  name: true,
  listText: true,
  region: true,
  trackedOnly: true,
  minCondition: true,
  targetCents: true,
  lastTotalCents: true,
  lastCheckedAt: true,
  lastEmailedCents: true,
  lastNotifiedAt: true,
  snoozedUntil: true,
  createdAt: true,
} as const;

function notPremium(): WatchRouteResult {
  return { status: 402, body: { error: "Deck price watches are part of Premium.", code: "tier_required", tier: "premium" } };
}

const asInt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

/** POST: save a list to watch. 402 without Premium; 409 at DECK_WATCH_LIMIT. */
export async function createDeckWatch(db: DeckWatchRouteDb, user: RouteUser, raw: unknown, market: Country): Promise<WatchRouteResult> {
  if (!isPremium(user, "premium")) return notPremium();
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const listText = typeof body.listText === "string" ? body.listText.slice(0, DECK_WATCH_TEXT_MAX).trim() : "";
  const lines = parseDeckList(listText, { plainNames: true });
  if (!lines.length) return { status: 400, body: { error: "Paste a list with at least one card first." } };
  const rawName = typeof body.name === "string" ? body.name.trim().slice(0, DECK_WATCH_NAME_MAX) : "";
  const name = rawName || `${lines[0]!.name || "Deck"}${lines.length > 1 ? ` +${lines.length - 1}` : ""}`.slice(0, DECK_WATCH_NAME_MAX);
  const targetRaw = body.targetCents == null ? null : asInt(body.targetCents);
  if (body.targetCents != null && targetRaw == null) return { status: 400, body: { error: "The target must be a whole number of cents." } };
  const targetCents = targetRaw == null ? null : clampDeckTargetCents(targetRaw);
  const region = typeof body.region === "string" && /^[a-z0-9-]{1,32}$/i.test(body.region) ? body.region : null;
  const trackedOnly = body.trackedOnly === true;
  // A NEW watch defaults to "LP or better" (owner's default for new sessions and
  // watches, 2026-09-29); "any" (or null) is one tap away and stored as null.
  if (body.minCondition != null && !isMinCondition(body.minCondition)) {
    return { status: 400, body: { error: "The minimum condition must be nm, lp or any." } };
  }
  const floor: MinCondition = !("minCondition" in body) ? DEFAULT_MIN_CONDITION : isMinCondition(body.minCondition) ? body.minCondition : "any";
  const minCondition = toStoredMinCondition(floor);
  const count = await db.deckWatch.count({ where: { userId: user.id } });
  if (count >= DECK_WATCH_LIMIT) {
    return { status: 409, body: { error: `Premium watches up to ${DECK_WATCH_LIMIT} lists. Stop one on your watchlist to add this.`, code: "limit", limit: DECK_WATCH_LIMIT, count } };
  }
  const watch = await db.deckWatch.create({
    data: { userId: user.id, market, name, listText, region, trackedOnly, targetCents, minCondition },
    select: DECK_WATCH_SELECT,
  });
  return { status: 201, body: { ok: true, watch } };
}

/** GET: this account's deck watches, oldest first. Nothing to hide from a lapsed owner. */
export async function listDeckWatches(db: DeckWatchRouteDb, user: RouteUser): Promise<WatchRouteResult> {
  const watches = await db.deckWatch.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, take: DECK_WATCH_LIMIT * 2, select: DECK_WATCH_SELECT });
  return { status: 200, body: { watches, limit: DECK_WATCH_LIMIT, entitled: isPremium(user, "premium") } };
}

/**
 * PATCH: change the target (re-arms it), rename, or snooze / unsnooze. The
 * owner only (the row lookup is `where: { id, userId }`). Editing the target or
 * the name is Premium's; SNOOZING needs no entitlement, so a lapsed owner can
 * quiet a watch that would resume when they resubscribe.
 */
export async function updateDeckWatch(db: DeckWatchRouteDb, user: RouteUser, id: string, raw: unknown, now: Date = new Date()): Promise<WatchRouteResult> {
  const edits = raw && typeof raw === "object" && ("targetCents" in raw || "minCondition" in raw || (typeof (raw as { name?: unknown }).name === "string" && !!(raw as { name: string }).name.trim()));
  if (edits && !isPremium(user, "premium")) return notPremium();
  const row = await db.deckWatch.findFirst({ where: { id, userId: user.id }, select: { id: true, minCondition: true } });
  if (!row) return { status: 404, body: { error: "That watch isn't on your list." } };
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const data: Prisma.DeckWatchUpdateInput = {};
  if ("targetCents" in body) {
    if (body.targetCents == null) data.targetCents = null;
    else {
      const t = asInt(body.targetCents);
      if (t == null) return { status: 400, body: { error: "The target must be a whole number of cents." } };
      data.targetCents = clampDeckTargetCents(t);
    }
    // A changed target is armed again: the next run judges it afresh.
    data.lastEmailedCents = null;
  }
  if ("minCondition" in body) {
    if (body.minCondition != null && !isMinCondition(body.minCondition)) return { status: 400, body: { error: "The minimum condition must be nm, lp or any." } };
    const next = toStoredMinCondition(isMinCondition(body.minCondition) ? body.minCondition : "any");
    data.minCondition = next;
    if (next !== (row.minCondition ?? null)) {
      // A changed floor is a different list of prices: re-baseline. The next run
      // records the new floor's total, and nothing it finds can read as a drop
      // from the old floor's total (a target is judged afresh, as a changed
      // target is above).
      data.lastTotalCents = null;
      data.lastEmailedCents = null;
    }
  }
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, DECK_WATCH_NAME_MAX);
  if ("snoozeDays" in body) {
    const d = asInt(body.snoozeDays);
    if (d == null || d < 0 || d > 365) return { status: 400, body: { error: "Snooze for up to a year." } };
    data.snoozedUntil = d === 0 ? null : new Date(now.getTime() + d * 86_400_000);
  }
  if (!Object.keys(data).length) return { status: 400, body: { error: "Nothing to change." } };
  const watch = await db.deckWatch.update({ where: { id: row.id }, data, select: DECK_WATCH_SELECT });
  return { status: 200, body: { ok: true, watch } };
}

/**
 * DELETE: stop watching. The owner only, whatever the tier (stopping a watch
 * needs no entitlement, and a lapsed member's rows are otherwise invisible and
 * unremovable); idempotent.
 */
export async function deleteDeckWatch(db: DeckWatchRouteDb, user: RouteUser, id: string): Promise<WatchRouteResult> {
  const res = await db.deckWatch.deleteMany({ where: { id, userId: user.id } });
  return { status: res.count ? 200 : 404, body: { ok: res.count > 0, removed: res.count } };
}
