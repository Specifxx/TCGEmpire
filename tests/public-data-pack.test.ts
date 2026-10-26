// The deploy bundles a gzipped pack of data/public/ (scripts/pack-public-data.ts,
// format.ts "PACKED FOR THE DEPLOY"), not the 1,700 committed files. These pin
// that the pack reads back as exactly the committed rows, that a stale or
// half-written pack is never read, and that next.config.js bundles the pack and
// keeps data/public/ out of the functions when it exists.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PUBLIC_MODELS } from "../src/lib/public-data/models";
import { publicDataSource, resetPublicDataSource } from "../src/lib/public-data/store";
import { listingShard, LISTING_SHARDS, PACK_MARKER, publicDataDir } from "../src/lib/public-data/format";
import { packPublicData } from "../src/lib/public-data/pack";

const committed = join(process.cwd(), "data", "public");
const scratch = mkdtempSync(join(tmpdir(), "rc-public-pack-"));
test.after(() => rmSync(scratch, { recursive: true, force: true }));

test("listing shards are stable and in range", () => {
  assert.equal(listingShard("cm1abc"), listingShard("cm1abc"));
  for (const id of ["a", "Jinx", "cmb9x7k2p0001", "zzz"]) {
    const n = Number(listingShard(id));
    assert.ok(Number.isInteger(n) && n >= 0 && n < LISTING_SHARDS, id);
  }
});

test("the pack reads back as exactly the committed snapshot, every table, every card", { skip: !existsSync(join(committed, "meta.json")) }, () => {
  const out = join(scratch, "pack");
  const r = packPublicData(committed, out);
  assert.ok(r && r.files <= LISTING_SHARDS + 10, "a few dozen files, not one per card");
  assert.ok(r.bytesOut < r.bytesIn / 4);
  resetPublicDataSource();
  const plain = publicDataSource(committed);
  const packed = publicDataSource(out);
  assert.notEqual(plain, packed);
  // Per card first (the card page's path loads one shard), then whole tables.
  const cards = plain.all("Card") as { id: string }[];
  for (const c of cards.slice(0, 50)) {
    assert.deepEqual(packed.byField("RetailerPrice", "cardId", [c.id]), plain.byField("RetailerPrice", "cardId", [c.id]), c.id);
  }
  assert.deepEqual(packed.byField("RetailerPrice", "cardId", ["no-such-card"]), []);
  for (const model of PUBLIC_MODELS) assert.deepEqual(packed.all(model), plain.all(model), model);
  resetPublicDataSource();
});

test("the reader takes the pack only when it is complete and matches the committed snapshot", () => {
  const cwd = process.cwd();
  const root = join(scratch, "repo");
  const snap = join(root, "data", "public");
  const pack = join(root, ".public-data-pack");
  const saved = process.env.PUBLIC_DATA_DIR;
  delete process.env.PUBLIC_DATA_DIR;
  try {
    mkdirSync(snap, { recursive: true });
    writeFileSync(join(snap, "meta.json"), JSON.stringify({ format: 1, generatedAt: "2026-10-26T07:00:00.000Z" }));
    process.chdir(root);
    assert.equal(publicDataDir(), snap, "no pack: the committed files");
    packPublicData(snap, pack);
    assert.equal(publicDataDir(), pack, "a fresh pack");
    writeFileSync(join(snap, "meta.json"), JSON.stringify({ format: 1, generatedAt: "2026-10-27T07:00:00.000Z" }));
    assert.equal(publicDataDir(), snap, "a pack of an older snapshot is ignored");
    rmSync(snap, { recursive: true, force: true });
    assert.equal(publicDataDir(), pack, "on Vercel only the pack is bundled");
    rmSync(join(pack, PACK_MARKER));
    assert.notEqual(publicDataDir(), pack, "no marker, never read");
  } finally {
    process.chdir(cwd);
    if (saved !== undefined) process.env.PUBLIC_DATA_DIR = saved;
  }
});

test("next.config.js bundles the pack instead of data/public/ when it exists, and the build writes it first", () => {
  const src = readFileSync("next.config.js", "utf8");
  assert.match(src, /PUBLIC_DATA_PACKED \? \["\.\/\.public-data-pack\/\*\*\/\*"\] : \["\.\/data\/public\/\*\*\/\*\.json"\]/);
  assert.match(src, /outputFileTracingExcludes: PUBLIC_DATA_PACKED \? \{ "\/\*\*": \["\.\/data\/public\/\*\*"\] \}/);
  const build = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: { build: string } }).scripts.build;
  assert.match(build, /tsx scripts\/pack-public-data\.ts && next build"?$/);
  assert.match(readFileSync(".gitignore", "utf8"), /^\/\.public-data-pack\/$/m, "the pack is never committed");
});

test("a store-pinned listing query reads the retailer index and answers exactly what a full scan does", { skip: !existsSync(join(committed, "meta.json")) }, async () => {
  const { runPublicQuery } = await import("../src/lib/public-data/engine");
  resetPublicDataSource();
  const src = publicDataSource(committed);
  const all = src.all("RetailerPrice") as { retailer: string; inStock: boolean; priceCents: number }[];
  const stores = [...new Set(all.map((r) => r.retailer))].slice(0, 5);
  assert.ok(stores.length > 0);
  for (const key of stores) {
    const scan = all.filter((r) => r.retailer === key && r.inStock);
    const count = runPublicQuery(src, "RetailerPrice", "count", { where: { retailer: key, inStock: true } });
    assert.equal(count, scan.length, key);
    const rows = runPublicQuery(src, "RetailerPrice", "findMany", { where: { retailer: key, inStock: true }, orderBy: { priceCents: "asc" }, take: 24, select: { priceCents: true } }) as { priceCents: number }[];
    assert.deepEqual(rows.map((r) => r.priceCents), scan.map((r) => r.priceCents).sort((a, b) => a - b).slice(0, 24), key);
  }
  resetPublicDataSource();
});
