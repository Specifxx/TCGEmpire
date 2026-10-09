// Reads data/public/ (lib/public-data/format.ts) into memory for the query
// engine. SERVER ONLY (node:fs).
//
// The files are bundled with each release (next.config.js
// outputFileTracingIncludes), so for the life of a server instance they never
// change: everything is read at most once per instance and kept. cards.json and
// the small sealed/eBay files load on first use; listings load one card file at
// a time, and the whole listings directory only when a query cannot be narrowed
// to a set of cards (store statistics, whole-market minimums).
import fs from "node:fs";
import path from "node:path";
import { modelInfo, type ModelName } from "./models";
import type { Row, RowSource } from "./engine";
import {
  FILES,
  OMITTED_COLUMNS,
  publicDataDir,
  PUBLIC_DATA_FORMAT,
  DERIVED_ID,
  listingFile,
  stableId,
  type PublicDataMeta,
} from "./format";

/** The files are missing, unreadable or in a format this code does not know. */
export class PublicDataUnavailable extends Error {
  readonly publicDataUnavailable = true;
  constructor(message: string) {
    super(`[public-data] unavailable: ${message}`);
    this.name = "PublicDataUnavailable";
  }
}

function readJson<T>(file: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (err) {
    throw new PublicDataUnavailable(`${path.relative(process.cwd(), file)}: ${(err as Error).message}`);
  }
}

/** Turn a stored row back into what Prisma would return. */
function revive(model: ModelName, raw: Record<string, unknown>, extra: Record<string, unknown>, meta: PublicDataMeta): Row {
  const info = modelInfo(model);
  const row: Row = { ...extra, ...raw };
  for (const f of OMITTED_COLUMNS[model] ?? []) row[f] = null;
  if ((model === "RetailerPrice" || model === "SealedListing") && (row.lastSeen === undefined || row.lastSeen === null)) {
    row.lastSeen = meta.seen[model]?.[`${row.retailer}|${row.country}`] ?? meta.generatedAt;
  }
  for (const f of info.dateFields) {
    const v = row[f];
    if (typeof v === "string") row[f] = new Date(v);
  }
  for (const f of info.scalarFields) if (row[f.name] === undefined) row[f.name] = null;
  if (DERIVED_ID[model]) row.id = stableId(model, row);
  return row;
}

class FileSource implements RowSource {
  readonly meta: PublicDataMeta;
  private readonly dir: string;
  private readonly tables = new Map<ModelName, Row[]>();
  private readonly indexes = new Map<string, Map<unknown, Row[]>>();
  private readonly listingsByCard = new Map<string, Row[]>();
  private allListingsLoaded = false;

  constructor(dir: string) {
    this.dir = dir;
    this.meta = readJson<PublicDataMeta>(path.join(dir, FILES.meta));
    if (this.meta.format !== PUBLIC_DATA_FORMAT) {
      throw new PublicDataUnavailable(`format ${this.meta.format}, this build reads ${PUBLIC_DATA_FORMAT}`);
    }
  }

  private listingsFor(cardId: string): Row[] {
    const hit = this.listingsByCard.get(cardId);
    if (hit) return hit;
    let rows: Row[] = [];
    if (!this.allListingsLoaded && typeof cardId === "string" && /^[A-Za-z0-9_-]+$/.test(cardId)) {
      const file = path.join(this.dir, FILES.listingsDir, listingFile(cardId));
      if (fs.existsSync(file)) {
        rows = readJson<Record<string, unknown>[]>(file).map((r) => revive("RetailerPrice", r, { cardId }, this.meta));
      }
    }
    this.listingsByCard.set(cardId, rows);
    return rows;
  }

  all(model: ModelName): readonly Row[] {
    const hit = this.tables.get(model);
    if (hit) return hit;
    let rows: Row[];
    if (model === "Card") {
      rows = readJson<Record<string, unknown>[]>(path.join(this.dir, FILES.cards)).map((r) => revive("Card", r, {}, this.meta));
    } else if (model === "RetailerPrice") {
      const dir = path.join(this.dir, FILES.listingsDir);
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];
      rows = [];
      for (const f of files) {
        const cardId = f.slice(0, -".json".length);
        const list = this.listingsByCard.get(cardId) ??
          readJson<Record<string, unknown>[]>(path.join(dir, f)).map((r) => revive("RetailerPrice", r, { cardId }, this.meta));
        this.listingsByCard.set(cardId, list);
        rows.push(...list);
      }
      this.allListingsLoaded = true;
    } else {
      const file = path.join(this.dir, FILES[model]);
      rows = fs.existsSync(file) ? readJson<Record<string, unknown>[]>(file).map((r) => revive(model, r, {}, this.meta)) : [];
    }
    this.tables.set(model, rows);
    return rows;
  }

  byField(model: ModelName, field: string, values: readonly unknown[]): readonly Row[] {
    if (model === "RetailerPrice" && field === "cardId") {
      const out: Row[] = [];
      for (const v of new Set(values)) if (typeof v === "string") out.push(...this.listingsFor(v));
      return out;
    }
    const key = `${model}.${field}`;
    let index = this.indexes.get(key);
    if (!index) {
      index = new Map();
      for (const r of this.all(model)) {
        const v = r[field];
        let list = index.get(v);
        if (!list) index.set(v, (list = []));
        list.push(r);
      }
      this.indexes.set(key, index);
    }
    const out: Row[] = [];
    for (const v of new Set(values)) out.push(...(index.get(v) ?? []));
    return out;
  }
}

const slot = globalThis as unknown as { __publicDataSource?: { dir: string; source: FileSource } };

/** The bundled public data, loaded once per instance. Throws PublicDataUnavailable. */
export function publicDataSource(dir = publicDataDir()): FileSource {
  if (slot.__publicDataSource?.dir === dir) return slot.__publicDataSource.source;
  const source = new FileSource(dir);
  slot.__publicDataSource = { dir, source };
  return source;
}

/** For tests: forget the loaded files. */
export function resetPublicDataSource(): void {
  slot.__publicDataSource = undefined;
}
