import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { carriesRadiancePreorderCta, isBeforeRadianceRelease } from "../src/lib/sets/radiance";
import { ARTICLES } from "../src/lib/articles";

// Section 2 of the 2026-09-24 brief: route Radiance search traffic to
// /radiance-preorders. DECISIONS.md, "Routing Radiance search traffic to
// /radiance-preorders"; widened from three slugs to a rule on 2026-09-26
// ("Reddit landings: the pre-order CTA, the eBay strip and click attribution").

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const bySlug = (slug: string) => {
  const a = ARTICLES.find((x) => x.slug === slug);
  assert.ok(a, `${slug} must exist`);
  return a!;
};

test("every Radiance news post carries the CTA — the original three and the Reddit-shared spoilers", () => {
  for (const slug of [
    // The 2026-09-24 three (Search Console's top Radiance pages).
    "riftbound-radiance-leaked-mechanics",
    "riftbound-radiance-spoilers",
    "riftbound-radiance-what-we-know",
    // The spoiler posts the hand-picked list missed — the ones shared on Reddit.
    "riftbound-seraphine-radiance-spoiler",
    "riftbound-ksante-radiance-spoiler",
    "riftbound-neeko-blending-in-spoiler",
  ]) {
    assert.ok(carriesRadiancePreorderCta(bySlug(slug)), `${slug} must carry the pre-order CTA`);
  }
});

test("Radiance guides keep the article-end capture instead, so it is never dead code", () => {
  // The article-end capture renders on `radiance && pre-release && !preorderCta`.
  // A tag-only rule would make that condition unsatisfiable; the category split
  // keeps it live for the evergreen guides.
  const guides = ARTICLES.filter((a) => a.tags.includes("radiance") && a.category === "guide");
  assert.ok(guides.length > 0, "expected at least one Radiance guide");
  for (const g of guides) assert.equal(carriesRadiancePreorderCta(g), false, `${g.slug} is a guide`);
  // …and nothing untagged picks it up.
  assert.equal(carriesRadiancePreorderCta({ category: "blog", tags: ["vendetta", "news"] }), false);
});

test("ArticleView reads the rule, not a hand-typed slug list", () => {
  const view = read("src/components/ArticleView.tsx");
  assert.match(view, /const preorderCta = carriesRadiancePreorderCta\(article\);/);
  assert.doesNotMatch(view, /RADIANCE_PREORDER_CTA_SLUGS/);
});

test("a click on the CTA is measured, through the one trackEvent()", () => {
  const view = read("src/components/RadiancePreorderCtaView.tsx");
  assert.match(view, /onClick=\{\(\) => trackEvent\("preorder_cta_click", \{ placement,/);
  // A click is low-volume, so it must reach Vercel too — never GA4-only.
  assert.doesNotMatch(read("src/lib/analytics.ts"), /"preorder_cta_click"/);
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
