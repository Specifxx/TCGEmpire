// A stateful-enough stub of everything runPriceAlerts() touches, shared by the
// alert tests. Not a test file itself (npm test globs tests/*.test.ts).
//
// Rows are PriceAlert rows as the cron selects them. Prices come from
// RetailerPrice rows, exactly as in production: `price` (or `us`) on a row is
// shorthand for one fresh, in-stock, Near-Mint store listing of that card in
// the row's market at that price; `stores` supplies any other rows.
import { runPriceAlerts, type AlertRunDeps, type AlertScope } from "../../src/lib/price-alerts";
import type { PriceDropItem } from "../../src/lib/email";
import type { AlertPriceRow } from "../../src/lib/alert-price";
import type { TcgMarketRef } from "../../src/lib/arbitrage";
import { priceField, type Country } from "../../src/lib/country";

export const NOW = new Date("2026-10-30T09:00:00Z");
export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
export const daysAgo = (n: number, from: Date = NOW) => new Date(from.getTime() - n * DAY);
export const hoursAgo = (n: number, from: Date = NOW) => new Date(from.getTime() - n * HOUR);

// Entitlement is read against the real clock (isPremium), so dates far from
// today in both directions.
const PAID_UNTIL = new Date("2099-01-01T00:00:00Z");
const LAPSED = new Date("2020-01-01T00:00:00Z");

export type User = { isAdmin: boolean; premiumUntil: Date | null; premiumTier: string; premiumTierFloor: string | null; email?: string };
export const plus: User = { isAdmin: false, premiumUntil: PAID_UNTIL, premiumTier: "plus", premiumTierFloor: null };
export const premium: User = { isAdmin: false, premiumUntil: PAID_UNTIL, premiumTier: "premium", premiumTierFloor: null };
export const lapsed: User = { isAdmin: false, premiumUntil: LAPSED, premiumTier: "plus", premiumTierFloor: null };
export const free: User = { isAdmin: false, premiumUntil: null, premiumTier: "premium", premiumTierFloor: null };

export type Card = {
  id: string;
  name: string;
  slug: string | null;
  setCode: string;
  collectorNumber: string;
  lowestPriceCents: number | null;
  lowestPriceCentsUs: number | null;
  lowestPriceCentsUk: number | null;
  lowestPriceCentsSg: number | null;
  lowestPriceCentsCa: number | null;
  lowestPriceCentsEu: number | null;
};

export type Row = {
  id: string;
  email: string;
  market: string;
  lastPriceCents: number | null;
  lowestEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  targetCents: number | null;
  targetEmailedCents: number | null;
  startPriceCents: number | null;
  soldOutAt: Date | null;
  soldOutRuns: number | null;
  pendingLowCents: number | null;
  dropAnchorCents: number | null;
  snoozedUntil: Date | null;
  createdAt: Date;
  unsubToken: string;
  userId: string | null;
  user: User | null;
  card: Card;
};

export type RowOpts = Partial<Omit<Row, "card">> & {
  price?: number | null; // one fresh NM store listing in the row's market
  us?: number | null; // alias for price on a US row
  cardId?: string;
  setCode?: string;
  cardPrice?: number | null; // Card.lowestPriceCents* for the market (the ebayOnly counter)
};

// A released set by default, so "listed" reads as listed; tests about
// pre-orders pass setCode "RAD" (Radiance, releasing 2026-10-23) and an
// earlier `now`.
export function row(id: string, over: RowOpts = {}): Row & { _price: number | null } {
  const { price, us, cardId = `card-${id}`, setCode = "VEN", cardPrice = null, ...rest } = over;
  // A row given soldOutAt has been SEEN sold out by two runs unless the test
  // says otherwise (soldOutRuns: 1) — the restock rule's second condition.
  if (rest.soldOutAt != null && rest.soldOutRuns === undefined) rest.soldOutRuns = 2;
  const market = rest.market ?? "US";
  const card: Card = {
    id: cardId,
    name: `Card ${id}`,
    slug: cardId,
    setCode,
    collectorNumber: "001",
    lowestPriceCents: null,
    lowestPriceCentsUs: null,
    lowestPriceCentsUk: null,
    lowestPriceCentsSg: null,
    lowestPriceCentsCa: null,
    lowestPriceCentsEu: null,
  };
  if (cardPrice != null && ["AU", "US", "UK", "SG", "CA", "EU"].includes(market)) card[priceField(market as Country)] = cardPrice;
  return {
    id,
    email: `${id}@example.com`,
    market,
    lastPriceCents: null,
    lowestEmailedCents: null,
    lastNotifiedAt: null,
    targetCents: null,
    targetEmailedCents: null,
    startPriceCents: null,
    soldOutAt: null,
    soldOutRuns: null,
    pendingLowCents: null,
    dropAnchorCents: null,
    snoozedUntil: null,
    createdAt: daysAgo(30),
    unsubToken: `tok-${id}`,
    userId: null,
    user: null,
    card,
    ...rest,
    _price: price ?? us ?? null,
  };
}

/** A watch owned by an account with the given entitlement. */
export const owned = (id: string, user: User, over: RowOpts = {}) => row(id, { userId: `u-${id}`, user, ...over });

/** A RetailerPrice row as the alert query selects it: fresh, in stock, Near Mint, a real store. */
export function listing(cardId: string, priceCents: number, over: Partial<AlertPriceRow> = {}): AlertPriceRow {
  return {
    cardId,
    country: "US",
    retailer: "shopx",
    retailerName: "Shop X",
    priceCents,
    shippingCents: null,
    condition: "Near Mint",
    url: `https://shopx.example/${cardId}`,
    inStock: true,
    lastSeen: hoursAgo(2),
    derived: null,
    ...over,
  };
}

export interface HarnessOpts {
  stores?: AlertPriceRow[];
  sendOk?: boolean | ((to: string) => boolean);
  tcg?: Record<string, TcgMarketRef>;
  now?: Date;
  dailyBudget?: number;
  priceQueryFails?: boolean;
  mutes?: string[]; // addresses that paused alert emails (AlertMute)
  muteQueryFails?: boolean;
}

type Where = {
  inStock?: boolean;
  lastSeen?: { gte: Date; lt?: Date };
  OR?: { country: string; cardId: { in: string[] } }[];
};

export function harness(rows: (Row & { _price?: number | null })[], opts: HarnessOpts = {}) {
  const now = opts.now ?? NOW;
  const sent: { to: string; items: PriceDropItem[]; token: string; anonymous: boolean }[] = [];
  const writes: { id: string; data: Record<string, unknown> }[] = [];
  const alertQueries: Record<string, unknown>[] = [];
  const priceQueries: Record<string, unknown>[] = [];
  const budgetQueries: Record<string, unknown>[] = [];
  const tcgCalls: { country: string; ids: string[] }[] = [];
  const muteQueries: Record<string, unknown>[] = [];
  const listings: AlertPriceRow[] = [
    ...rows.filter((r) => r._price != null).map((r) => listing(r.card.id, r._price!, { country: r.market })),
    ...(opts.stores ?? []),
  ];
  const cleanRows = rows.map(({ _price, ...r }) => r);
  const db = {
    priceAlert: {
      findMany: async (args: Record<string, unknown>) => {
        alertQueries.push(args);
        return cleanRows;
      },
      // The daily-budget count: addresses emailed since `gte`, grouped.
      groupBy: async (args: { by: string[]; where: { lastNotifiedAt: { gte: Date } } }) => {
        budgetQueries.push(args as unknown as Record<string, unknown>);
        const gte = args.where.lastNotifiedAt.gte.getTime();
        const emails = [...new Set(cleanRows.filter((r) => r.lastNotifiedAt && r.lastNotifiedAt.getTime() >= gte).map((r) => r.email))];
        return emails.map((email) => ({ email }));
      },
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
        writes.push({ id: args.where.id, data: args.data });
        return args;
      },
    },
    retailerPrice: {
      findMany: async (args: { where: Where; take?: number }) => {
        priceQueries.push(args as unknown as Record<string, unknown>);
        if (opts.priceQueryFails) throw new Error("db down");
        const w = args.where;
        const gte = w.lastSeen?.gte.getTime() ?? 0;
        const lt = w.lastSeen?.lt?.getTime() ?? Infinity;
        // Filters the pair, stock and age as Postgres would; the RETAILER
        // filters are left to the code, so eBay/reference exclusion is proven
        // in code too, not only in the query.
        return listings
          .filter((l) => (w.inStock ? l.inStock : true))
          .filter((l) => l.lastSeen.getTime() >= gte && l.lastSeen.getTime() < lt)
          .filter((l) => (w.OR ?? []).some((o) => o.country === l.country && o.cardId.in.includes(l.cardId)))
          .sort((a, b) => a.priceCents - b.priceCents)
          .slice(0, args.take ?? Infinity);
      },
    },
    alertMute: {
      findMany: async (args: { where: { email: { in: string[] } }; take?: number }) => {
        muteQueries.push(args as unknown as Record<string, unknown>);
        if (opts.muteQueryFails) throw new Error("db down");
        return (opts.mutes ?? []).filter((e) => args.where.email.in.includes(e)).map((email) => ({ email }));
      },
    },
    $transaction: async (ops: unknown[]) => ops,
  };
  const deps: AlertRunDeps = {
    db: db as unknown as AlertRunDeps["db"],
    sendPriceDropEmail: async (to, items, token, anonymous = false) => {
      sent.push({ to, items, token, anonymous });
      const ok = opts.sendOk ?? true;
      return typeof ok === "function" ? ok(to) : ok;
    },
    now,
    notifyUsers: false,
    tcgMarket: async (country, ids) => {
      tcgCalls.push({ country, ids });
      return new Map(Object.entries(opts.tcg ?? {}).filter(([id]) => ids.includes(id)));
    },
    dailyBudget: opts.dailyBudget ?? 50,
  };
  const writeFor = (id: string) => writes.find((w) => w.id === id)?.data;
  const items = () => sent.flatMap((s) => s.items);
  return {
    sent,
    writes,
    writeFor,
    items,
    alertQueries,
    priceQueries,
    budgetQueries,
    tcgCalls,
    muteQueries,
    run: (scope?: AlertScope) => runPriceAlerts(deps, scope ? { scope } : {}),
    // The push re-import's pass: baselines only, nothing sent.
    runBaseline: () => runPriceAlerts(deps, { baselineOnly: true }),
  };
}

/** Apply a run's writes to the rows, so a test can run the next day against them. */
export function applyWrites<T extends Row>(rows: T[], writes: { id: string; data: Record<string, unknown> }[]): T[] {
  return rows.map((r) => {
    const w = writes.find((x) => x.id === r.id);
    return w ? ({ ...r, ...w.data } as T) : r;
  });
}
