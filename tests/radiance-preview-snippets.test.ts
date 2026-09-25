import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setByCode } from "../src/lib/constants";
import { RADIANCE_TOTAL_CARDS } from "../src/lib/sets/radiance";

// Radiance snippets, 2026-09-25 — DECISIONS.md, "Radiance snippets: reveals,
// not 'All N Cards'". Source-level, like the rest of the SEO tests: the
// rendered checks need a server and a database.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const PREORDERS = "src/app/radiance-preorders/page.tsx";

test("the announced total has one source: the set title and the hub counter agree", () => {
  const rad = setByCode("RAD")!;
  assert.equal(rad.announcedCards, 180);
  assert.equal(rad.totalCards, 167, "the printed run stays the price-import denominator");
  assert.equal(RADIANCE_TOTAL_CARDS, rad.announcedCards);
  assert.match(read("src/lib/sets/radiance.ts"), /RADIANCE_TOTAL_CARDS = setByCode\("RAD"\)\?\.announcedCards/);
  assert.match(read("src/app/sets/[set]/page.tsx"), /const announced = set\.announcedCards \?\? set\.totalCards;/);
});

test("the reveal count is cached, tagged, non-promo, and wraps a raw count", () => {
  const src = read("src/lib/set-reveal-count.ts");
  assert.match(src, /prisma\.card\.count\(\{ where: \{ setCode: code, isPromo: false \} \}\)/);
  assert.match(src, /\["set-reveal-count-v1", code\]/);
  assert.match(src, /\{ revalidate: 900, tags: \[CONTENT_TAG\] \}/);
  // The same WHERE as the hub's "N of 180 revealed" counter.
  assert.match(read("src/lib/radiance-reveals.ts"), /\{ setCode: "RAD", isPromo: false \}/);
});

test("/radiance-preorders: 'Booster Box' in a title and description that fit", () => {
  const src = read(PREORDERS);
  const title = src.match(/title: \{ absolute: "([^"]+)" \}/)?.[1];
  const desc = src.match(/description:\s*"([^"]+)"/)?.[1];
  assert.ok(title && desc);
  assert.ok(title.length <= 60, title);
  assert.match(title, /Booster Box/);
  assert.doesNotMatch(title, /\$|£|€/, "no price: the page renders in the visitor's currency");
  assert.ok(desc.length <= 155, `${desc.length}`);
  assert.match(desc, /^Radiance booster box/);
});

test("/radiance-preorders promises no sealed price alert, and #notify lands on the capture", () => {
  const src = read(PREORDERS);
  // PriceAlert.cardId is required: a sealed product cannot be watched.
  assert.match(read("prisma/schema.prisma"), /model PriceAlert \{[^}]*\bcardId\s+String\s/);
  const start = src.indexOf("We do not forecast prices here");
  const para = src.slice(start, src.indexOf("</p>", start));
  assert.ok(start > 0);
  assert.doesNotMatch(para, /href="\/alerts"/);
  assert.doesNotMatch(para, />a price alert</i);
  assert.match(para, /isBeforeRadianceRelease\(\) \?/);
  assert.match(para, /href="#notify"/);
  assert.match(para, /href="\/sets\/radiance"/);
  assert.match(src, /<div id="notify" className="[^"]*\bscroll-mt-header\b[^"]*">\s*<NewsletterSignup/);
});
