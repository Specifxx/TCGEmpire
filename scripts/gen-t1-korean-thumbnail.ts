#!/usr/bin/env tsx
/**
 * Generates the Korean-edition thumbnail for the T1 2025 Worlds Champion
 * Signature Edition box from the English one, rather than sourcing a fourth
 * photo: Riot's Korean-market product page was not available to pull a real
 * product shot from, and the box itself is physically identical to the
 * English edition except for the card text inside (the outer case carries no
 * language marking) — see public/t1-worlds-cards/t1-signature-edition-box-en.jpg,
 * itself a self-hosted, flattened-to-white copy of Riot's own Merch Store
 * render (never hotlinked, same approach as every other T1 asset in this
 * folder — see the _note entry for T1S in prisma/manual-cards.json).
 *
 * A plain re-use of the English file would make the two tiles visually
 * identical on the /sealed grid, so this composites a small red/gold ribbon
 * reading "한국어판" (Korean-language edition) across the bottom — enough to
 * tell the two apart at a glance without claiming to be real Riot artwork.
 *
 * Output: public/t1-worlds-cards/t1-signature-edition-box-kr.jpg
 * Idempotent: skips if the file exists. Pass --force to redraw.
 *
 * Run: npx tsx scripts/gen-t1-korean-thumbnail.ts [--force]
 */
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "public", "t1-worlds-cards", "t1-signature-edition-box-en.jpg");
const OUT = path.join(process.cwd(), "public", "t1-worlds-cards", "t1-signature-edition-box-kr.jpg");

// Sampled from the box art itself (see t1-signature-edition-box-en.jpg) rather
// than the site's own brand palette — this is product photography, not a
// RiftCompare-authored graphic, so it should read as "the same box" plus a
// language label, not as a RiftCompare banner.
const RED = "#c81e2f";
const GOLD = "#caa85a";

function ribbonSvg(width: number, height: number): string {
  const bandH = Math.round(height * 0.1);
  const y = height - bandH;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="${y}" width="${width}" height="${bandH}" fill="${RED}"/>
  <rect x="0" y="${y}" width="${width}" height="3" fill="${GOLD}"/>
  <text x="${width / 2}" y="${y + bandH / 2 + bandH * 0.12}" fill="#ffffff" font-family="DejaVu Sans, sans-serif"
        font-size="${Math.round(bandH * 0.42)}" font-weight="bold" letter-spacing="2" text-anchor="middle">한국어판</text>
</svg>`;
}

async function main() {
  let sharp: typeof import("sharp").default;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("[gen-t1-korean-thumbnail] sharp is required. Run `npm i -D sharp`.");
    process.exit(1);
  }

  const force = process.argv.includes("--force");
  if (fs.existsSync(OUT) && !force) {
    console.log(`[gen-t1-korean-thumbnail] ${path.basename(OUT)} exists — skipping (pass --force to redraw)`);
    return;
  }
  if (!fs.existsSync(SRC)) {
    console.error(`[gen-t1-korean-thumbnail] missing source: ${SRC}`);
    process.exit(1);
  }

  const base = sharp(SRC);
  const meta = await base.metadata();
  const width = meta.width ?? 1100;
  const height = meta.height ?? 1100;

  const buf = await base
    .composite([{ input: Buffer.from(ribbonSvg(width, height)), left: 0, top: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  fs.writeFileSync(OUT, buf);
  console.log(`[gen-t1-korean-thumbnail] ${path.basename(OUT)} (${Math.round(buf.length / 1024)}KB)`);
}

void main();
