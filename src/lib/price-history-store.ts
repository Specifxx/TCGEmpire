// PUBLIC PRICE HISTORY, AS FILES IN THIS REPOSITORY (2026-10-03, DECISIONS.md
// "Public price history moves out of Neon into the repository").
//
// WHAT LIVES HERE: every public price series, and nothing else.
//   • cards/YYYY-MM-DD.json  — the GLOBAL card series: one point per card per
//     Sydney day, the cheapest in-stock price in any of AU/US/UK/SG converted to
//     US cents (price-import.ts's snapshot; historySource() in price-history.ts
//     converts it to each market's own currency on read).
//   • sealed/YYYY-MM-DD.json — one point per sealed product group per market per
//     Sydney day, in that market's own currency (sealed-import.ts's snapshot).
// PRIVATE history stays in Neon: the outbound-click log (ClickEvent) in the
// history project (lib/db-history.ts), demand snapshots in the operational
// database. Never write anything under data/price-history that is not already
// shown on a public page: this directory is published with the source.
//
// WHY FILES. Price history is written by the importer and read by everyone,
// and it is small (a few MB). As a database it burned a Neon project's 5 GB
// monthly transfer allowance every four or five days, re-reading the same rows;
// as files bundled into each release it costs no transfer at all. That is also
// what makes DAILY snapshots affordable again (they were weekly to save reads).
//
// HOW IT REACHES THE SITE. refresh-prices.yml commits these files to main after
// every import, in a commit without the deploy marker, so it never builds on its
// own. The next release bundles them (next.config.js outputFileTracingIncludes)
// and every read below is a local file read. The site's history is therefore as
// fresh as the last release: normally the newest Sydney day, about a day and
// three quarters behind at most (STALE_HISTORY_MS in price-history.ts).
//
// APPEND-ONLY BY CONSTRUCTION. A day's file is only ever rewritten by a re-run
// of the import on the same Sydney day (the last run of the day wins, the
// database's old same-day-replace rule), so git stores one small new file a day
// instead of rewriting a growing archive.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// PRICE_HISTORY_DIR in the environment points the store elsewhere: tests use a
// fixture directory, and nothing in production sets it.
export const PRICE_HISTORY_DIR = process.env.PRICE_HISTORY_DIR || path.join(process.cwd(), "data", "price-history");
export const CARD_HISTORY_SUBDIR = "cards";
export const SEALED_HISTORY_SUBDIR = "sealed";
// Graded slabs (2026-10-09): per card, the cheapest live eBay slab per grade.
export const GRADED_HISTORY_SUBDIR = "graded";

const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;

export const CARD_HISTORY_BASIS =
  "Cheapest in-stock price for the card across the AU, US, UK and SG markets on this Sydney calendar day, converted to US cents.";
export const SEALED_HISTORY_BASIS =
  "Cheapest in-stock price for the sealed product group in each market on this Sydney calendar day, in that market's own currency (cents).";

export const GRADED_HISTORY_BASIS =
  "Cheapest live eBay listing for each grader and grade of the card (PSA 10, BGS 9.5, ...) across the markets searched that day, converted to US cents. Keyed by card id, then by grade.";

export type GradedDayFile = { day: string; currency: "USD"; basis: string; prices: Record<string, Record<string, number>> };
export type GradedHistoryRow = { cardId: string; grade: string; day: Date; lowestPriceCents: number };

export type CardDayFile = { day: string; currency: "USD"; basis: string; prices: Record<string, number> };
export type SealedDayFile = { day: string; basis: string; prices: Record<string, Record<string, number>> };

/** Same shape the PriceHistory table returned, so readers swap source, not logic. */
export type CardHistoryRow = { cardId: string; day: Date; lowestPriceCents: number };
export type SealedHistoryRow = { groupKey: string; country: string; day: Date; lowestPriceCents: number };

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const dayDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dirOf = (sub: string) => path.join(PRICE_HISTORY_DIR, sub);
const fileOf = (sub: string, iso: string) => path.join(dirOf(sub), `${iso}.json`);

/** Every Sydney day with a file, oldest first. [] when the directory is missing. */
export function historyDays(sub: string): string[] {
  try {
    return fs
      .readdirSync(dirOf(sub))
      .map((f) => DAY_FILE.exec(f)?.[1])
      .filter((d): d is string => !!d)
      .sort();
  } catch {
    return [];
  }
}

function readDay<T>(sub: string, iso: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(fileOf(sub, iso), "utf8")) as T;
  } catch (e) {
    console.warn(`[price-history-store] could not read ${sub}/${iso}.json:`, e);
    return null;
  }
}

// ── The card series, loaded once per process ─────────────────────────────────
// In a deployed function the files never change, so the first read pays a few
// tens of milliseconds to parse them and every later one is a memory lookup.
// The stamp (day count, newest day, newest file's hash) reloads the index in a
// long-lived process that writes or pulls new files: the importer, `next dev`.
type Series = { t: number[]; c: number[] };
type CardIndex = { stamp: string; version: string; days: string[]; byCard: Map<string, Series>; points: number };
let cardMemo: CardIndex | null = null;

function newestHash(sub: string, days: string[]): string {
  const last = days[days.length - 1];
  if (!last) return "none";
  try {
    return createHash("sha1").update(fs.readFileSync(fileOf(sub, last))).digest("hex").slice(0, 10);
  } catch {
    return "unreadable";
  }
}

function cardIndex(): CardIndex {
  const days = historyDays(CARD_HISTORY_SUBDIR);
  const last = days[days.length - 1] ?? "none";
  const version = `${last}.${days.length}.${newestHash(CARD_HISTORY_SUBDIR, days)}`;
  if (cardMemo && cardMemo.stamp === version) return cardMemo;
  const byCard = new Map<string, Series>();
  let points = 0;
  for (const iso of days) {
    const file = readDay<CardDayFile>(CARD_HISTORY_SUBDIR, iso);
    if (!file?.prices) continue;
    const t = dayDate(iso).getTime();
    for (const [cardId, cents] of Object.entries(file.prices)) {
      if (!Number.isInteger(cents) || cents <= 0) continue;
      let s = byCard.get(cardId);
      if (!s) byCard.set(cardId, (s = { t: [], c: [] }));
      s.t.push(t);
      s.c.push(cents);
      points++;
    }
  }
  cardMemo = { stamp: version, version, days, byCard, points };
  return cardMemo;
}

/** Forget the loaded index (after a write in the same process). */
export function resetPriceHistoryStore(): void {
  cardMemo = null;
}

/**
 * Changes whenever the card series does: the newest day, the number of days and
 * a hash of the newest file. Every cache key over history-derived data carries
 * it, so a release with new history recomputes exactly once, and a release
 * without any reuses the entry. (A week-scoped key would serve last week's
 * numbers for up to six releases; a day-scoped one would recompute daily
 * whether or not the data had moved.)
 */
export function cardHistoryVersion(): string {
  return cardIndex().version;
}

/**
 * Card points, oldest first, optionally limited to some cards and to days on or
 * after `since`. The drop-in for `dbHistory.priceHistory.findMany({ where:
 * { country: GLOBAL, cardId: { in }, day: { gte } }, orderBy: { day: "asc" } })`.
 */
export function cardHistoryRows(opts: { since?: Date; cardIds?: Iterable<string> } = {}): CardHistoryRow[] {
  const { byCard } = cardIndex();
  const since = opts.since?.getTime() ?? Number.NEGATIVE_INFINITY;
  const ids = opts.cardIds ? new Set(opts.cardIds) : null;
  const out: CardHistoryRow[] = [];
  const take = (cardId: string, s: Series) => {
    for (let i = 0; i < s.t.length; i++) {
      if (s.t[i] >= since) out.push({ cardId, day: new Date(s.t[i]), lowestPriceCents: s.c[i] });
    }
  };
  if (ids) {
    for (const id of ids) {
      const s = byCard.get(id);
      if (s) take(id, s);
    }
  } else {
    for (const [id, s] of byCard) take(id, s);
  }
  return out.sort((a, b) => a.day.getTime() - b.day.getTime());
}

/** The newest Sydney day any card has a point for. */
export function cardHistoryLatestDay(): Date | undefined {
  const { days } = cardIndex();
  return days.length ? dayDate(days[days.length - 1]) : undefined;
}

/** How many days of history one card has (the card page's indexability gate). */
export function cardHistoryDayCount(cardId: string): number {
  return cardIndex().byCard.get(cardId)?.t.length ?? 0;
}

export type CardHistorySummary = {
  cardId: string;
  maxCents: number;
  minCents: number;
  days: number;
  firstDay: Date;
  lastDay: Date;
};

/** Per-card max, min, day count, first and newest day: the records board's ranking pass. */
export function cardHistorySummaries(): CardHistorySummary[] {
  const out: CardHistorySummary[] = [];
  for (const [cardId, s] of cardIndex().byCard) {
    if (!s.c.length) continue;
    out.push({
      cardId,
      maxCents: Math.max(...s.c),
      minCents: Math.min(...s.c),
      days: s.c.length,
      firstDay: new Date(s.t[0]),
      lastDay: new Date(s.t[s.t.length - 1]),
    });
  }
  return out;
}

export function cardHistoryStats(): { days: number; cards: number; points: number; first?: string; last?: string } {
  const { days, byCard, points } = cardIndex();
  return { days: days.length, cards: byCard.size, points, first: days[0], last: days[days.length - 1] };
}

// ── Writers ──────────────────────────────────────────────────────────────────
// Atomic (write a temp file, then rename), and refusing to replace a day with
// nothing: an import that priced no cards keeps the day's previous file.
function writeAtomic(sub: string, iso: string, body: string): string {
  fs.mkdirSync(dirOf(sub), { recursive: true });
  const target = fileOf(sub, iso);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, target);
  return target;
}

const sortedObject = <V>(entries: Iterable<[string, V]>): Record<string, V> =>
  Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** Writes (or replaces) one Sydney day of the card series. */
export function writeCardHistoryDay(day: Date, prices: Iterable<[string, number]>): { file: string; count: number } | null {
  const clean = [...prices].filter(([id, cents]) => id && Number.isInteger(cents) && cents > 0);
  if (!clean.length) return null;
  const iso = isoDay(day);
  const file: CardDayFile = { day: iso, currency: "USD", basis: CARD_HISTORY_BASIS, prices: sortedObject(clean) };
  const written = writeAtomic(CARD_HISTORY_SUBDIR, iso, `${JSON.stringify(file, null, 2)}\n`);
  resetPriceHistoryStore();
  return { file: written, count: clean.length };
}

/** Writes (or replaces) one Sydney day of the sealed series. */
export function writeSealedHistoryDay(
  day: Date,
  rows: Iterable<{ groupKey: string; country: string; lowestPriceCents: number }>,
): { file: string; count: number } | null {
  const byGroup = new Map<string, [string, number][]>();
  let count = 0;
  for (const r of rows) {
    if (!r.groupKey || !r.country || !Number.isInteger(r.lowestPriceCents) || r.lowestPriceCents <= 0) continue;
    (byGroup.get(r.groupKey) ?? byGroup.set(r.groupKey, []).get(r.groupKey)!).push([r.country, r.lowestPriceCents]);
    count++;
  }
  if (!count) return null;
  const iso = isoDay(day);
  const file: SealedDayFile = {
    day: iso,
    basis: SEALED_HISTORY_BASIS,
    prices: sortedObject([...byGroup].map(([g, list]) => [g, sortedObject(list)] as [string, Record<string, number>])),
  };
  return { file: writeAtomic(SEALED_HISTORY_SUBDIR, iso, `${JSON.stringify(file, null, 2)}\n`), count };
}

/** Writes (or replaces) one Sydney day of the graded-slab series. */
export function writeGradedHistoryDay(
  day: Date,
  rows: Iterable<{ cardId: string; grade: string; usdCents: number }>,
): { file: string; count: number } | null {
  const byCard = new Map<string, Map<string, number>>();
  let count = 0;
  for (const r of rows) {
    if (!r.cardId || !r.grade || !Number.isInteger(r.usdCents) || r.usdCents <= 0) continue;
    const m = byCard.get(r.cardId) ?? byCard.set(r.cardId, new Map()).get(r.cardId)!;
    const prev = m.get(r.grade);
    if (prev == null) count++;
    if (prev == null || r.usdCents < prev) m.set(r.grade, r.usdCents);
  }
  if (!count) return null;
  const iso = isoDay(day);
  const file: GradedDayFile = {
    day: iso,
    currency: "USD",
    basis: GRADED_HISTORY_BASIS,
    prices: sortedObject([...byCard].map(([id, m]) => [id, sortedObject(m)] as [string, Record<string, number>])),
  };
  return { file: writeAtomic(GRADED_HISTORY_SUBDIR, iso, `${JSON.stringify(file, null, 2)}\n`), count };
}

/** One card's graded points, oldest first. Read on demand from the day files. */
export function gradedHistoryRows(cardId: string): GradedHistoryRow[] {
  const out: GradedHistoryRow[] = [];
  for (const iso of historyDays(GRADED_HISTORY_SUBDIR)) {
    const byGrade = readDay<GradedDayFile>(GRADED_HISTORY_SUBDIR, iso)?.prices?.[cardId];
    if (!byGrade) continue;
    const day = dayDate(iso);
    for (const [grade, cents] of Object.entries(byGrade)) {
      if (Number.isInteger(cents) && cents > 0) out.push({ cardId, grade, day, lowestPriceCents: cents });
    }
  }
  return out;
}

/** Sealed points, oldest first. Small (tens of groups), so read on demand. */
export function sealedHistoryRows(opts: { since?: Date } = {}): SealedHistoryRow[] {
  const since = opts.since?.getTime() ?? Number.NEGATIVE_INFINITY;
  const out: SealedHistoryRow[] = [];
  for (const iso of historyDays(SEALED_HISTORY_SUBDIR)) {
    const day = dayDate(iso);
    if (day.getTime() < since) continue;
    const file = readDay<SealedDayFile>(SEALED_HISTORY_SUBDIR, iso);
    for (const [groupKey, byCountry] of Object.entries(file?.prices ?? {})) {
      for (const [country, cents] of Object.entries(byCountry)) {
        if (Number.isInteger(cents) && cents > 0) out.push({ groupKey, country, day, lowestPriceCents: cents });
      }
    }
  }
  return out;
}

/** The newest Sydney day of the sealed series. */
export function sealedHistoryLatestDay(): Date | undefined {
  const days = historyDays(SEALED_HISTORY_SUBDIR);
  return days.length ? dayDate(days[days.length - 1]) : undefined;
}
