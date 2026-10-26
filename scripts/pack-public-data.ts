// Packs the committed public data snapshot (data/public/) into the gzipped
// copy the deploy bundles (.public-data-pack/, git-ignored; layout in
// src/lib/public-data/format.ts). Runs in `npm run build`, right before
// `next build`, so the pack is always the snapshot this release ships.
//
// WHY. In PUBLIC_DATA_MODE files/fallback every server function carries the
// snapshot (next.config.js outputFileTracingIncludes). As 1,710 files and 76 MB
// it was copied into ~280 function bundles per deploy and production builds
// crept from ~3 to ~6 minutes as it grew; packed it is 72 files and ~7.5 MB.
// The rows are the committed ones, unchanged: only the container differs.
//
//   npx tsx scripts/pack-public-data.ts
//
// No snapshot (a fresh checkout before the first export) writes no pack, and
// the reader falls back to data/public/. Never fails the build: a missing pack
// means next.config.js bundles data/public/ as before.
import fs from "node:fs";
import path from "node:path";
import { packDir, snapshotDir } from "../src/lib/public-data/format";
import { packPublicData } from "../src/lib/public-data/pack";

const started = Date.now();
try {
  const r = packPublicData(snapshotDir(), packDir());
  if (!r) console.log(`[pack-public-data] no snapshot in ${path.relative(process.cwd(), snapshotDir())}: nothing to pack.`);
  else {
    const mb = (n: number) => (n / 1e6).toFixed(1);
    console.log(`[pack-public-data] ${r.cards} cards' listings and the tables: ${mb(r.bytesIn)} MB -> ${r.files} files, ${mb(r.bytesOut)} MB, in ${Date.now() - started} ms.`);
  }
} catch (err) {
  // Leave no half-written pack behind: without its marker the reader ignores
  // it, and next.config.js bundles data/public/ instead.
  fs.rmSync(packDir(), { recursive: true, force: true });
  console.error(`::warning::[pack-public-data] failed, the build bundles data/public/ instead: ${(err as Error).message}`);
}
