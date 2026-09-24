#!/usr/bin/env tsx
/**
 * Featured image for /blog/where-to-buy-riftbound-radiance.
 *
 * The house generator (scripts/gen-blog-heroes.ts) draws text-only heroes, which
 * is right for a post about fees or FX. A post about BUYING a set is better
 * served by the set itself, so this keeps that generator's layout, palette and
 * logo on the left and puts the two Radiance cards that have been photographed
 * in print (Seraphine's Legend and Neeko, already self-hosted under
 * public/radiance-spoilers/) fanned out on the right. Nothing here is Riot
 * product art presented as our own: they are the same card photos the spoiler
 * posts already carry, with their own alt text on those pages.
 *
 * Output: public/blog/where-to-buy-riftbound-radiance.jpg, 1200x630. Then run
 * `npm run images:optimize` for the .webp/.avif renditions and the manifest.
 *
 * Idempotent: skips if the file exists. Pass --force to redraw.
 * Run: npx tsx scripts/gen-radiance-buy-hero.ts [--force]
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "blog", "where-to-buy-riftbound-radiance.jpg");
const SERAPHINE = path.join(ROOT, "public", "radiance-spoilers", "seraphine-starry-eyed-songstress.jpg");
const NEEKO = path.join(ROOT, "public", "radiance-spoilers", "neeko-blending-in.jpg");
const LOGO = path.join(ROOT, "public", "logo-r-green.png");

const WIDTH = 1200;
const HEIGHT = 630;
const BRAND = "#34d17e";
const ACCENT = "#38bdf8";
const CARD_H = 430;

function backgroundSvg(): string {
  const logo = `data:image/png;base64,${fs.readFileSync(LOGO).toString("base64")}`;
  const chips = ["Pre-orders in six markets", "Riot's Merch Store draw", "Releases 23 Oct 2026"];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0f17"/>
      <stop offset="55%" stop-color="#101826"/>
      <stop offset="100%" stop-color="#1a1430"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${BRAND}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0.85"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#f5c451" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#f5c451" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${WIDTH}" height="8" fill="url(#glow)"/>
  <circle cx="940" cy="330" r="330" fill="url(#halo)"/>

  <image href="${logo}" x="80" y="66" width="42" height="42"/>
  <g font-family="DejaVu Sans, sans-serif">
    <text x="134" y="112" fill="${BRAND}" font-size="30" font-weight="bold" letter-spacing="6">RIFTCOMPARE</text>
    <text x="80" y="160" fill="#94a3b8" font-size="24" letter-spacing="2">BUYING GUIDE · SET 5</text>
    <text x="80" y="246" fill="#ffffff" font-size="64" font-weight="bold">Where to Buy</text>
    <text x="80" y="320" fill="#ffffff" font-size="64" font-weight="bold">Radiance</text>
    <rect x="80" y="352" width="120" height="5" rx="2.5" fill="${BRAND}"/>
    ${chips.map((c, i) => `<text x="80" y="${414 + i * 46}" fill="#cbd5e1" font-size="27">•  ${c}</text>`).join("\n    ")}
  </g>
</svg>`;
}

// The photos carry a few pixels of background at their edges; trim 1.5% off
// every side so none of it survives the corner mask.
function inset(meta: { width?: number; height?: number }) {
  const W = meta.width ?? 744;
  const H = meta.height ?? 1040;
  const dx = Math.round(W * 0.015);
  const dy = Math.round(H * 0.015);
  return { left: dx, top: dy, width: W - dx * 2, height: H - dy * 2 };
}

// A card photo, resized, given rounded corners and a soft shadow, then rotated.
async function card(file: string, angle: number): Promise<{ buf: Buffer; w: number; h: number }> {
  const meta = await sharp(file).metadata();
  const h = CARD_H;
  const w = Math.round(((meta.width ?? 744) / (meta.height ?? 1040)) * h);
  const mask = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="30" ry="30"/></svg>`);
  const rounded = await sharp(file).extract(inset(meta)).resize(w, h).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const pad = 30;
  const shadow = await sharp({
    create: { width: w + pad * 2, height: h + pad * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${w + pad * 2}" height="${h + pad * 2}"><rect x="${pad}" y="${pad + 10}" width="${w}" height="${h}" rx="30" fill="#000" fill-opacity="0.6"/></svg>`,
        ),
      },
    ])
    .png()
    .toBuffer();
  const blurred = await sharp(shadow).blur(12).png().toBuffer();
  const framed = await sharp(blurred).composite([{ input: rounded, left: pad, top: pad }]).png().toBuffer();
  const rotated = await sharp(framed).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const m = await sharp(rotated).metadata();
  return { buf: rotated, w: m.width!, h: m.height! };
}

async function main() {
  if (fs.existsSync(OUT) && !process.argv.includes("--force")) {
    console.log(`[gen-radiance-buy-hero] ${path.basename(OUT)} exists — skipping (pass --force to redraw)`);
    return;
  }
  const neeko = await card(NEEKO, -9);
  const seraphine = await card(SERAPHINE, 7);
  const cx = 930; // centre of the fan
  const buf = await sharp(Buffer.from(backgroundSvg()))
    .composite([
      { input: neeko.buf, left: Math.round(cx - 105 - neeko.w / 2), top: Math.round(HEIGHT / 2 - neeko.h / 2 + 6) },
      { input: seraphine.buf, left: Math.round(cx + 95 - seraphine.w / 2), top: Math.round(HEIGHT / 2 - seraphine.h / 2 + 14) },
    ])
    .flatten({ background: "#0b0f17" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  fs.writeFileSync(OUT, buf);
  console.log(`[gen-radiance-buy-hero] ${path.basename(OUT)} (${Math.round(buf.length / 1024)}KB)`);
}

void main();
