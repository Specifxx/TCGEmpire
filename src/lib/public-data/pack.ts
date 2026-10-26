// Packs a public data snapshot (the data/public/ layout) into the gzipped deploy
// copy (format.ts, "PACKED FOR THE DEPLOY"). Script-side: run by
// scripts/pack-public-data.ts in `npm run build`; nothing under src/app imports it.
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { FILES, LISTING_SHARDS, listingShard, PACK_MARKER } from "./format";

export interface PackResult {
  cards: number;
  files: number;
  bytesIn: number;
  bytesOut: number;
}

/** Writes the pack of `src` to `out` (replacing it). Null when `src` holds no snapshot. */
export function packPublicData(src: string, out: string): PackResult | null {
  fs.rmSync(out, { recursive: true, force: true });
  if (!fs.existsSync(path.join(src, FILES.meta))) return null;
  fs.mkdirSync(path.join(out, FILES.listingsDir), { recursive: true });
  const gz = (s: string | Buffer) => gzipSync(s, { level: 6 });
  const result: PackResult = { cards: 0, files: 0, bytesIn: 0, bytesOut: 0 };
  const write = (rel: string, body: Buffer | string) => {
    const buf = typeof body === "string" ? Buffer.from(body) : body;
    fs.writeFileSync(path.join(out, rel), buf);
    result.bytesOut += buf.length;
    result.files++;
  };

  for (const name of Object.values(FILES)) {
    if (name === FILES.listingsDir || name === FILES.meta) continue;
    const file = path.join(src, name);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file);
    result.bytesIn += raw.length;
    write(`${name}.gz`, gz(raw));
  }

  const shards = new Map<string, Record<string, unknown>>();
  const listings = path.join(src, FILES.listingsDir);
  const cardFiles = fs.existsSync(listings) ? fs.readdirSync(listings).filter((f) => f.endsWith(".json")).sort() : [];
  for (const f of cardFiles) {
    const raw = fs.readFileSync(path.join(listings, f), "utf8");
    result.bytesIn += raw.length;
    const cardId = f.slice(0, -".json".length);
    const shard = listingShard(cardId);
    let byCard = shards.get(shard);
    if (!byCard) shards.set(shard, (byCard = {}));
    byCard[cardId] = JSON.parse(raw);
  }
  for (const [shard, byCard] of [...shards].sort(([a], [b]) => (a < b ? -1 : 1))) {
    write(path.join(FILES.listingsDir, `${shard}.json.gz`), gz(JSON.stringify(byCard)));
  }
  result.cards = cardFiles.length;

  // meta.json last, then the marker: a pack interrupted half-way has no marker
  // and is never read.
  const meta = fs.readFileSync(path.join(src, FILES.meta));
  result.bytesIn += meta.length;
  write(FILES.meta, meta);
  write(PACK_MARKER, JSON.stringify({ listingShards: LISTING_SHARDS, cards: cardFiles.length }) + "\n");
  return result;
}
