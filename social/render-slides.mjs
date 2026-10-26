// Screenshot every <section class="slide"> in a pack's slides.html → s1.png, s2.png…
//   node social/render-slides.mjs social/out/<pack>
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "./browser.mjs";

const dir = path.resolve(process.argv[2] ?? ".");
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 1 });
await page.setViewportSize({ width: 2600, height: 1500 });
await page.goto(pathToFileURL(path.join(dir, "slides.html")).href, { waitUntil: "networkidle" });
await page.evaluate(() => Promise.all([document.fonts.ready, window.READY]));
for (const el of await page.$$("section.slide")) {
  const out = path.join(dir, `${await el.getAttribute("id")}.png`);
  await el.screenshot({ path: out });
  console.log(out);
}
await browser.close();
