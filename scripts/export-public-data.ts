// Exports every PUBLIC table from the operational database into data/public/
// (the file store, src/lib/public-data/). Run by refresh-prices.yml after the
// morning import, by export-public-data.yml on demand, and safe to re-run.
// DECISIONS.md, "Public data moves out of Neon into the repository", 2026-10-09.
//
//   npx tsx scripts/export-public-data.ts      write data/public/ (PUBLIC_DATA_DIR overrides)
//
// A FULL SNAPSHOT. Every run rewrites the whole directory from the database:
// listings files for cards that no longer have a listing are deleted. That is
// what makes the files a faithful copy rather than an accumulation.
//
// VERIFIED. After writing, the files are read back through the same store and
// engine the site uses, and each table's row count, every card's listing count
// and a sample of cards' cheapest prices are compared with what was read from
// the database. Any mismatch fails the run, and a failed run publishes nothing.
//
// COST. One paged read of each public table: the listings table is the bulk
// (~140k narrow rows, roughly 20-30 MB of transfer). It runs once a day, so it
// replaces the site's own reads of the same rows rather than adding to them.
import fs from "node:fs";
import path from "node:path";

// The exporter must read the DATABASE, never the files it is about to replace.
process.env.PUBLIC_DATA_MODE = "db";

import { prisma, OPERATIONAL_URL_SOURCE } from "../src/lib/db";
import { buildPublicFiles, type Tables } from "../src/lib/public-data/export";
import { FILES, publicDataDir } from "../src/lib/public-data/format";
import { modelInfo, PUBLIC_MODELS, type ModelName } from "../src/lib/public-data/models";
import { publicDataSource, resetPublicDataSource } from "../src/lib/public-data/store";
import { runPublicQuery } from "../src/lib/public-data/engine";

const PAGE = 20_000;

type Delegate = { findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]> };

function delegateOf(model: ModelName): Delegate {
  const key = model[0].toLowerCase() + model.slice(1);
  return (prisma as unknown as Record<string, Delegate>)[key];
}

/** Every row of a table, in pages ordered by its primary key, all scalar columns. */
async function readAll(model: ModelName): Promise<Record<string, unknown>[]> {
  const info = modelInfo(model);
  const select = Object.fromEntries(info.scalarFields.map((f) => [f.name, true]));
  const keyFields = info.fields.has("id") ? ["id"] : model === "SealedGroupFirstSeen" ? ["groupKey", "country"] : null;
  if (!keyFields) throw new Error(`no ordering key for ${model}`);
  const out: Record<string, unknown>[] = [];
  for (let skip = 0; ; skip += PAGE) {
    const page = await delegateOf(model).findMany({
      select,
      orderBy: keyFields.map((f) => ({ [f]: "asc" })),
      skip,
      take: PAGE,
    });
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

function writeTree(dir: string, files: Map<string, string>): { written: number; removed: number; bytes: number } {
  fs.mkdirSync(path.join(dir, FILES.listingsDir), { recursive: true });
  let written = 0;
  let bytes = 0;
  for (const [rel, body] of files) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    bytes += Buffer.byteLength(body);
    const prev = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (prev === body) continue;
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, file);
    written++;
  }
  let removed = 0;
  const listingsDir = path.join(dir, FILES.listingsDir);
  for (const f of fs.readdirSync(listingsDir)) {
    if (!files.has(`${FILES.listingsDir}/${f}`)) {
      fs.rmSync(path.join(listingsDir, f));
      removed++;
    }
  }
  return { written, removed, bytes };
}

function verify(dir: string, tables: Tables): string[] {
  resetPublicDataSource();
  const src = publicDataSource(dir);
  const problems: string[] = [];
  for (const model of PUBLIC_MODELS) {
    const want = tables[model]?.length ?? 0;
    const got = runPublicQuery(src, model, "count", {}) as number;
    if (got !== want) problems.push(`${model}: database ${want} rows, files ${got}`);
  }
  // Every card's listing count, and its cheapest in-stock price per market.
  const dbCounts = new Map<string, number>();
  const dbMin = new Map<string, number>();
  for (const r of tables.RetailerPrice ?? []) {
    const id = String(r.cardId);
    dbCounts.set(id, (dbCounts.get(id) ?? 0) + 1);
    if (r.inStock) {
      const k = `${id}|${r.country}`;
      const p = Number(r.priceCents);
      if (!dbMin.has(k) || p < (dbMin.get(k) as number)) dbMin.set(k, p);
    }
  }
  const fileGroups = runPublicQuery(src, "RetailerPrice", "groupBy", { by: ["cardId"], _count: { _all: true } }) as { cardId: string; _count: { _all: number } }[];
  for (const g of fileGroups) if (dbCounts.get(g.cardId) !== g._count._all) problems.push(`listings of ${g.cardId}: database ${dbCounts.get(g.cardId) ?? 0}, files ${g._count._all}`);
  const fileMin = runPublicQuery(src, "RetailerPrice", "groupBy", { by: ["cardId", "country"], where: { inStock: true }, _min: { priceCents: true } }) as { cardId: string; country: string; _min: { priceCents: number } }[];
  if (fileMin.length !== dbMin.size) problems.push(`cheapest-per-market groups: database ${dbMin.size}, files ${fileMin.length}`);
  for (const g of fileMin) if (dbMin.get(`${g.cardId}|${g.country}`) !== g._min.priceCents) problems.push(`cheapest ${g.cardId} ${g.country}: database ${dbMin.get(`${g.cardId}|${g.country}`)}, files ${g._min.priceCents}`);
  return problems.slice(0, 40);
}

async function main() {
  const dir = publicDataDir();
  console.log(`Exporting public data from ${OPERATIONAL_URL_SOURCE} into ${path.relative(process.cwd(), dir) || dir}`);
  if (OPERATIONAL_URL_SOURCE === "NONE") throw new Error("No operational database is set; refusing to export an empty snapshot.");

  const tables: Tables = {};
  for (const model of PUBLIC_MODELS) {
    const t = Date.now();
    tables[model] = await readAll(model);
    console.log(`  ${model.padEnd(22)} ${String(tables[model]!.length).padStart(7)} rows  (${Date.now() - t} ms)`);
  }
  if (!tables.Card?.length) throw new Error("The database returned no cards; refusing to publish an empty catalogue.");

  const files = buildPublicFiles(tables, { generatedAt: new Date(), source: OPERATIONAL_URL_SOURCE });
  const { written, removed, bytes } = writeTree(dir, files);
  console.log(`Wrote ${written} changed file(s), removed ${removed}; ${files.size} files, ${(bytes / 1e6).toFixed(1)} MB in all.`);

  const problems = verify(dir, tables);
  if (problems.length) {
    for (const p of problems) console.error(`::error::${p}`);
    throw new Error(`${problems.length} verification problem(s); the files are not a faithful copy.`);
  }
  console.log("Verified: every table's row count, every card's listing count and every cheapest price match the database.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
