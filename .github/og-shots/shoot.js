// Screenshots of the LIVE site for the share image (src/app/opengraph-image.jpg).
// Run by .github/workflows/og-shots.yml on a normal runner: the sandbox the
// share image is designed in cannot load https sites in a browser.
const { chromium } = require("playwright");
const fs = require("node:fs");

const TARGETS = [
  { name: "home", url: "https://riftcompare.com/", w: 1440, h: 900 },
  { name: "home-full", url: "https://riftcompare.com/", w: 1440, h: 900, full: true },
  { name: "card-akali-signed", url: "https://riftcompare.com/card/akali-rogue-assassin-ven-189s-166", w: 1440, h: 900 },
  { name: "card-akali-signed-full", url: "https://riftcompare.com/card/akali-rogue-assassin-ven-189s-166", w: 1440, h: 900, full: true },
  { name: "champion-riven", url: "https://riftcompare.com/champions/riven", w: 1440, h: 900 },
  { name: "radiance", url: "https://riftcompare.com/sets/radiance", w: 1440, h: 900 },
  { name: "preorders", url: "https://riftcompare.com/radiance-preorders", w: 1440, h: 900 },
  { name: "sealed", url: "https://riftcompare.com/sealed", w: 1440, h: 900 },
  { name: "auctions", url: "https://riftcompare.com/auctions", w: 1440, h: 900 },
  { name: "home-mobile", url: "https://riftcompare.com/", w: 430, h: 932, mobile: true },
];

(async () => {
  fs.mkdirSync("out", { recursive: true });
  const browser = await chromium.launch();
  for (const t of TARGETS) {
    const ctx = await browser.newContext({
      viewport: { width: t.w, height: t.h },
      deviceScaleFactor: t.mobile ? 3 : 2,
      colorScheme: "dark",
      isMobile: !!t.mobile,
      hasTouch: !!t.mobile,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(t.url, { waitUntil: "load", timeout: 90000 });
      await page.waitForTimeout(5000);
      // Best effort: close any banner or dialog that a first visit shows.
      for (const label of [/^accept/i, /got it/i, /no thanks/i, /^close/i, /dismiss/i, /maybe later/i]) {
        const b = page.getByRole("button", { name: label }).first();
        if (await b.isVisible().catch(() => false)) await b.click({ timeout: 2000 }).catch(() => {});
      }
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `out/${t.name}.png`, fullPage: !!t.full });
      console.log("ok", t.name);
    } catch (e) {
      console.log("FAIL", t.name, String(e).split("\n")[0]);
    }
    await ctx.close();
  }
  await browser.close();
})();
