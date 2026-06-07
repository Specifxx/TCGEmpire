// Build the app icon / favicon: the RC mark on a dark rounded tile. Outputs a raster
// PNG (Google Search + browser tabs need raster, not SVG).
//   src/app/icon.png    -> the favicon (Next serves it at /icon.png)
//   public/icon-512.png -> stable URL for the Organization JSON-LD logo
import { Jimp } from "jimp";

const S = 512, RAD = 112;
const C1 = { r: 0x16, g: 0x27, b: 0x3f }; // top-left
const C2 = { r: 0x0a, g: 0x13, b: 0x20 }; // bottom-right

function inRounded(x: number, y: number) {
  const rx = Math.min(x, S - 1 - x), ry = Math.min(y, S - 1 - y);
  if (rx >= RAD || ry >= RAD) return true;
  const dx = RAD - rx, dy = RAD - ry;
  return dx * dx + dy * dy <= RAD * RAD;
}

async function main() {
  const icon = new Jimp({ width: S, height: S, color: 0x00000000 });
  const d = icon.bitmap.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!inRounded(x, y)) continue;
      const t = (x + y) / (2 * S);
      const i = (y * S + x) * 4;
      d[i] = Math.round(C1.r * (1 - t) + C2.r * t);
      d[i + 1] = Math.round(C1.g * (1 - t) + C2.g * t);
      d[i + 2] = Math.round(C1.b * (1 - t) + C2.b * t);
      d[i + 3] = 255;
    }
  }
  const rc = await Jimp.read("public/logo-rc.png");
  rc.resize({ w: Math.round(S * 0.78) });
  const x = Math.round((S - rc.bitmap.width) / 2);
  const y = Math.round((S - rc.bitmap.height) / 2);
  icon.composite(rc, x, y);
  await icon.write("src/app/icon.png" as `${string}.png`);
  await icon.write("public/icon-512.png" as `${string}.png`);
  console.log(`wrote src/app/icon.png + public/icon-512.png (${S}x${S}), mark ${rc.bitmap.width}x${rc.bitmap.height}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
