// Stubs for the deck price watch and sealed watch runs (lib/deck-watch.ts,
// lib/sealed-watch.ts) — the same shape as alert-harness.ts, for the two new
// tables. Not a test file itself.
import { runDeckWatches, type DeckWatchDb, type DeckWatchRunDeps } from "../../src/lib/deck-watch";
import { runSealedWatches, type SealedWatchDb, type SealedWatchRunDeps } from "../../src/lib/sealed-watch";
import type { DeckWatchItem, SealedWatchItem } from "../../src/lib/watch-emails";
import type { SealedGroup } from "../../src/lib/sealed-import";
import { normalizeSearch } from "../../src/lib/format";
import { NOW, type User } from "./alert-harness";

export { NOW, DAY, HOUR, daysAgo, hoursAgo, plus, premium, lapsed, free } from "./alert-harness";

// ── Deck watches ─────────────────────────────────────────────────────────────

export interface DeckRow {
  id: string;
  userId: string;
  market: string;
  name: string;
  listText: string;
  region: string | null;
  trackedOnly: boolean | null;
  minCondition: string | null;
  targetCents: number | null;
  lastTotalCents: number | null;
  lastEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  snoozedUntil: Date | null;
  createdAt: Date;
  user: User & { email: string };
}

export function deckRow(id: string, user: User, over: Partial<DeckRow> = {}): DeckRow {
  return {
    id,
    userId: over.userId ?? `u-${id}`,
    market: "US",
    name: `Deck ${id}`,
    listText: "3 Alpha\n1 Beta",
    region: null,
    trackedOnly: null,
    minCondition: null,
    targetCents: null,
    lastTotalCents: null,
    lastEmailedCents: null,
    lastNotifiedAt: null,
    snoozedUntil: null,
    createdAt: new Date(NOW.getTime() - 30 * 86_400_000),
    ...over,
    user: { ...user, email: over.user?.email ?? `${id}@example.com` },
  };
}

export interface StoreRow {
  cardId: string;
  retailer: string;
  priceCents: number;
  url?: string;
  condition?: string | null;
}

export interface DeckHarnessOpts {
  // Cards by name: the resolver matches pasted names to these.
  cards?: { id: string; name: string }[];
  listings?: StoreRow[];
  recent?: string[]; // addresses the budget already counts (any table)
  mutes?: string[];
  sendOk?: boolean;
  dailyBudget?: number;
  now?: Date;
  listingsFail?: boolean;
}

export function deckHarness(rows: DeckRow[], opts: DeckHarnessOpts = {}) {
  const now = opts.now ?? NOW;
  const cards = opts.cards ?? [
    { id: "alpha", name: "Alpha" },
    { id: "beta", name: "Beta" },
  ];
  const sent: { to: string; item: DeckWatchItem }[] = [];
  const writes: { id: string; data: Record<string, unknown> }[] = [];
  const listingQueries: Record<string, unknown>[] = [];
  const budgetReads: string[] = [];
  const db = {
    deckWatch: {
      // The run's own read (no lastNotifiedAt filter) returns every row; the
      // budget's read (lib/alert-budget.ts) only the rows emailed since `gte`.
      findMany: async (args?: { where?: { lastNotifiedAt?: { gte: Date } } }) => {
        const gte = args?.where?.lastNotifiedAt?.gte;
        if (gte) return rows.filter((r) => r.lastNotifiedAt && r.lastNotifiedAt.getTime() >= gte.getTime()).map((r) => ({ user: { email: r.user.email } }));
        return rows.map((r) => ({ ...r }));
      },
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
        writes.push({ id: args.where.id, data: args.data });
        return args;
      },
    },
    card: {
      findMany: async (args: { where: { nameNormalized?: { in: string[] } } }) => {
        const wanted = args.where.nameNormalized?.in ?? [];
        return cards
          .filter((c) => wanted.includes(normalizeSearch(c.name)))
          .map((c) => ({ id: c.id, name: c.name, slug: c.id, nameNormalized: normalizeSearch(c.name), setCode: "OGN", collectorNumber: "001/298", variant: null, isPromo: false }));
      },
    },
    retailerPrice: {
      findMany: async (args: { where: { cardId: { in: string[] }; country: string; retailer: { in: string[] } } }) => {
        listingQueries.push(args as unknown as Record<string, unknown>);
        if (opts.listingsFail) throw new Error("db down");
        return (opts.listings ?? [])
          .filter((l) => args.where.cardId.in.includes(l.cardId) && args.where.retailer.in.includes(l.retailer))
          .map((l) => ({ cardId: l.cardId, retailer: l.retailer, priceCents: l.priceCents, url: l.url ?? `https://x/${l.cardId}`, condition: l.condition ?? "Near Mint" }));
      },
    },
    priceAlert: {
      groupBy: async () => {
        budgetReads.push("priceAlert");
        return (opts.recent ?? []).map((email) => ({ email }));
      },
    },
    sealedWatch: { groupBy: async () => [] as { email: string }[] },
    alertMute: {
      findMany: async (args: { where: { email: { in: string[] } } }) => (opts.mutes ?? []).filter((e) => args.where.email.in.includes(e)).map((email) => ({ email })),
    },
    $transaction: async (ops: unknown[]) => ops,
  };
  const deps: DeckWatchRunDeps = {
    db: db as unknown as DeckWatchDb,
    now,
    notifyUsers: false,
    dailyBudget: opts.dailyBudget ?? 50,
    sendDeckWatchEmail: async (to, item) => {
      sent.push({ to, item });
      return opts.sendOk ?? true;
    },
  };
  return {
    db: db as unknown as DeckWatchDb,
    sent,
    writes,
    listingQueries,
    budgetReads,
    writeFor: (id: string) => writes.find((w) => w.id === id)?.data,
    run: (extra: Partial<DeckWatchRunDeps> = {}) => runDeckWatches({ ...deps, ...extra }),
  };
}

// ── Sealed watches ───────────────────────────────────────────────────────────

export interface SealedRow {
  id: string;
  userId: string;
  email: string;
  market: string;
  groupKey: string;
  targetCents: number | null;
  lastPriceCents: number | null;
  lastInStock: boolean | null;
  soldOutAt: Date | null;
  lastEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  lastAtRrp: boolean | null;
  snoozedUntil: Date | null;
  createdAt: Date;
  user: User & { email: string };
}

export function sealedRow(id: string, user: User, over: Partial<SealedRow> = {}): SealedRow {
  return {
    id,
    userId: over.userId ?? `u-${id}`,
    email: `${id}@example.com`,
    market: "US",
    groupKey: "OGN|Booster Box",
    targetCents: null,
    lastPriceCents: null,
    lastInStock: null,
    soldOutAt: null,
    lastEmailedCents: null,
    lastNotifiedAt: null,
    lastAtRrp: null,
    snoozedUntil: null,
    createdAt: new Date(NOW.getTime() - 30 * 86_400_000),
    ...over,
    user: { ...user, email: over.user?.email ?? `${id}@example.com` },
  };
}

export type Listing = SealedGroup["listings"][number];

/** A fresh, in-stock real-store listing at this price. */
export function offer(priceCents: number, over: Partial<Listing> = {}): Listing {
  return {
    retailer: "shopx",
    retailerName: "Shop X",
    priceCents,
    url: "https://shopx.example/box",
    inStock: true,
    lastSeen: new Date(NOW.getTime() - 2 * 3_600_000).toISOString(),
    ...over,
  };
}

export function group(listings: Listing[], over: Partial<SealedGroup> = {}): SealedGroup {
  return {
    groupKey: "OGN|Booster Box",
    name: "Origins Booster Box",
    productType: "Booster Box",
    setCode: "OGN",
    imageUrl: null,
    lowestPriceCents: null,
    storeCount: 0,
    msrpCents: 14400,
    atMsrp: false,
    overMsrpPct: null,
    firstSeenAt: null,
    listings,
    ...over,
  };
}

export interface SealedHarnessOpts {
  groups?: SealedGroup[];
  preorderGroups?: SealedGroup[];
  recent?: string[];
  mutes?: string[];
  sendOk?: boolean;
  dailyBudget?: number;
  now?: Date;
  groupsFail?: boolean;
}

export function sealedHarness(rows: SealedRow[], opts: SealedHarnessOpts = {}) {
  const now = opts.now ?? NOW;
  const sent: { to: string; item: SealedWatchItem }[] = [];
  const writes: { id: string; data: Record<string, unknown> }[] = [];
  const groupCalls: string[] = [];
  const db = {
    sealedWatch: {
      findMany: async () => rows.map((r) => ({ ...r })),
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
        writes.push({ id: args.where.id, data: args.data });
        return args;
      },
      groupBy: async () => [] as { email: string }[],
    },
    priceAlert: { groupBy: async () => (opts.recent ?? []).map((email) => ({ email })) },
    deckWatch: { findMany: async () => [] as { user: { email: string } }[] },
    alertMute: {
      findMany: async (args: { where: { email: { in: string[] } } }) => (opts.mutes ?? []).filter((e) => args.where.email.in.includes(e)).map((email) => ({ email })),
    },
    $transaction: async (ops: unknown[]) => ops,
  };
  const deps: SealedWatchRunDeps = {
    db: db as unknown as SealedWatchDb,
    now,
    notifyUsers: false,
    dailyBudget: opts.dailyBudget ?? 50,
    groups: async (market) => {
      groupCalls.push(`groups:${market}`);
      if (opts.groupsFail) throw new Error("db down");
      return opts.groups ?? [];
    },
    preorderGroups: async (market) => {
      groupCalls.push(`preorders:${market}`);
      return opts.preorderGroups ?? [];
    },
    sendSealedWatchEmail: async (to, item) => {
      sent.push({ to, item });
      return opts.sendOk ?? true;
    },
  };
  return {
    sent,
    writes,
    groupCalls,
    writeFor: (id: string) => writes.find((w) => w.id === id)?.data,
    run: (extra: Partial<SealedWatchRunDeps> = {}) => runSealedWatches({ ...deps, ...extra }),
  };
}
