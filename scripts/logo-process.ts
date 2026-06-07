// Process the pasted RC logo into clean, transparent, recoloured glyphs:
//   - removes the baked checkerboard background (keep only the green R + white C)
//   - swaps colours to match the website wordmark: R -> white, C -> brand green
//   - outputs tight-cropped public/logo-r.png, public/logo-c.png, public/logo-rc.png
import { Jimp } from "jimp";

const GREEN = { r: 52, g: 209, b: 126 }; // #34d17e (Tailwind brand-400)

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
// Soft alpha (0-255) so edges keep their anti-aliasing instead of going jagged.
// R = the green glyph: how green-dominant the pixel is. C = the white glyph: how far
// above the grey background its darkest channel is. Grey checkerboard scores ~0 on both.
function alphaGreen(r: number, g: number, b: number) {
  return clamp((((g - Math.max(r, b)) - 14) / 55) * 255); // grey (~0 greenness) -> 0
}
function alphaWhite(r: number, g: number, b: number) {
  return clamp(((Math.min(r, g, b) - 150) / 85) * 255); // grey (min<=120) -> 0; white -> 255
}

async function main() {
  const src = await Jimp.read("public/rc-source.png");
  const W = src.bitmap.width, H = src.bitmap.height;
  const sd = src.bitmap.data;

  // Build an output glyph keeping pixels of a given kind, recoloured, tight-cropped.
  async function build(kinds: ("R" | "C")[], file: string) {
    const out = new Jimp({ width: W, height: H, color: 0x00000000 });
    const od = out.bitmap.data;
    let minX = W, minY = H, maxX = 0, maxY = 0, count = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = sd[i], g = sd[i + 1], b = sd[i + 2];
        // Exclude the small decorative sparkle in the far bottom-right corner.
        const inSparkle = x > W * 0.84 && y > H * 0.6;
        const aR = kinds.includes("R") ? alphaGreen(r, g, b) : 0;
        const aC = kinds.includes("C") && !inSparkle ? alphaWhite(r, g, b) : 0;
        // Whichever finish the pixel belongs to wins (R -> white, C -> green).
        let col: { r: number; g: number; b: number } | null = null;
        let alpha = 0;
        if (aR >= aC && aR > 8) { col = { r: 255, g: 255, b: 255 }; alpha = aR; }
        else if (aC > 8) { col = GREEN; alpha = aC; }
        if (col) {
          od[i] = col.r; od[i + 1] = col.g; od[i + 2] = col.b; od[i + 3] = alpha;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y; count++;
        }
      }
    }
    const pad = 4;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
    out.crop({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    await out.write(file as `${string}.${string}`);
    console.log(`${file}: ${count} px, ${out.bitmap.width}x${out.bitmap.height}`);
  }

  await build(["R"], "public/logo-r.png");
  await build(["C"], "public/logo-c.png");
  await build(["R", "C"], "public/logo-rc.png");
}
main().catch((e) => { console.error(e); process.exit(1); });
