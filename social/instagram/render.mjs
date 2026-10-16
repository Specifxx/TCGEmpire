// Render every <section class="slide"> in a post's index.html to a 1080x1350 PNG.
//   node social/instagram/render.mjs social/instagram/posts/<post>
// Needs playwright-core (not a project dependency: `npm i --no-save playwright-core`)
// and a Chromium; CHROMIUM_PATH overrides the cloud default.
import { chromium } from "playwright-core";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = path.resolve(process.argv[2] ?? ".");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  // CSS masks (the swirl C) are CORS-checked, and file:// has no origin.
  args: ["--allow-file-access-from-files"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(dir, "index.html")).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
for (const el of await page.$$("section.slide")) {
  const id = await el.getAttribute("id");
  const out = path.join(dir, `${id}.png`);
  await el.screenshot({ path: out });
  console.log(out);
}
await browser.close();
