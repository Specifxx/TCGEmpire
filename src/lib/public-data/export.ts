// Builds the contents of data/public/ from the public tables' rows. PURE: no
// database, no file system — scripts/export-public-data.ts reads Neon and
// writes what this returns, and tests feed it fixtures and read the result back
// through the store and the engine.
import { modelInfo, type ModelName } from "./models";
import {
  DERIVED_ID,
  FILES,
  OMITTED_COLUMNS,
  PUBLIC_DATA_FORMAT,
  RANKED_COLUMNS,
  SORT_KEY,
  denseRanks,
  listingFile,
  minuteIso,
  seenKey,
  serializeRows,
  type PublicDataMeta,
} from "./format";

export type Tables = Partial<Record<ModelName, Record<string, unknown>[]>>;

function sortVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return String(v).padStart(16, "0");
  return String(v);
}

function sorted(model: ModelName, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const keys = SORT_KEY[model];
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const x = sortVal(a[k]);
      const y = sortVal(b[k]);
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  });
}

/** One stored row: schema-ordered public scalars, minus what the reader rebuilds. */
function storedRow(
  model: ModelName,
  row: Record<string, unknown>,
  opts: { drop?: readonly string[]; seen?: Record<string, string>; ranks?: Record<string, Map<number, number>> },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const omitted = new Set([...(OMITTED_COLUMNS[model] ?? []), ...(opts.drop ?? [])]);
  if (DERIVED_ID[model]) omitted.add("id");
  for (const f of modelInfo(model).scalarFields) {
    if (omitted.has(f.name)) continue;
    let v = row[f.name];
    if (v === undefined) continue;
    if (opts.ranks?.[f.name] && typeof v === "number") v = opts.ranks[f.name].get(v) ?? 0;
    if (v instanceof Date) v = v.toISOString();
    if (f.name === "lastSeen" && opts.seen && v !== null) {
      const m = minuteIso(v as string);
      if (opts.seen[seenKey(row)] === m) continue;
      v = m;
    }
    out[f.name] = v;
  }
  return out;
}

/** The most common import minute of each store: what its rows' lastSeen collapses to. */
function storeMinutes(rows: Record<string, unknown>[]): Record<string, string> {
  const tally = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!r.lastSeen) continue;
    const k = seenKey(r);
    const m = minuteIso(r.lastSeen as Date | string);
    let t = tally.get(k);
    if (!t) tally.set(k, (t = new Map()));
    t.set(m, (t.get(m) ?? 0) + 1);
  }
  const out: Record<string, string> = {};
  for (const [k, t] of [...tally.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    out[k] = [...t.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0][0];
  }
  return out;
}

/**
 * Every file of data/public/, keyed by its path relative to that directory.
 * Listings files exist only for cards that have listings.
 */
export function buildPublicFiles(tables: Tables, opts: { generatedAt: Date; source: string }): Map<string, string> {
  const files = new Map<string, string>();
  const counts: PublicDataMeta["counts"] = {};
  const seen: PublicDataMeta["seen"] = {};

  const cards = tables.Card ?? [];
  const ranks: Record<string, Map<number, number>> = {};
  for (const col of RANKED_COLUMNS.Card ?? []) ranks[col] = denseRanks(cards.map((c) => Number(c[col] ?? 0)));
  files.set(FILES.cards, serializeRows(sorted("Card", cards).map((c) => storedRow("Card", c, { ranks }))));
  counts.Card = cards.length;

  const listings = tables.RetailerPrice ?? [];
  seen.RetailerPrice = storeMinutes(listings);
  const byCard = new Map<string, Record<string, unknown>[]>();
  for (const r of listings) {
    const id = String(r.cardId);
    let list = byCard.get(id);
    if (!list) byCard.set(id, (list = []));
    list.push(r);
  }
  for (const [cardId, rows] of [...byCard.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const stored = sorted("RetailerPrice", rows).map((r) => storedRow("RetailerPrice", r, { drop: ["cardId"], seen: seen.RetailerPrice }));
    files.set(`${FILES.listingsDir}/${listingFile(cardId)}`, serializeRows(stored));
  }
  counts.RetailerPrice = listings.length;

  const sealed = tables.SealedListing ?? [];
  seen.SealedListing = storeMinutes(sealed);
  files.set(FILES.SealedListing, serializeRows(sorted("SealedListing", sealed).map((r) => storedRow("SealedListing", r, { seen: seen.SealedListing }))));
  counts.SealedListing = sealed.length;

  for (const model of ["SealedGroupFirstSeen", "EbayAdListing", "EbayGradedListing", "EbayAuctionListing"] as const) {
    const rows = tables[model] ?? [];
    files.set(FILES[model], serializeRows(sorted(model, rows).map((r) => storedRow(model, r, {}))));
    counts[model] = rows.length;
  }

  const meta: PublicDataMeta = {
    format: PUBLIC_DATA_FORMAT,
    generatedAt: opts.generatedAt.toISOString(),
    source: opts.source,
    counts,
    seen,
  };
  files.set(FILES.meta, `${JSON.stringify(meta, null, 2)}\n`);
  return files;
}
