import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RADIANCE_PREORDER_CTA_SLUGS, isBeforeRadianceRelease } from "../src/lib/sets/radiance";
import { ARTICLES } from "../src/lib/articles";

// Section 2 of the 2026-09-24 brief: route Radiance search traffic to
// /radiance-preorders. DECISIONS.md, "Routing Radiance search traffic to
// /radiance-preorders".

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the three Radiance posts carry the CTA, and they all exist", () => {
  assert.deepEqual([...RADIANCE_PREORDER_CTA_SLUGS].sort(), [
    "riftbound-radiance-leaked-mechanics",
    "riftbound-radiance-spoilers",
    "riftbound-radiance-what-we-know",
  ]);
  for (const slug of RADIANCE_PREORDER_CTA_SLUGS) assert.ok(ARTICLES.some((a) => a.slug === slug), slug);
});

test("two placements per page: near the top, and after the first major section", () => {
  const view = read("src/components/ArticleView.tsx");
  assert.match(view, /\{preorderCta && <RadiancePreorderCta placement="top" \/>\}/);
  assert.match(view, /\{preorderCta && <RadiancePreorderCta placement="section" withSignup \/>\}/);
  assert.ok(
    view.indexOf('placement="top"') < view.indexOf("<AnswerBox"),
    "the top placement renders above the TL;DR",
  );
  const set = read("src/app/sets/[set]/page.tsx");
  assert.match(set, /set\.slug === "radiance" && <RadiancePreorderCta placement="top" \/>/);
  assert.match(set, /set\.slug === "radiance" && <RadiancePreorderCta placement="section" \/>/);
});

test("the price is the cheapest OPEN Booster Box offer in the visitor's market, never another market's", () => {
  const loader = read("src/lib/radiance-cta.ts");
  assert.match(loader, /g\.productType === "Booster Box"/);
  assert.match(loader, /box\?\.lowestPriceCents != null/, "lowestPriceCents is the open-offer headline");
  assert.doesNotMatch(loader.replace(/^\s*\/\/.*$/gm, ""), /unstable_cache/, "never re-wrap a self-caching loader");
  const view = read("src/components/RadiancePreorderCtaView.tsx");
  assert.match(view, /const cents = prices\[country\];/);
  assert.match(view, /href="\/radiance-preorders"/);
  assert.match(view, /Get an email the day Radiance prices go live/);
});

test("from release day the block drops the pre-order framing and links to the set's prices", () => {
  assert.equal(isBeforeRadianceRelease(new Date("2026-10-22T23:59:59Z")), true);
  assert.equal(isBeforeRadianceRelease(new Date("2026-10-23T00:00:00Z")), false);
  const cta = read("src/components/RadiancePreorderCta.tsx");
  assert.match(cta, /if \(!isBeforeRadianceRelease\(\)\) \{[\s\S]*?href="\/sets\/radiance#price-guide"/);
});
