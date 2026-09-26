#!/usr/bin/env tsx
/**
 * Pre-generates the card-art THUMBNAILS: for every mirrored
 * `public/card-art/<stem>.webp` (744x1039, ~95 KB), a 320w and a 480w WebP
 * beside it, `<stem>-320w.webp` / `<stem>-480w.webp`.
 *
 * WHY (2026-09-26). Every grid, list and thumbnail loaded the full 744px art —
 * /browse pulled ~100 of them per page (~9.5 MB) into ~158px tiles on a phone.
 * `cardImageSrcSet()` (lib/card-image-url.ts) now offers these renditions with
 * `sizes`, and only the card-detail hero asks for the full file.
 *
 * STATIC FILES, NOT ON-DEMAND OPTIMISATION: Vercel's image optimiser bills per
 * transformation; these are plain files served by the CDN. Flat, beside the
 * original, so they inherit its `immutable` Cache-Control rule
 * (next.config.js, `/card-art/:file.webp`): the original's filename carries its
 * content hash, and a thumbnail derived from it is just as immutable.
 *
 * Idempotent: an existing thumbnail is skipped — the source's filename carries
 * its content hash, so changed art is a new name, never a stale thumbnail (and
 * mtimes are meaningless after a git clone). So the build step
 * (`npm run build` runs this) only encodes art mirrored since the last commit.
 * tests/card-art-thumbs.test.ts fails if any source lacks either rendition.
 */
import fs from "node:fs";
import path from "node:path";
import { CARD_ART_THUMB_WIDTHS } from "../src/lib/card-image-url";

const DIR = path.join(process.cwd(), "public", "card-art");
const SOURCE = /^(?!.*-\d+w\.webp$).+\.webp$/;

async function main() {
  let sharp: typeof import("sharp").default;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.warn("[card-art-thumbs] sharp not installed — skipping (grids fall back to the full art).");
    return;
  }
  if (!fs.existsSync(DIR)) return;
  const sources = fs.readdirSync(DIR).filter((f) => SOURCE.test(f));
  let made = 0;
  let bytes = 0;
  const queue = [...sources];
  async function worker() {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const src = path.join(DIR, f);
      for (const w of CARD_ART_THUMB_WIDTHS) {
        const out = path.join(DIR, f.replace(/\.webp$/, `-${w}w.webp`));
        if (fs.existsSync(out)) continue;
        const buf = await sharp(src).resize({ width: w, withoutEnlargement: true }).webp({ quality: 66, effort: 5 }).toBuffer();
        fs.writeFileSync(out, buf);
        made++;
        bytes += buf.length;
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(
    `[card-art-thumbs] ${sources.length} sources; wrote ${made} thumbnails` +
      (made ? ` (avg ${Math.round(bytes / made / 1024)} KB)` : ""),
  );
}

main().catch((e) => {
  console.error("[card-art-thumbs] failed:", e);
  process.exit(1);
});
