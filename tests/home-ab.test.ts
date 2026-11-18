import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOME_AB_BOOT_SCRIPT } from "../src/lib/home-ab";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the home banner-position test: two slots, one arm shown, the boot script in the layout head", () => {
  const home = read("src/components/home/HomeSections.tsx");
  assert.match(home, /<HomeAdSlot arm="top" \/>/);
  assert.match(home, /<HomeAdSlot arm="low" \/>/);
  assert.ok(home.indexOf('arm="low"') > home.indexOf("<TodaysTopDeals"), "the low arm sits below Today's Top Deals");
  assert.match(read("src/app/layout.tsx"), /HOME_AB_BOOT_SCRIPT/);
  const css = read("src/app/globals.css");
  assert.match(css, /data-ab-slot="low"/);
  assert.match(css, /data-ab-slot="top"/);
});

test("the arm reaches the eBay and TCGplayer tags and the click's page type", () => {
  const ads = read("src/components/InlineAds.tsx");
  assert.match(ads, /inline\$\{arm\}/);
  assert.match(ads, /tcg_inline\$\{arm\}/);
  assert.match(ads, /`\$\{pageType\}-\$\{arm\}`/);
  assert.match(read("src/components/HomeAdSlot.tsx"), /track\("home_ab"/);
});

test("the boot script only runs on the six homes, draws 50/50 and falls back to the top arm", () => {
  assert.match(HOME_AB_BOOT_SCRIPT, /\(au\|uk\|ca\|sg\|eu\)/);
  assert.match(HOME_AB_BOOT_SCRIPT, /Math\.random\(\)<\.5/);
  assert.match(HOME_AB_BOOT_SCRIPT, /catch\(e\)\{h\.setAttribute\("data-rc-ab","top"\)\}/);
  const attrs: Record<string, string> = {};
  const store: Record<string, string> = {};
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
  g.location = { pathname: "/" };
  g.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) };
  new Function(HOME_AB_BOOT_SCRIPT)();
  assert.ok(attrs["data-rc-ab"] === "top" || attrs["data-rc-ab"] === "low");
  assert.equal(store["rc_ab_home"], attrs["data-rc-ab"]);
  const first = attrs["data-rc-ab"];
  new Function(HOME_AB_BOOT_SCRIPT)();
  assert.equal(attrs["data-rc-ab"], first, "a returning visitor keeps their arm");
  for (const k of Object.keys(attrs)) delete attrs[k];
  g.location = { pathname: "/card/abc" };
  new Function(HOME_AB_BOOT_SCRIPT)();
  assert.equal(attrs["data-rc-ab"], undefined, "no arm outside the homes");
});
