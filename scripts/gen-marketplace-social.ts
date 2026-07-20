/**
 * Generate marketplace-launch post graphics for the social posts (Reddit,
 * Facebook/Instagram, Threads/X). Same market-terminal style as
 * gen-social-images.ts / gen-x-banner.ts (dark ink bg, faint grid, green
 * accent, rising index line) — reused here so the marketplace launch reads
 * as the same visual brand as every other RiftCompare post.
 *
 * Outputs to scratch/:
 *   marketplace-reddit.png      — 1200x675  (Reddit link/image preview)
 *   marketplace-instagram.png   — 1080x1350 (FB/IG feed portrait)
 *   marketplace-x.png           — 1200x675  (X/Threads in-feed crop)
 *
 * Usage: npx tsx scripts/gen-marketplace-social.ts
 */
import { Jimp, loadFont, rgbaToInt, measureText } from "jimp";
import { SANS_128_WHITE, SANS_64_WHITE, SANS_32_WHITE, SANS_16_WHITE } from "jimp/fonts";
import { mkdirSync } from "node:fs";

const rgba = (r: number, g: number, b: number, a = 255) => rgbaToInt(r, g, b, a);
const INK = rgba(10, 12, 16);
const GRID = rgba(22, 28, 38);
const GREEN = rgba(52, 209, 126);
const GREEN_DIM = rgba(20, 92, 56);

type Img = InstanceType<typeof Jimp>;

function line(img: Img, x1: number, y1: number, x2: number, y2: number, color: number, thick = 3) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  const W = img.bitmap.width, H = img.bitmap.height;
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x1 + ((x2 - x1) * i) / steps);
    const y = Math.round(y1 + ((y2 - y1) * i) / steps);
    for (let dx = 0; dx < thick; dx++)
      for (let dy = 0; dy < thick; dy++)
        if (x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H) img.setPixelColor(color, x + dx, y + dy);
  }
}

function grid(img: Img, step = 75) {
  const W = img.bitmap.width, H = img.bitmap.height;
  for (let x = 0; x < W; x += step) line(img, x, 0, x, H, GRID, 1);
  for (let y = 0; y < H; y += step) line(img, 0, y, W, y, GRID, 1);
}

function chip(img: Img, x: number, y: number, w: number, h: number, color: number) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) img.setPixelColor(color, xx, yy);
}

// Rising jagged index line — the recurring "market is up" motif.
function chart(img: Img, x0: number, x1: number, base: number, rise: number) {
  const pts: [number, number][] = [];
  for (let x = x0; x <= x1; x += 55) {
    const w = Math.sin(x * 0.05) * 20 + Math.sin(x * 0.017) * 26;
    const y = base - ((x - x0) / (x1 - x0)) * rise + w * 0.5;
    pts.push([x, Math.round(y)]);
  }
  for (let i = 1; i < pts.length; i++) {
    line(img, pts[i - 1][0], pts[i - 1][1] + 5, pts[i][0], pts[i][1] + 5, GREEN_DIM, 3);
    line(img, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], GREEN, 4);
  }
}

async function fonts() {
  return {
    f128: await loadFont(SANS_128_WHITE),
    f64: await loadFont(SANS_64_WHITE),
    f32: await loadFont(SANS_32_WHITE),
    f16: await loadFont(SANS_16_WHITE),
  };
}

// ── Landscape (Reddit + X/Threads), 1200x675 ────────────────────────────────
async function landscape(outPath: string, urlLine: string) {
  const W = 1200, H = 675;
  const img = new Jimp({ width: W, height: H, color: INK });
  grid(img);
  const { f64, f32, f16 } = await fonts();

  // left accent bar
  for (let x = 66; x < 74; x++) line(img, x, 90, x, 300, GREEN, 1);

  // "NEW" chip + eyebrow
  const chipW = measureText(f32, "NEW") + 36;
  chip(img, 100, 96, chipW, 46, GREEN_DIM);
  img.print({ font: f32, x: 118, y: 104, text: "NEW" });
  img.print({ font: f16, x: 100 + chipW + 20, y: 112, text: "RIFTCOMPARE MARKETPLACE" });

  // headline (two lines)
  img.print({ font: f64, x: 96, y: 170, text: "Buy & sell Riftbound" });
  img.print({ font: f64, x: 96, y: 245, text: "cards, direct." });

  // feature lines
  img.print({ font: f32, x: 100, y: 340, text: "Funds held until delivery confirmed" });
  img.print({ font: f32, x: 100, y: 385, text: "5% fee - nothing to list, nothing upfront" });
  img.print({ font: f32, x: 100, y: 430, text: "In beta - break it, tell us, we fix it fast" });

  // chart band lower-right
  chart(img, 640, W - 60, H - 90, 190);

  // footer
  img.print({ font: f16, x: 100, y: H - 60, text: urlLine });

  mkdirSync("scratch", { recursive: true });
  await img.write(outPath as `${string}.png`);
  console.log(`Wrote ${outPath} (${W}x${H})`);
}

// ── Portrait (Facebook/Instagram feed), 1080x1350 ───────────────────────────
async function portrait(outPath: string) {
  const W = 1080, H = 1350;
  const img = new Jimp({ width: W, height: H, color: INK });
  grid(img);
  const { f128, f64, f32, f16 } = await fonts();

  // "NEW" chip + eyebrow
  const chipW = measureText(f32, "NEW") + 40;
  chip(img, 80, 150, chipW, 56, GREEN_DIM);
  img.print({ font: f32, x: 102, y: 162, text: "NEW" });
  img.print({ font: f16, x: 80 + chipW + 24, y: 172, text: "RIFTCOMPARE MARKETPLACE" });

  // headline (three lines, big — matches the launch/vendetta post cadence)
  img.print({ font: f128, x: 76, y: 250, text: "Buy." });
  img.print({ font: f128, x: 76, y: 370, text: "Sell." });
  img.print({ font: f128, x: 76, y: 490, text: "Direct." });

  img.print({ font: f64, x: 82, y: 650, text: "With other players." });

  // feature lines
  img.print({ font: f32, x: 84, y: 780, text: "Funds held until delivery confirmed" });
  img.print({ font: f32, x: 84, y: 828, text: "5% fee - nothing to list, nothing upfront" });
  img.print({ font: f32, x: 84, y: 876, text: "In beta - break it, tell us, we fix it fast" });

  // chart band
  chart(img, 60, W - 60, 1160, 220);

  img.print({ font: f16, x: 84, y: 1200, text: "OPEN A SHOP FREE  -  BUYER PROTECTION  -  BUILT-IN MESSAGING" });
  img.print({ font: f32, x: 84, y: 1235, text: "riftcompare.com/marketplace" });

  await img.write(outPath as `${string}.png`);
  console.log(`Wrote ${outPath} (${W}x${H})`);
}

async function main() {
  await landscape("scratch/marketplace-reddit.png", "riftcompare.com/marketplace");
  await landscape("scratch/marketplace-x.png", "riftcompare.com/marketplace");
  await portrait("scratch/marketplace-instagram.png");
}

main().catch((e) => { console.error(e); process.exit(1); });
