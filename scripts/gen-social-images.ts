/**
 * Generate Instagram / Threads post graphics — 1080×1350 portrait (Instagram feed
 * optimal; displays full on Threads). Market-terminal style matching the site + X
 * banner. Outputs to scratch/:
 *   ig-launch.png     — the "compare every price" launch post
 *   ig-vendetta.png   — the Vendetta July 31 post
 *   ig-avatar.png     — 1080×1080 square profile avatar (RC monogram)
 *
 * Usage: npx tsx scripts/gen-social-images.ts
 */
import { Jimp, loadFont, rgbaToInt, measureText } from "jimp";
import { SANS_128_WHITE, SANS_64_WHITE, SANS_32_WHITE, SANS_16_WHITE } from "jimp/fonts";
import { mkdirSync } from "node:fs";

const rgba = (r: number, g: number, b: number, a = 255) => rgbaToInt(r, g, b, a);
const INK = rgba(10, 12, 16);
const GRID = rgba(22, 28, 38);
const GREEN = rgba(52, 209, 126);
const GREEN_DIM = rgba(20, 92, 56);
const SLATE = rgba(148, 163, 184);

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

function grid(img: Img) {
  const W = img.bitmap.width, H = img.bitmap.height;
  for (let x = 0; x < W; x += 90) line(img, x, 0, x, H, GRID, 1);
  for (let y = 0; y < H; y += 90) line(img, 0, y, W, y, GRID, 1);
}

// Rising jagged index line inside [x0,x1] × baseline band.
function chart(img: Img, x0: number, x1: number, base: number, rise: number) {
  const pts: [number, number][] = [];
  for (let x = x0; x <= x1; x += 55) {
    const w = Math.sin(x * 0.05) * 24 + Math.sin(x * 0.017) * 30;
    const y = base - ((x - x0) / (x1 - x0)) * rise + w * 0.5;
    pts.push([x, Math.round(y)]);
  }
  for (let i = 1; i < pts.length; i++) {
    line(img, pts[i - 1][0], pts[i - 1][1] + 6, pts[i][0], pts[i][1] + 6, GREEN_DIM, 3);
    line(img, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], GREEN, 5);
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

async function launch() {
  const W = 1080, H = 1350;
  const img = new Jimp({ width: W, height: H, color: INK });
  grid(img);
  const { f128, f64, f32, f16 } = await fonts();

  // top eyebrow + accent
  for (let x = 80; x < 90; x++) line(img, x, 150, x, 360, GREEN, 1);
  img.print({ font: f32, x: 110, y: 150, text: "RIFTCOMPARE" });

  // headline (three lines, big)
  img.print({ font: f128, x: 106, y: 210, text: "Every" });
  img.print({ font: f128, x: 106, y: 320, text: "Riftbound" });
  img.print({ font: f128, x: 106, y: 430, text: "price." });

  img.print({ font: f64, x: 110, y: 590, text: "One search." });

  // subline
  img.print({ font: f32, x: 110, y: 700, text: "Compare live prices across 70+ stores," });
  img.print({ font: f32, x: 110, y: 745, text: "ranked by real delivered cost. Free." });

  // chart band lower third
  chart(img, 60, W - 60, 1120, 260);

  // footer
  img.print({ font: f16, x: 110, y: 1200, text: "AU / NZ / US / UK / SG   ·   PRICE HISTORY   ·   UPDATED DAILY" });
  img.print({ font: f32, x: 110, y: 1235, text: "riftcompare.com" });

  mkdirSync("scratch", { recursive: true });
  await img.write("scratch/ig-launch.png");
  console.log("Wrote scratch/ig-launch.png (1080x1350)");
}

async function vendetta() {
  const W = 1080, H = 1350;
  const img = new Jimp({ width: W, height: H, color: INK });
  grid(img);
  const { f128, f64, f32, f16 } = await fonts();

  // "NEW SET" chip
  for (let x = 80; x < W - 80; x++) { /* noop keep W used */ break; }
  const chipW = measureText(await loadFont(SANS_32_WHITE), "NEW SET") + 40;
  for (let y = 150; y < 205; y++) for (let x = 80; x < 80 + chipW; x++) img.setPixelColor(GREEN_DIM, x, y);
  img.print({ font: f32, x: 100, y: 160, text: "NEW SET" });

  // big title
  img.print({ font: f128, x: 76, y: 250, text: "VENDETTA" });
  img.print({ font: f64, x: 82, y: 400, text: "Drops July 31" });

  // pitch lines
  img.print({ font: f32, x: 84, y: 540, text: "Every revealed card, already browsable" });
  img.print({ font: f32, x: 84, y: 588, text: "and priced across every store." });
  img.print({ font: f32, x: 84, y: 660, text: "Chase cards mapped tier by tier:" });
  img.print({ font: f32, x: 84, y: 708, text: "Signatures · Overnumbers · alt-arts · Epics." });

  // chart band
  chart(img, 60, W - 60, 1120, 240);

  img.print({ font: f16, x: 84, y: 1200, text: "LAUNCH-DAY PRICES LAND THE MOMENT SINGLES GO LIVE" });
  img.print({ font: f32, x: 84, y: 1235, text: "riftcompare.com/sets/vendetta" });

  await img.write("scratch/ig-vendetta.png");
  console.log("Wrote scratch/ig-vendetta.png (1080x1350)");
}

async function avatar() {
  const S = 1080;
  const img = new Jimp({ width: S, height: S, color: INK });
  grid(img);
  const { f128 } = await fonts();
  // Circle-safe centred monogram. IG/Threads crop to a circle, so keep it middle.
  const rc = "RC";
  const w = measureText(f128, rc);
  img.print({ font: f128, x: Math.round((S - w) / 2), y: 470, text: rc });
  // green underline tick
  for (let y = 640; y < 660; y++) for (let x = Math.round(S / 2 - 130); x < Math.round(S / 2 + 130); x++) img.setPixelColor(GREEN, x, y);
  await img.write("scratch/ig-avatar.png");
  console.log("Wrote scratch/ig-avatar.png (1080x1080)");
}

async function main() {
  await launch();
  await vendetta();
  await avatar();
}

main().catch((e) => { console.error(e); process.exit(1); });
