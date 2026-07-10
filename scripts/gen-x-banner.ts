/**
 * Generate the X (Twitter) profile banner — 1500×500 PNG, market-terminal style:
 * ink background, faint grid, rising index line, wordmark + tagline.
 * Output: scratch/x-banner.png (not a public asset; uploaded to X manually).
 *
 * Usage: npx tsx scripts/gen-x-banner.ts
 */
import { Jimp, loadFont, rgbaToInt } from "jimp";
import { SANS_64_WHITE, SANS_32_WHITE, SANS_16_WHITE } from "jimp/fonts";
import { mkdirSync } from "node:fs";

const W = 1500;
const H = 500;

const rgba = (r: number, g: number, b: number, a = 255) => rgbaToInt(r, g, b, a);
const INK = rgba(10, 12, 16); // #0a0c10
const GRID = rgba(24, 30, 40); // opaque dark grid (Jimp setPixelColor ignores blending)
const GREEN = rgba(52, 209, 126); // #34d17e
const GREEN_DIM = rgba(20, 92, 56); // dark-green glow row

function drawLine(img: InstanceType<typeof Jimp>, x1: number, y1: number, x2: number, y2: number, color: number, thick = 3) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x1 + ((x2 - x1) * i) / steps);
    const y = Math.round(y1 + ((y2 - y1) * i) / steps);
    for (let dx = 0; dx < thick; dx++)
      for (let dy = 0; dy < thick; dy++)
        if (x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H) img.setPixelColor(color, x + dx, y + dy);
  }
}

async function main() {
  const img = new Jimp({ width: W, height: H, color: INK });

  // Faint terminal grid
  for (let x = 0; x < W; x += 75) drawLine(img, x, 0, x, H, GRID, 1);
  for (let y = 0; y < H; y += 75) drawLine(img, 0, y, W, y, GRID, 1);

  // Rising index line across the lower half (deterministic jagged walk)
  const pts: [number, number][] = [];
  let y = 430;
  for (let x = 0; x <= W; x += 60) {
    // Pseudo-random but deterministic wiggle, trending up left→right.
    const wiggle = Math.sin(x * 0.045) * 26 + Math.sin(x * 0.013) * 34;
    y = 445 - (x / W) * 220 + wiggle * 0.45;
    pts.push([x, Math.round(y)]);
  }
  for (let i = 1; i < pts.length; i++) {
    drawLine(img, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], GREEN, 4);
    // soft glow under the line
    drawLine(img, pts[i - 1][0], pts[i - 1][1] + 5, pts[i][0], pts[i][1] + 5, GREEN_DIM, 2);
  }

  // Left accent bar (matches the site's hero border)
  for (let x = 70; x < 78; x++) drawLine(img, x, 130, x, 330, GREEN, 1);

  const f64 = await loadFont(SANS_64_WHITE);
  const f32 = await loadFont(SANS_32_WHITE);
  const f16 = await loadFont(SANS_16_WHITE);

  img.print({ font: f64, x: 105, y: 150, text: "RIFTCOMPARE" });
  img.print({ font: f32, x: 108, y: 235, text: "Live Riftbound TCG price comparison" });
  img.print({ font: f16, x: 110, y: 292, text: "EVERY CARD  ·  70+ STORES  ·  AU / NZ / US / UK / SG  ·  UPDATED DAILY" });
  img.print({ font: f16, x: 110, y: 322, text: "riftcompare.com" });

  mkdirSync("scratch", { recursive: true });
  await img.write("scratch/x-banner.png");
  console.log("Wrote scratch/x-banner.png (1500x500)");
}

main().catch((e) => { console.error(e); process.exit(1); });
