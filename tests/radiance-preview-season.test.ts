import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ARTICLES } from "../src/lib/articles";
import { RADIANCE_CALLOUT_SLUGS, isBeforeRadianceRelease } from "../src/lib/sets/radiance";

// Radiance preview season, 2026-09-24 growth pass. Everything here switches
// itself off on 23 October 2026.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the reveal counter and strip are DB-only, cached, and self-retiring", () => {
  const src = read("src/lib/radiance-reveals.ts");
  assert.match(src, /if \(!isBeforeRadianceRelease\(\)\) return null;/);
  assert.match(src, /where: WHERE/);
  assert.match(src, /const WHERE = \{ setCode: "RAD", isPromo: false \} as const;/);
  assert.match(src, /take: 12/);
  assert.match(src, /tags: \[CONTENT_TAG\]/);
  const c = read("src/components/sets/RadianceReveals.tsx");
  assert.match(c, /of \{RADIANCE_TOTAL_CARDS\} revealed/);
  assert.match(c, /updated \{timeAgo\(/);
  assert.match(read("src/app/sets/[set]/page.tsx"), /set\.slug === "radiance" && <RadianceReveals data=\{radianceReveals\} \/>/);
});

test("the callout sits on three real Radiance posts and retires with the season", () => {
  assert.equal(RADIANCE_CALLOUT_SLUGS.length, 3);
  for (const s of RADIANCE_CALLOUT_SLUGS) {
    const a = ARTICLES.find((x) => x.slug === s);
    assert.ok(a && a.tags.includes("radiance"), s);
  }
  assert.match(read("src/components/ArticleView.tsx"), /radianceSeason && \(RADIANCE_CALLOUT_SLUGS as readonly string\[\]\)\.includes\(article\.slug\)/);
  assert.equal(isBeforeRadianceRelease(new Date("2026-10-23T00:00:01Z")), false);
});

test("the sitewide Radiance banner is gone (owner, 2026-11-07: \"get rid of the radiance is out now\")", () => {
  assert.doesNotMatch(read("src/app/layout.tsx"), /RadianceSeasonBanner/);
  assert.doesNotMatch(read("src/components/home/CinematicHero.tsx"), /RadianceSeasonBanner/);
});
