// Generates the source images Capacitor's asset pipeline needs:
//   mobile/resources/icon.png        1024x1024 app icon
//   mobile/resources/splash.png      2732x2732 splash (dark)
//   mobile/resources/splash-dark.png 2732x2732 splash (dark)
//
// Run from the repo root:  npx tsx scripts/gen-mobile-assets.ts
// Then:                    cd mobile && npx @capacitor/assets generate
import { Jimp } from "jimp";
import { mkdirSync } from "node:fs";

const BG = 0x0a0f1aff; // ink-950, matches the app background
const OUT = "mobile/resources";

async function main() {
  mkdirSync(OUT, { recursive: true });

  // --- App icon: 1024x1024, the brand tile on a solid dark background ---
  const iconCanvas = new Jimp({ width: 1024, height: 1024, color: BG });
  const tile = await Jimp.read("public/icon-512.png");
  tile.resize({ w: 880, h: 880 });
  iconCanvas.composite(tile, (1024 - 880) / 2, (1024 - 880) / 2);
  await iconCanvas.write(`${OUT}/icon.png`);
  console.log(`wrote ${OUT}/icon.png (1024x1024)`);

  // --- Splash: 2732x2732 dark canvas with the wordmark logo centred ---
  const logo = await Jimp.read("public/logo-rc.png");
  const target = 1100; // longest-edge size for the logo on the splash
  const scale = target / Math.max(logo.bitmap.width, logo.bitmap.height);
  logo.resize({ w: Math.round(logo.bitmap.width * scale), h: Math.round(logo.bitmap.height * scale) });

  const splash = new Jimp({ width: 2732, height: 2732, color: BG });
  splash.composite(logo, (2732 - logo.bitmap.width) / 2, (2732 - logo.bitmap.height) / 2);
  await splash.write(`${OUT}/splash.png`);
  await splash.write(`${OUT}/splash-dark.png`);
  console.log(`wrote ${OUT}/splash.png + splash-dark.png (2732x2732)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
