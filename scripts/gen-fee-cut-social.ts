/**
 * Generate the "Marketplace fees just dropped to 2%/1%" announcement graphics.
 * Same market-terminal visual style as gen-marketplace-social.ts / gen-social-
 * images.ts (dark ink bg, faint grid, green accent, rising index line) so this
 * reads as the same brand as every other RiftCompare post.
 *
 * Outputs to scratch/:
 *   fee-cut-landscape.png  — 1200x675  (X, Threads, Facebook link preview)
 *   fee-cut-instagram.png  — 1080x1350 (Instagram/Facebook feed portrait)
 *
 * Usage: npx tsx scripts/gen-fee-cut-social.ts
 */
import { Jimp, loadFont, rgbaToInt, measureText } from "jimp";
import { SANS_128_WHITE, SANS_64_WHITE, SANS_32_WHITE, SANS_16_WHITE } from "jimp/fonts";
import { mkdirSync } from "node:fs";

const rgba = (r: number, g: number, b: number, a = 255) => rgbaToInt(r, g, b, a);
const INK = rgba(10, 12, 16);
const GRID = rgba(22, 28, 38);
const GREEN = rgba(52, 209, 126);
const GREEN_DIM = rgba(20, 92, 56);
const GOLD = rgba(212, 175, 55);
const GOLD_DIM = rgba(90, 74, 24);

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

// A falling jagged line — the "cost is coming down" motif (mirror of the usual
// rising index line, since this post is about a fee CUT, not a price rise).
function chartDown(img: Img, x0: number, x1: number, base: number, drop: number) {
  const pts: [number, number][] = [];
  for (let x = x0; x <= x1; x += 55) {
    const w = Math.sin(x * 0.05) * 14 + Math.sin(x * 0.017) * 18;
    const y = base + ((x - x0) / (x1 - x0)) * drop + w * 0.5;
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

// ── Landscape (X, Threads, Facebook link preview), 1200x675 ────────────────
async function landscape(outPath: string) {
  const W = 1200, H = 675;
  const img = new Jimp({ width: W, height: H, color: INK });
  grid(img);
  const { f64, f32, f16 } = await fonts();

  // left accent bar
  for (let x = 66; x < 74; x++) line(img, x, 90, x, 320, GREEN, 1);

  // "FEE CUT" chip + eyebrow
  const chipW = measureText(f32, "FEE CUT") + 36;
  chip(img, 100, 96, chipW, 46, GREEN_DIM);
  img.print({ font: f32, x: 118, y: 104, text: "FEE CUT" });
  img.print({ font: f16, x: 100 + chipW + 20, y: 112, text: "RIFTCOMPARE MARKETPLACE" });

  // headline
  img.print({ font: f64, x: 96, y: 175, text: "Selling fees just" });
  img.print({ font: f64, x: 96, y: 250, text: "dropped to 2%." });

  // the two rate chips
  chip(img, 100, 350, 210, 70, GREEN_DIM);
  img.print({ font: f32, x: 118, y: 368, text: "2% standard" });
  chip(img, 322, 350, 230, 70, GOLD_DIM);
  img.print({ font: f32, x: 340, y: 368, text: "1% Premium" });

  img.print({ font: f16, x: 100, y: 440, text: "Down from 5% - no listing fee, ever. Buyers never see it." });

  // falling-cost chart, lower-right
  chartDown(img, 660, W - 60, 210, 190);

  img.print({ font: f16, x: 100, y: H - 60, text: "riftcompare.com/marketplace" });

  mkdirSync("scratch", { recursive: true });
  await img.write(outPath as `${string}.png`);
  console.log(`Wrote ${outPath} (${W}x${H})`);
}

// ── Portrait (Instagram/Facebook feed), 1080x1350 ───────────────────────────
async function portrait(outPath: string) {
  const W = 1080, H = 1350;
  const img = new Jimp({ width: W, height: H, color: INK });
  grid(img);
  const { f128, f64, f32, f16 } = await fonts();

  // "FEE CUT" chip + eyebrow
  const chipW = measureText(f32, "FEE CUT") + 40;
  chip(img, 80, 150, chipW, 56, GREEN_DIM);
  img.print({ font: f32, x: 102, y: 162, text: "FEE CUT" });
  img.print({ font: f16, x: 80 + chipW + 24, y: 172, text: "RIFTCOMPARE MARKETPLACE" });

  // headline
  img.print({ font: f128, x: 76, y: 250, text: "2%" });
  img.print({ font: f64, x: 76, y: 400, text: "seller fee. Down" });
  img.print({ font: f64, x: 76, y: 465, text: "from 5%." });

  // Premium rate chip
  chip(img, 80, 560, 420, 90, GOLD_DIM);
  img.print({ font: f32, x: 100, y: 585, text: "1% for Premium sellers" });

  img.print({ font: f32, x: 84, y: 700, text: "No listing fee. Nothing upfront." });
  img.print({ font: f32, x: 84, y: 748, text: "Buyers never see an added fee." });

  // falling-cost chart
  chartDown(img, 60, W - 60, 980, 220);

  img.print({ font: f16, x: 84, y: 1200, text: "SELL YOUR SPARES  -  BUYER PROTECTION  -  BUILT-IN MESSAGING" });
  img.print({ font: f32, x: 84, y: 1235, text: "riftcompare.com/marketplace" });

  await img.write(outPath as `${string}.png`);
  console.log(`Wrote ${outPath} (${W}x${H})`);
}

async function main() {
  await landscape("scratch/fee-cut-landscape.png");
  await portrait("scratch/fee-cut-instagram.png");
}

main().catch((e) => { console.error(e); process.exit(1); });
