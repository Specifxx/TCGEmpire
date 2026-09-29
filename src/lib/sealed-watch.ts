import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { COUNTRIES, currencyOf, type Country } from "./country";
import { isPremium, premiumTierOf, type EntitlementUser } from "./premium";
import { isAdminEmail, ADMIN_EMAILS } from "./admin-emails";
import { sealedWatchLimit, sealedWatchCeiling, SEALED_WATCH_LIMIT_PLUS, SEALED_WATCH_HARD_CAP } from "./alert-limits";
import { ALERT_BUDGET_WINDOW_MS, PAID_SEND_CAP, alertDailyBudget, isMaterialDrop, liveWatermark } from "./price-alerts";
import { recentlyEmailedAddresses, RunBudget, WATCH_EMAILS_PER_ADDRESS } from "./alert-budget";
import { pausedAddresses } from "./alert-mute";
import { watchActionLinks } from "./alert-actions";
import { headlineOffer, offerStock, soldOutEverywhere } from "./sealed-offers";
import { isAtMsrp, msrpCents } from "./msrp";
import { getPreorderGroups, getSealedGroups, type SealedGroup } from "./sealed-import";
import { affiliateUrl } from "./affiliate";
import { sendSealedWatchEmail as sendSealedWatchEmailImpl, type SealedWatchItem, type SealedWatchKind } from "./watch-emails";
import { notify } from "./notifications";
import { formatMoney } from "./format";
import { clampTargetCents } from "./target-price";

// ─────────────────────────────────────────────────────────────────────────────
// SEALED WATCHES — Plus and Premium (2026-09-29, DECISIONS.md "Premium works
// while you're away").
// ─────────────────────────────────────────────────────────────────────────────
// One sealed product (a SealedListing groupKey, as /sealed groups them) in one
// market. After the sealed import the PAID alert run reads the self-cached
// sealed groups DIRECTLY — getSealedGroups(market), never wrapped, never inside
// an unstable_cache callback (tests/nested-cache.test.ts) — and for each
// entitled watch looks at the REAL-STORE listings: a store or CardTrader,
// never an eBay row (retailer "ebay*") or TCGplayer's market-price reference row
// (isRealSealedStore). The three
// offer states are lib/sealed-offers.ts's: open, sold out, unknown (a row not
// read for 72h). Triggers, in precedence order, each at most once per
// SEALED_WATCH_COOLDOWN_MS per watch:
//   • sealed_target   the cheapest open real-store price is at or under the
//                     member's target and news: never emailed, or at least
//                     SEALED_TARGET_REFIRE_PCT under the price we last emailed,
//                     or that email is older than WATERMARK_TTL_MS.
//   • sealed_restock  the product was sold out at EVERY tracked real store
//                     (soldOutEverywhere, on fresh reads) for at least
//                     SEALED_RESTOCK_MIN_SOLDOUT_MS, and a real store has it now.
//   • sealed_rrp      the cheapest open price is at or under RRP (lib/msrp.ts
//                     isAtMsrp, 2% tolerance), and it is news: the first time,
//                     or after a run saw it over RRP (lastAtRrp).
//   • sealed_drop     no target, and the price is a material drop (≥5% and
//                     ≥ SEALED_DROP_MIN_CENTS) under the reference: the price
//                     we last emailed while live, else the last price.
// All-unknown listings decide nothing (a feed outage is not a sell-out).
// Lapsed owners are skipped untouched; Plus rows past SEALED_WATCH_LIMIT_PLUS
// (oldest first) are kept but not evaluated. Snoozed watches and paused
// addresses advance their baseline with no email.

export const SEALED_RESTOCK_MIN_SOLDOUT_MS = 20 * 60 * 60 * 1000;
export const SEALED_WATCH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const SEALED_TARGET_REFIRE_PCT = 5;
export const SEALED_DROP_MIN_CENTS = 100;
export const SEALED_WATCH_READ_CAP = 5000;

export type { SealedWatchKind };

/**
 * A real store's listing: never eBay (retailer "ebay", "ebay_us", …), and never
 * the TCGplayer row. The importer writes that row with inStock hard-coded true
 * and falls back to TCGplayer's MARKET price when it has no listing
 * (lib/sealed-import.ts refreshTcgplayerSealed), so it is a reference, not
 * stock: counting it would make every US product TCGplayer catalogues look
 * "open" forever (no restock could ever fire) and would email a market-price
 * reference as an in-stock price. The importer is not ours to change, so the
 * watch code leaves the row out. /sealed itself still shows it.
 */
export const isRealSealedStore = (retailer: string) => !/^ebay(_|$)/i.test(retailer) && retailer.toLowerCase() !== "tcgplayer";

export interface SealedOfferState {
  open: SealedGroup["listings"][number] | null; // the cheapest open real-store listing
  openStores: number;
  soldOutEverywhere: boolean; // every real store, fresh, sold out
  unknown: boolean; // no real-store listing decides anything (none, or all stale)
}

export function sealedOfferState(listings: SealedGroup["listings"], now: Date): SealedOfferState {
  const real = listings.filter((l) => isRealSealedStore(l.retailer));
  const t = now.getTime();
  const open = headlineOffer(real, t);
  const openStores = new Set(real.filter((l) => offerStock(l, t) === "open").map((l) => l.retailer)).size;
  const unknown = real.length === 0 || real.every((l) => offerStock(l, t) === "unknown");
  return { open, openStores, soldOutEverywhere: soldOutEverywhere(real, t), unknown };
}

export function shouldEmailSealedTarget(opts: { priceCents: number; targetCents: number | null; lastEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): boolean {
  if (opts.targetCents == null || opts.priceCents > opts.targetCents) return false;
  const live = liveWatermark({ lowestEmailedCents: opts.lastEmailedCents, lastNotifiedAt: opts.lastNotifiedAt, now: opts.now });
  if (live == null) return true;
  return opts.priceCents <= Math.floor((live * (100 - SEALED_TARGET_REFIRE_PCT)) / 100);
}

export function isSealedRestock(opts: { soldOutAt: Date | null; now: Date }): boolean {
  return opts.soldOutAt != null && opts.now.getTime() - opts.soldOutAt.getTime() >= SEALED_RESTOCK_MIN_SOLDOUT_MS;
}

/** At or under RRP, and news: first time, or after being over RRP. */
export function shouldEmailSealedRrp(opts: { priceCents: number; productType: string; market: Country; lastAtRrp: boolean | null }): boolean {
  return isAtMsrp(opts.priceCents, opts.productType, opts.market) && opts.lastAtRrp !== true;
}

export function sealedReference(opts: { lastPriceCents: number | null; lastEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): { cents: number | null; basis: "emailed" | "last" | null } {
  const live = liveWatermark({ lowestEmailedCents: opts.lastEmailedCents, lastNotifiedAt: opts.lastNotifiedAt, now: opts.now });
  if (live != null) return { cents: live, basis: "emailed" };
  if (opts.lastPriceCents != null) return { cents: opts.lastPriceCents, basis: "last" };
  return { cents: null, basis: null };
}

export function shouldEmailSealedDrop(opts: { priceCents: number; targetCents: number | null; lastPriceCents: number | null; lastEmailedCents: number | null; lastNotifiedAt: Date | null; now: Date }): boolean {
  if (opts.targetCents != null) return false;
  const ref = sealedReference(opts).cents;
  if (ref == null) return false;
  return ref - opts.priceCents >= Math.max(Math.ceil((ref * 5) / 100), SEALED_DROP_MIN_CENTS) && isMaterialDrop(ref, opts.priceCents);
}

export function inSealedCooldown(lastNotifiedAt: Date | null, now: Date): boolean {
  return lastNotifiedAt != null && now.getTime() - lastNotifiedAt.getTime() < SEALED_WATCH_COOLDOWN_MS;
}

const isSupportedMarket = (m: string): m is Country => Object.prototype.hasOwnProperty.call(COUNTRIES, m);

// ── The run ──────────────────────────────────────────────────────────────────

export type SealedWatchDb = {
  sealedWatch: Pick<typeof prisma.sealedWatch, "findMany" | "update" | "groupBy">;
  priceAlert: Pick<typeof prisma.priceAlert, "groupBy">;
  deckWatch: Pick<typeof prisma.deckWatch, "findMany">;
  alertMute: Pick<typeof prisma.alertMute, "findMany">;
  $transaction: typeof prisma.$transaction;
};

export interface SealedWatchRunDeps {
  db?: SealedWatchDb;
  now?: Date;
  // The sealed groups for a market. Defaults to getSealedGroups, called
  // directly (it caches itself), with getPreorderGroups for a watched key it
  // does not carry (a pre-order set's products).
  groups?: (market: Country) => Promise<SealedGroup[]>;
  preorderGroups?: (market: Country) => Promise<SealedGroup[]>;
  sendSealedWatchEmail?: typeof sendSealedWatchEmailImpl;
  notifyUsers?: boolean;
  dailyBudget?: number;
  // New addresses this pass may open: what is left of PAID_SEND_CAP after the
  // card and deck passes (the paid route shares one cap across its passes).
  sendCap?: number;
  // Called once, just before the groups are first read, when the run has
  // entitled watches to evaluate. The paid route passes lib/sealed-fresh's
  // bustSealedGroups on a run whose ISR purge was skipped, so the read below is
  // the sealed import's own output, not the last purge's.
  freshen?: () => void;
}

export interface SealedWatchRunSummary {
  watches: number;
  lapsed: number;
  overLimit: number; // Plus rows past SEALED_WATCH_LIMIT_PLUS — kept, not evaluated
  legacyMarket: number;
  missing: number; // watched products no longer in the groups
  unknown: number; // nothing decidable (no real-store row, or all stale)
  soldOut: number; // went sold out everywhere this run
  restocks: number;
  rrp: number;
  targets: number;
  drops: number;
  cooldown: number;
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

type Patch = {
  lastPriceCents?: number | null;
  lastInStock?: boolean;
  soldOutAt?: Date | null;
  lastAtRrp?: boolean;
  lastEmailedCents?: number;
  lastNotifiedAt?: Date;
};

const KIND_PRIORITY: Record<SealedWatchKind, number> = { sealed_target: 0, sealed_restock: 1, sealed_rrp: 2, sealed_drop: 3 };

export async function runSealedWatches(deps: SealedWatchRunDeps = {}): Promise<SealedWatchRunSummary> {
  const db = deps.db ?? (prisma as unknown as SealedWatchDb);
  const send = deps.sendSealedWatchEmail ?? sendSealedWatchEmailImpl;
  const loadGroups = deps.groups ?? getSealedGroups;
  const loadPreorders = deps.preorderGroups ?? getPreorderGroups;
  const now = deps.now ?? new Date();
  const summary: SealedWatchRunSummary = {
    watches: 0, lapsed: 0, overLimit: 0, legacyMarket: 0, missing: 0, unknown: 0, soldOut: 0, restocks: 0, rrp: 0, targets: 0,
    drops: 0, cooldown: 0, snoozed: 0, paused: 0, deferred: 0, budgetDeferred: 0, addressDeferred: 0, newAddresses: 0, emails: 0, updated: 0, held: 0,
  };

  const rows = await db.sealedWatch.findMany({
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
    take: SEALED_WATCH_READ_CAP,
    select: {
      id: true,
      userId: true,
      email: true,
      market: true,
      groupKey: true,
      targetCents: true,
      lastPriceCents: true,
      lastInStock: true,
      soldOutAt: true,
      lastEmailedCents: true,
      lastNotifiedAt: true,
      lastAtRrp: true,
      snoozedUntil: true,
      createdAt: true,
      user: { select: { email: true, isAdmin: true, premiumUntil: true, premiumTier: true, premiumTierFloor: true } },
    },
  });
  summary.watches = rows.length;

  // Entitlement and the Plus cap (oldest first), then the markets to read.
  const perUser = new Map<string, number>();
  const live: (typeof rows[number] & { market: Country })[] = [];
  for (const w of rows) {
    const user: EntitlementUser = { ...w.user, isAdmin: w.user.isAdmin || isAdminEmail(w.user.email) };
    if (!isPremium(user)) {
      summary.lapsed++;
      continue;
    }
    const n = (perUser.get(w.userId) ?? 0) + 1;
    perUser.set(w.userId, n);
    if (n > sealedWatchCeiling(premiumTierOf(user))) {
      summary.overLimit++;
      continue;
    }
    if (!isSupportedMarket(w.market)) {
      summary.legacyMarket++;
      continue;
    }
    live.push(w as typeof rows[number] & { market: Country });
  }

  // The groups, once per market, read directly. A failed read throws out of
  // the whole pass, uncached: nothing is decided from a partial read.
  const groupsByMarket = new Map<Country, Map<string, SealedGroup>>();
  if (live.length && deps.freshen) {
    try {
      deps.freshen();
    } catch {
      /* best-effort: the read below then serves whatever the cache holds */
    }
  }
  for (const market of new Set(live.map((w) => w.market))) {
    const byKey = new Map<string, SealedGroup>();
    for (const g of await loadGroups(market)) byKey.set(g.groupKey, g);
    const wanted = live.filter((w) => w.market === market).map((w) => w.groupKey);
    if (wanted.some((k) => !byKey.has(k))) {
      for (const g of await loadPreorders(market)) if (!byKey.has(g.groupKey)) byKey.set(g.groupKey, g);
    }
    groupsByMarket.set(market, byKey);
  }

  const always = new Map<string, Patch>();
  const base = new Map<string, Patch>();
  const heldIds = new Set<string>();
  const patch = (m: Map<string, Patch>, id: string, p: Patch) => m.set(id, { ...(m.get(id) ?? {}), ...p });

  interface Candidate {
    id: string;
    userId: string;
    email: string;
    item: SealedWatchItem;
    order: number;
    atRrp: boolean;
  }
  const candidates: Candidate[] = [];

  live.forEach((w, order) => {
    const g = groupsByMarket.get(w.market)?.get(w.groupKey);
    if (!g) {
      summary.missing++;
      return;
    }
    const state = sealedOfferState(g.listings, now);
    if (state.unknown) {
      summary.unknown++;
      return;
    }
    if (!state.open) {
      // Nothing to buy. Sold out at every fresh real store: start the clock
      // (once). A mix of sold-out and stale rows is not "everywhere".
      if (w.lastInStock !== false) patch(always, w.id, { lastInStock: false });
      if (state.soldOutEverywhere && w.soldOutAt == null) {
        // A row never yet seen open was WATCHED sold out from the moment the
        // member created it (hearting a "Sold out" box is the usual way in), so
        // the 20h counts from then, not from this first run: otherwise a
        // restock in the first day after the first run is cleared as a short
        // gap and never told. A row that has been seen open starts at now.
        const since = w.lastInStock == null && w.createdAt.getTime() < now.getTime() ? w.createdAt : now;
        patch(always, w.id, { soldOutAt: since });
        summary.soldOut++;
      }
      return;
    }
    const price = state.open.priceCents;
    const rrp = msrpCents(g.productType, w.market);
    const atRrp = isAtMsrp(price, g.productType, w.market);
    if (w.lastInStock !== true) patch(always, w.id, { lastInStock: true });
    if (!atRrp && w.lastAtRrp === true) patch(always, w.id, { lastAtRrp: false });
    const restock = isSealedRestock({ soldOutAt: w.soldOutAt, now });
    if (w.soldOutAt != null) {
      // A restock rides the baseline (held → re-detects); a short gap just clears.
      if (restock) patch(base, w.id, { soldOutAt: null });
      else patch(always, w.id, { soldOutAt: null });
    }
    if (price !== w.lastPriceCents) patch(base, w.id, { lastPriceCents: price });

    const refOpts = { lastPriceCents: w.lastPriceCents, lastEmailedCents: w.lastEmailedCents, lastNotifiedAt: w.lastNotifiedAt, now };
    let kind: SealedWatchKind | null = null;
    if (shouldEmailSealedTarget({ priceCents: price, targetCents: w.targetCents, lastEmailedCents: w.lastEmailedCents, lastNotifiedAt: w.lastNotifiedAt, now })) {
      kind = "sealed_target";
      summary.targets++;
    } else if (restock) {
      kind = "sealed_restock";
      summary.restocks++;
    } else if (shouldEmailSealedRrp({ priceCents: price, productType: g.productType, market: w.market, lastAtRrp: w.lastAtRrp })) {
      kind = "sealed_rrp";
      summary.rrp++;
    } else if (shouldEmailSealedDrop({ priceCents: price, targetCents: w.targetCents, ...refOpts })) {
      kind = "sealed_drop";
      summary.drops++;
    }
    if (!kind) return;
    if (inSealedCooldown(w.lastNotifiedAt, now)) {
      summary.cooldown++;
      heldIds.add(w.id);
      return;
    }
    if (w.snoozedUntil != null && w.snoozedUntil.getTime() > now.getTime()) {
      summary.snoozed++;
      return;
    }
    const ref = sealedReference(refOpts);
    let actions: SealedWatchItem["actions"] = null;
    try {
      actions = watchActionLinks({ kind: "sealed", id: w.id, now });
    } catch {
      actions = null;
    }
    const seen = Date.parse(state.open.lastSeen);
    candidates.push({
      id: w.id,
      userId: w.userId,
      email: w.email,
      order,
      atRrp,
      item: {
        kind,
        watchId: w.id,
        groupKey: w.groupKey,
        name: g.name,
        productType: g.productType,
        setCode: g.setCode,
        market: w.market,
        currency: currencyOf(w.market),
        priceCents: price,
        rrpCents: rrp,
        store: { name: state.open.retailerName, url: affiliateUrl(state.open.url, state.open.retailer, "/email-alert-sealed"), retailer: state.open.retailer },
        storeCount: state.openStores,
        targetCents: w.targetCents,
        referenceCents: kind === "sealed_restock" ? null : ref.cents,
        referenceBasis: kind === "sealed_restock" ? null : ref.basis,
        soldOutAt: kind === "sealed_restock" ? w.soldOutAt : null,
        checkedAt: Number.isFinite(seen) ? new Date(seen) : now,
        actions,
      },
    });
  });

  const paused = candidates.length ? await pausedAddresses(db, [...new Set(candidates.map((c) => c.email))]) : new Set<string>();
  const toSend = candidates.filter((c) => {
    if (!paused.has(c.email)) return true;
    summary.paused++;
    return false;
  });
  toSend.sort((x, y) => KIND_PRIORITY[x.item.kind] - KIND_PRIORITY[y.item.kind] || x.order - y.order);

  const recent = toSend.length ? await recentlyEmailedAddresses(db, now, ALERT_BUDGET_WINDOW_MS) : new Set<string>();
  const budgetTotal = deps.dailyBudget ?? alertDailyBudget();
  const budget = new RunBudget(recent, Math.max(0, budgetTotal - recent.size), deps.sendCap ?? PAID_SEND_CAP, WATCH_EMAILS_PER_ADDRESS);
  const notified = new Set<string>();
  for (const c of toSend) {
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
      const money = formatMoney(c.item.priceCents, c.item.currency);
      const title =
        c.item.kind === "sealed_restock"
          ? `${c.item.name} is back in stock: ${money} at ${c.item.store.name}`
          : c.item.kind === "sealed_rrp"
            ? `${c.item.name} is at RRP: ${money} at ${c.item.store.name}`
            : c.item.kind === "sealed_target"
              ? `${c.item.name} hit your target: ${money} at ${c.item.store.name}`
              : `${c.item.name} dropped to ${money} at ${c.item.store.name}`;
      void notify(c.userId, "sealed_watch", title, "Open /sealed to compare every store.", "/watching").catch(() => {});
    }
  }

  const writes: { id: string; data: Patch }[] = [];
  for (const w of live) {
    const held = heldIds.has(w.id);
    const data: Patch = { ...(always.get(w.id) ?? {}) };
    if (!held) Object.assign(data, base.get(w.id) ?? {});
    if (notified.has(w.id)) {
      const c = toSend.find((x) => x.id === w.id)!;
      data.lastEmailedCents = c.item.priceCents;
      data.lastNotifiedAt = now;
      data.lastAtRrp = c.atRrp;
    }
    if (Object.keys(data).length) writes.push({ id: w.id, data });
  }
  summary.held = heldIds.size;
  summary.newAddresses = budget.newAddresses;
  summary.updated = writes.length;
  if (writes.length) await db.$transaction(writes.map((x) => db.sealedWatch.update({ where: { id: x.id }, data: x.data })));
  return summary;
}

// ── The routes' logic (app/api/watches/sealed) ───────────────────────────────

export type SealedWatchRouteDb = {
  sealedWatch: Pick<typeof prisma.sealedWatch, "count" | "create" | "findFirst" | "findMany" | "update" | "deleteMany">;
};

export interface WatchRouteResult {
  status: number;
  body: Record<string, unknown>;
}

export type RouteUser = EntitlementUser & { id: string; email: string };

const SEALED_WATCH_SELECT = {
  id: true,
  market: true,
  groupKey: true,
  targetCents: true,
  lastPriceCents: true,
  lastInStock: true,
  soldOutAt: true,
  lastEmailedCents: true,
  lastNotifiedAt: true,
  snoozedUntil: true,
  createdAt: true,
} as const;

const GROUP_KEY = /^[A-Za-z0-9|_\- .]{1,80}$/;
const asInt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

function notPlus(): WatchRouteResult {
  return { status: 402, body: { error: "Sealed watches are part of Plus.", code: "tier_required", tier: "plus" } };
}

/**
 * POST: watch one product in the viewer's market. 402 without a paid tier; on
 * Plus, 409 at SEALED_WATCH_LIMIT_PLUS. Watching a product already watched
 * updates its target instead (unique per user, product and market).
 */
export async function createSealedWatch(db: SealedWatchRouteDb, user: RouteUser, raw: unknown, market: Country): Promise<WatchRouteResult> {
  if (!isPremium(user)) return notPlus();
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const groupKey = typeof body.groupKey === "string" && GROUP_KEY.test(body.groupKey) ? body.groupKey : null;
  if (!groupKey) return { status: 400, body: { error: "Which product?" } };
  const targetRaw = body.targetCents == null ? null : asInt(body.targetCents);
  if (body.targetCents != null && targetRaw == null) return { status: 400, body: { error: "The target must be a whole number of cents." } };
  const targetCents = targetRaw == null ? null : clampTargetCents(targetRaw);
  const existing = await db.sealedWatch.findFirst({ where: { userId: user.id, groupKey, market }, select: { id: true } });
  if (existing) {
    const watch = await db.sealedWatch.update({
      where: { id: existing.id },
      data: "targetCents" in body ? { targetCents, lastEmailedCents: null } : {},
      select: SEALED_WATCH_SELECT,
    });
    return { status: 200, body: { ok: true, watch, existed: true } };
  }
  const tier = premiumTierOf(user);
  const ceiling = sealedWatchCeiling(tier);
  const count = await db.sealedWatch.count({ where: { userId: user.id } });
  if (count >= ceiling) {
    if (tier === "premium") {
      return { status: 409, body: { error: `Sealed watches stop at ${SEALED_WATCH_HARD_CAP} products per account. Stop one to add another.`, code: "limit", limit: SEALED_WATCH_HARD_CAP, count } };
    }
    return {
      status: 409,
      body: { error: `Plus watches up to ${SEALED_WATCH_LIMIT_PLUS} sealed products. Stop one, or move to Premium for unlimited.`, code: "limit", limit: SEALED_WATCH_LIMIT_PLUS, count },
    };
  }
  const watch = await db.sealedWatch.create({ data: { userId: user.id, email: user.email, market, groupKey, targetCents }, select: SEALED_WATCH_SELECT });
  return { status: 201, body: { ok: true, watch } };
}

/** GET: this account's sealed watches, oldest first. */
export async function listSealedWatches(db: SealedWatchRouteDb, user: RouteUser): Promise<WatchRouteResult> {
  const watches = await db.sealedWatch.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, take: 500, select: SEALED_WATCH_SELECT });
  const tier = premiumTierOf(user);
  const limit = sealedWatchLimit(tier);
  return { status: 200, body: { watches, limit: Number.isFinite(limit) ? limit : null, entitled: isPremium(user) } };
}

/**
 * PATCH: change the target (re-arms it) or snooze / unsnooze. The owner only.
 * Editing the target is Plus's; SNOOZING needs no entitlement, so a lapsed
 * owner can quiet a watch that would resume when they resubscribe.
 */
export async function updateSealedWatch(db: SealedWatchRouteDb, user: RouteUser, id: string, raw: unknown, now: Date = new Date()): Promise<WatchRouteResult> {
  if (raw && typeof raw === "object" && "targetCents" in raw && !isPremium(user)) return notPlus();
  const row = await db.sealedWatch.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!row) return { status: 404, body: { error: "That watch isn't on your list." } };
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const data: Prisma.SealedWatchUpdateInput = {};
  if ("targetCents" in body) {
    if (body.targetCents == null) data.targetCents = null;
    else {
      const t = asInt(body.targetCents);
      if (t == null) return { status: 400, body: { error: "The target must be a whole number of cents." } };
      data.targetCents = clampTargetCents(t);
    }
    data.lastEmailedCents = null;
  }
  if ("snoozeDays" in body) {
    const d = asInt(body.snoozeDays);
    if (d == null || d < 0 || d > 365) return { status: 400, body: { error: "Snooze for up to a year." } };
    data.snoozedUntil = d === 0 ? null : new Date(now.getTime() + d * 86_400_000);
  }
  if (!Object.keys(data).length) return { status: 400, body: { error: "Nothing to change." } };
  const watch = await db.sealedWatch.update({ where: { id: row.id }, data, select: SEALED_WATCH_SELECT });
  return { status: 200, body: { ok: true, watch } };
}

/**
 * DELETE: stop watching. The owner only, whatever the tier (stopping a watch
 * needs no entitlement, and a lapsed member's rows are otherwise invisible and
 * unremovable); idempotent.
 */
export async function deleteSealedWatch(db: SealedWatchRouteDb, user: RouteUser, id: string): Promise<WatchRouteResult> {
  const res = await db.sealedWatch.deleteMany({ where: { id, userId: user.id } });
  return { status: res.count ? 200 : 404, body: { ok: res.count > 0, removed: res.count } };
}
