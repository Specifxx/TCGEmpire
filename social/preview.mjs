// Stills of a pack's video at chosen seconds, to look at before filming it all.
//   node social/preview.mjs social/out/<pack> 1.5 4 9 [--out dir]  → still-<t>.jpg
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "./browser.mjs";

const argv = process.argv.slice(2);
const outAt = argv.indexOf("--out");
const outDir = outAt >= 0 ? path.resolve(argv[outAt + 1]) : null;
const rest = outAt >= 0 ? argv.filter((_, i) => i !== outAt && i !== outAt + 1) : argv;
const dir = path.resolve(rest[0]);
const times = rest.slice(1).map(Number);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(pathToFileURL(path.join(dir, "video.html")).href, { waitUntil: "networkidle" });
await page.evaluate(() => Promise.all([document.fonts.ready, window.READY]));
await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
console.log("duration", await page.evaluate(() => window.REEL.duration));
for (const t of times) {
  await page.evaluate((ms) => { for (const a of document.getAnimations()) a.currentTime = ms; window.onReelFrame?.(ms); }, t * 1000);
  const out = path.join(outDir ?? dir, `still-${path.basename(dir)}-${t}.jpg`);
  await page.screenshot({ path: out, type: "jpeg", quality: 80 });
  console.log(out);
}
await browser.close();
