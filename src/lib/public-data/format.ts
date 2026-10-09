// The on-disk format of data/public/ — shared by the writer
// (scripts/export-public-data.ts) and the reader (lib/public-data/store.ts), so
// the two cannot drift. Bump PUBLIC_DATA_FORMAT on any incompatible change: the
// reader refuses a format it does not know and the site asks Neon instead.
//
//   data/public/meta.json                 format, when, from which project, row counts,
//                                          and each store's last import time
//   data/public/cards.json                every Card (public columns; see below)
//   data/public/listings/<cardId>.json    that card's RetailerPrice rows
//   data/public/sealed-listings.json      SealedListing
//   data/public/sealed-first-seen.json    SealedGroupFirstSeen
//   data/public/ebay-ads.json             EbayAdListing
//   data/public/ebay-graded.json          EbayGradedListing
//   data/public/ebay-auctions.json        EbayAuctionListing (a fallback snapshot; the
//                                          board reads Neon while it answers)
//
// KEPT SMALL IN GIT. Every file holds one row per line, sorted by a stable key,
// with the fields in schema order, so an import changes only the lines whose
// price or stock changed and git stores a small delta, not a new copy:
//   • row ids are not stored. The importers delete and re-insert listings, so
//     their database ids change every run; a stable id is derived from the
//     row's own key on load (stableId below).
//   • a listing's lastSeen is stored only when it differs from its store's
//     import time (meta.seen), because one import stamps every row of a store
//     with the same minute.
//   • Card.viewCount / Card.searchCount are NOT published. They become
//     order-preserving dense ranks (0 stays 0), which keeps every "popular"
//     sort and `> 0` filter exact without publishing traffic numbers.
//     Card.lastViewedAt and Card.ebayCheckedAt are left out (null).
import { createHash } from "node:crypto";
import path from "node:path";
import type { ModelName } from "./models";

export const PUBLIC_DATA_FORMAT = 1;

/** data/public/, or PUBLIC_DATA_DIR (tests and the exporter point it elsewhere). Read per call. */
export function publicDataDir(): string {
  return process.env.PUBLIC_DATA_DIR || path.join(process.cwd(), "data", "public");
}

export const FILES = {
  meta: "meta.json",
  cards: "cards.json",
  listingsDir: "listings",
  SealedListing: "sealed-listings.json",
  SealedGroupFirstSeen: "sealed-first-seen.json",
  EbayAdListing: "ebay-ads.json",
  EbayGradedListing: "ebay-graded.json",
  EbayAuctionListing: "ebay-auctions.json",
} as const;

export interface PublicDataMeta {
  format: number;
  generatedAt: string;
  /** The operational project the export read (db-chains.ts head at the time). */
  source: string;
  counts: Partial<Record<ModelName, number>>;
  /** `${retailer}|${country}` → that store's import minute, per model with a lastSeen. */
  seen: Partial<Record<"RetailerPrice" | "SealedListing", Record<string, string>>>;
}

/** Columns that are never written to data/public/ (null on read). */
export const OMITTED_COLUMNS: Partial<Record<ModelName, readonly string[]>> = {
  Card: ["lastViewedAt", "ebayCheckedAt"],
};

/** Columns published only as order-preserving ranks. */
export const RANKED_COLUMNS: Partial<Record<ModelName, readonly string[]>> = {
  Card: ["viewCount", "searchCount"],
};

/** Models whose database id churns every import, and the fields that identify a row instead. */
export const DERIVED_ID: Partial<Record<ModelName, readonly string[]>> = {
  RetailerPrice: ["cardId", "retailer", "country", "condition", "isFoil", "url"],
  SealedListing: ["groupKey", "retailer", "country", "url"],
  EbayAdListing: ["cardId", "country", "rank"],
  EbayGradedListing: ["itemId", "country"],
};

/** Row order inside each file (also the order a scan returns them in). */
export const SORT_KEY: Record<ModelName, readonly string[]> = {
  Card: ["setCode", "collectorNumber", "id"],
  RetailerPrice: ["country", "retailer", "condition", "isFoil", "url"],
  SealedListing: ["country", "groupKey", "retailer", "url"],
  SealedGroupFirstSeen: ["groupKey", "country"],
  EbayAdListing: ["cardId", "country", "rank"],
  EbayGradedListing: ["cardId", "country", "itemId"],
  EbayAuctionListing: ["country", "endsAt", "itemId"],
};

/** Deterministic id for a row whose database id is not stable. */
export function stableId(model: ModelName, row: Record<string, unknown>): string {
  const fields = DERIVED_ID[model];
  if (!fields) return String(row.id);
  const key = fields.map((f) => (row[f] === null || row[f] === undefined ? "" : String(row[f]))).join("\u0000");
  return `pd_${createHash("sha1").update(`${model}\u0000${key}`).digest("hex").slice(0, 24)}`;
}

/** Minute precision: one import stamps a store's rows within the same minute. */
export function minuteIso(d: Date | string): string {
  const t = new Date(d);
  t.setUTCSeconds(0, 0);
  return t.toISOString();
}

export const seenKey = (row: Record<string, unknown>) => `${row.retailer}|${row.country}`;

/** Order-preserving dense ranks: 0 stays 0, equal values share a rank. */
export function denseRanks(values: readonly number[]): Map<number, number> {
  const distinct = [...new Set(values.filter((v) => v > 0))].sort((a, b) => a - b);
  const out = new Map<number, number>([[0, 0]]);
  distinct.forEach((v, i) => out.set(v, i + 1));
  return out;
}

/** A listings file name for a card id (ids are cuids: safe as file names). */
export function listingFile(cardId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(cardId)) throw new Error(`[public-data] unsafe card id for a file name: ${cardId}`);
  return `${cardId}.json`;
}

/** One row per line, so git diffs (and deltas) stay line-sized. */
export function serializeRows(rows: readonly Record<string, unknown>[]): string {
  if (!rows.length) return "[]\n";
  return `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`;
}
