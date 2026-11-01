// THE POKÉMON SECTION'S DATA, AS FILES IN THIS REPOSITORY (2026-11-01, DECISIONS.md
// "The Pokémon section returns, served from files in the repository").
//
// Until 2026-10-23 this lived in its own Neon project (POKEMON_DATABASE_URL).
// That project stopped answering, every /pokemon page was a 500 and the section
// was switched off. Everything in it is public (TCGplayer, Cardmarket and eBay
// prices that the pages print anyway), so it now lives where the Riftbound
// price history lives: JSON under data/pokemon/, written by the daily import
// (.github/workflows/pokemon-import.yml) and committed to main by
// scripts/pokemon/publish-data.sh. No database, no transfer allowance to burn.
//
//   sets.json          every expansion in scope (TCGplayer groups)
//   products.json      every sealed product ever seen; `active: false` once gone
//   offers.json        the CURRENT price per (product, market, source)
//   ebay-checks.json   when each (product, market) pair was last searched on eBay
//   last-run.json      the last import: when, whether it worked, its summary
//   history/YYYY-MM-DD.json  one point per product and series that UTC day
//
// HOW IT REACHES THE SITE. The commits carry no deploy marker, so they ride the
// next daily release, which bundles data/pokemon into the /pokemon functions
// only (next.config.js outputFileTracingIncludes). Every read below is a local
// file read, parsed once per warm function. Never write anything private here:
// this directory is published with the source.
import fs from "node:fs";
import path from "node:path";

// POKEMON_DATA_DIR points the store elsewhere: tests use a fixture directory,
// and nothing in production sets it.
export const POKEMON_DATA_DIR = (): string => process.env.POKEMON_DATA_DIR || path.join(process.cwd(), "data", "pokemon");

export interface StoredSet {
  id: number; // TCGplayer groupId
  slug: string;
  name: string;
  code: string | null;
  series: string;
  releasedOn: string | null; // YYYY-MM-DD
}

export interface StoredProduct {
  id: number; // TCGplayer productId
  slug: string; // stable once written: the importer never renames a product's slug
  name: string;
  setId: number | null;
  groupId: number;
  kind: string;
  series: string;
  imageUrl: string | null;
  tcgplayerUrl: string;
  releasedOn: string | null;
  presale: boolean;
  contents: string[];
  packCount: number | null;
  packCountFrom: string | null;
  upc: string | null;
  cardmarketId: number | null;
  active: boolean;
  firstSeenAt: string; // ISO
}

export interface StoredOffer {
  productId: number;
  market: string;
  source: string;
  priceCents: number;
  currency: string;
  shippingCents: number | null;
  url: string;
  title: string | null;
  inStock: boolean;
  checkedAt: string; // ISO
}

export interface StoredEbayCheck {
  productId: number;
  market: string;
  checkedAt: string;
  matched: boolean;
}

export interface StoredRun {
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  summary: unknown;
}

export type HistorySeries = "tcgplayer_market" | "cardmarket_trend";
export interface HistoryDayFile {
  day: string;
  basis: string;
  series: Partial<Record<HistorySeries, Record<string, number>>>;
}
export const HISTORY_BASIS =
  "One point per product and UTC day: TCGplayer's market price (US cents) and, when enabled, Cardmarket's trend (EUR cents).";

export interface PokemonData {
  sets: StoredSet[];
  products: StoredProduct[];
  offers: StoredOffer[];
  ebayChecks: StoredEbayCheck[];
  lastRun: StoredRun | null;
}

const FILES = {
  sets: "sets.json",
  products: "products.json",
  offers: "offers.json",
  ebayChecks: "ebay-checks.json",
  lastRun: "last-run.json",
} as const;
const HISTORY = "history";
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;

function readJson<T>(file: string, fallback: T): T {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
  // A file that exists but does not parse THROWS: that is a broken commit, never "no data".
  return JSON.parse(raw) as T;
}

/** Does this deployment carry a catalogue at all? (No file → the section stays off.) */
export function pokemonDataPresent(dir = POKEMON_DATA_DIR()): boolean {
  return fs.existsSync(path.join(dir, FILES.products));
}

/** Everything but the history, straight from disk. The importer's starting point. */
export function readPokemonData(dir = POKEMON_DATA_DIR()): PokemonData {
  return {
    sets: readJson<StoredSet[]>(path.join(dir, FILES.sets), []),
    products: readJson<StoredProduct[]>(path.join(dir, FILES.products), []),
    offers: readJson<StoredOffer[]>(path.join(dir, FILES.offers), []),
    ebayChecks: readJson<StoredEbayCheck[]>(path.join(dir, FILES.ebayChecks), []),
    lastRun: readJson<StoredRun | null>(path.join(dir, FILES.lastRun), null),
  };
}

// One JSON row per line: a day's diff in git is the rows that changed, not one
// rewritten megabyte-long line.
function rowsJson(rows: readonly unknown[]): string {
  return rows.length ? `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n` : "[]\n";
}

function writeFile(file: string, body: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
}

/** Writes everything but the history, in a stable order so unchanged rows never show in a diff. */
export function writePokemonData(data: PokemonData, dir = POKEMON_DATA_DIR()): void {
  const byId = <T extends { id: number }>(a: T, b: T) => a.id - b.id;
  const offerKey = (o: StoredOffer) => `${String(o.productId).padStart(10, "0")}|${o.market}|${o.source}`;
  const checkKey = (c: StoredEbayCheck) => `${String(c.productId).padStart(10, "0")}|${c.market}`;
  writeFile(path.join(dir, FILES.sets), rowsJson([...data.sets].sort(byId)));
  writeFile(path.join(dir, FILES.products), rowsJson([...data.products].sort(byId)));
  writeFile(path.join(dir, FILES.offers), rowsJson([...data.offers].sort((a, b) => offerKey(a).localeCompare(offerKey(b)))));
  writeFile(path.join(dir, FILES.ebayChecks), rowsJson([...data.ebayChecks].sort((a, b) => checkKey(a).localeCompare(checkKey(b)))));
  writeFile(path.join(dir, FILES.lastRun), `${JSON.stringify(data.lastRun, null, 2)}\n`);
}

/** Every UTC day with a history file, oldest first. */
export function pokemonHistoryDays(dir = POKEMON_DATA_DIR()): string[] {
  try {
    return fs
      .readdirSync(path.join(dir, HISTORY))
      .map((f) => DAY_FILE.exec(f)?.[1])
      .filter((d): d is string => !!d)
      .sort();
  } catch {
    return [];
  }
}

export function readHistoryDay(day: string, dir = POKEMON_DATA_DIR()): HistoryDayFile | null {
  return readJson<HistoryDayFile | null>(path.join(dir, HISTORY, `${day}.json`), null);
}

/**
 * Replaces ONE series of one UTC day (a re-run the same day wins, as the
 * database's same-day replace did), keeping the day's other series.
 */
export function writeHistorySeries(day: string, series: HistorySeries, points: Record<string, number>, dir = POKEMON_DATA_DIR()): void {
  const file = readHistoryDay(day, dir) ?? { day, basis: HISTORY_BASIS, series: {} };
  const sorted = Object.fromEntries(Object.entries(points).sort(([a], [b]) => Number(a) - Number(b)));
  file.series[series] = sorted;
  writeFile(path.join(dir, HISTORY, `${day}.json`), `${JSON.stringify(file)}\n`);
}

// ── Read side: parsed once per warm function ─────────────────────────────────
// The files only change with a deploy, so a function never needs to re-read
// them. Tests (and the importer) call clearPokemonStore() after writing.
type Loaded = { dir: string; data: PokemonData };
type HistoryIndex = { dir: string; byProduct: Map<number, { day: string; cents: number }[]> };
const g = globalThis as unknown as { __pokemonStore?: Loaded; __pokemonHistory?: HistoryIndex };

export function pokemonData(): PokemonData {
  const dir = POKEMON_DATA_DIR();
  if (g.__pokemonStore?.dir !== dir) g.__pokemonStore = { dir, data: readPokemonData(dir) };
  return g.__pokemonStore.data;
}

/** TCGplayer market-price history for one product, oldest first, from day `sinceDay` (YYYY-MM-DD). */
export function productHistory(productId: number, sinceDay: string): { day: string; cents: number }[] {
  const dir = POKEMON_DATA_DIR();
  if (g.__pokemonHistory?.dir !== dir) {
    const byProduct = new Map<number, { day: string; cents: number }[]>();
    for (const day of pokemonHistoryDays(dir)) {
      const points = readHistoryDay(day, dir)?.series.tcgplayer_market ?? {};
      for (const [id, cents] of Object.entries(points)) {
        const list = byProduct.get(Number(id)) ?? [];
        list.push({ day, cents });
        byProduct.set(Number(id), list);
      }
    }
    g.__pokemonHistory = { dir, byProduct };
  }
  return (g.__pokemonHistory.byProduct.get(productId) ?? []).filter((p) => p.day >= sinceDay);
}

export function clearPokemonStore(): void {
  g.__pokemonStore = undefined;
  g.__pokemonHistory = undefined;
}
