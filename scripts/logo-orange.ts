// Paint the "R" mark in the Riftbound flame gradient (2026-10-16 rebrand).
// The shape comes from public/logo-r-green.png, a single flat colour on
// transparent; only its alpha is kept, and the fill is the same vertical
// gradient BrandLogo draws with a CSS mask (lib/brand.ts, FLAME). Writes
// public/logo-r-orange.png for the places that need a raster: the app icon
// (scripts/logo-favicon.ts), the blog hero and premium hero generators.
//   npx tsx scripts/logo-orange.ts
import sharp from "sharp";
import { FLAME_STOPS } from "../src/lib/brand";

function hex(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function flameAt(t: number) {
  for (let i = 1; i < FLAME_STOPS.length; i++) {
    const [p1, c1] = FLAME_STOPS[i];
    if (t <= p1) {
      const [p0, c0] = FLAME_STOPS[i - 1];
      const k = (t - p0) / (p1 - p0 || 1);
      const a = hex(c0), b = hex(c1);
      return a.map((v, j) => Math.round(v + (b[j] - v) * k));
    }
  }
  return hex(FLAME_STOPS[FLAME_STOPS.length - 1][1]);
}

async function main() {
  const src = sharp("public/logo-r-green.png").ensureAlpha();
  const { data, info } = await src.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  // Rows the mark actually occupies, so the ramp runs top-of-glyph to
  // bottom-of-glyph rather than across the padding.
  let top = height, bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > 8) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
  }
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const [r, g, b] = flameAt(Math.min(1, Math.max(0, (y - top) / Math.max(1, bottom - top))));
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      out[i] = r; out[i + 1] = g; out[i + 2] = b;
      out[i + 3] = data[(y * width + x) * channels + 3];
    }
  }
  await sharp(out, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile("public/logo-r-orange.png");
  console.log(`wrote public/logo-r-orange.png (${width}x${height}), glyph rows ${top}-${bottom}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
