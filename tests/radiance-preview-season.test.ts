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

test("the sitewide banner is slim, dismissible, client-decided and gone on release day", () => {
  const b = read("src/components/RadianceSeasonBanner.tsx");
  // Since 2026-10-15 a third, "launch" phase (after previews end) has its own dismissal key.
  assert.match(b, /localStorage\.getItem\(p === "launch" \? LAUNCH_DISMISS_KEY : DISMISS_KEY\)/);
  assert.match(b, /localStorage\.setItem\(was === "launch" \? LAUNCH_DISMISS_KEY : DISMISS_KEY, "1"\)/);
  assert.match(b, /if \(now >= Date\.parse\(`\$\{RADIANCE_RELEASE_DATE\}T00:00:00Z`\)\) return null;/);
  assert.match(b, /href=\{phase === "launch" \? "\/radiance-preorders" : "\/sets\/radiance"\}/);
  assert.match(b, /aria-label="Dismiss the Radiance banner"/);
  assert.match(read("src/app/layout.tsx"), /<RadianceSeasonBanner \/>/);
});

test("on the homepages the banner sits inside the hero, not above it where the hero overlapped it", () => {
  const b = read("src/components/RadianceSeasonBanner.tsx");
  // 2026-10-16, owner: "fix this annoying overlap, can we bring it inside the hero".
  assert.match(b, /const HERO_HOME_PATHS: readonly string\[\] = Object\.values\(REGION_HOME_PATH\);/, "every market homepage, from one list");
  assert.match(b, /if \(placement === "page" && pathname && HERO_HOME_PATHS\.includes\(pathname\)\) return null;/, "the layout's copy steps aside there");
  assert.match(read("src/components/home/CinematicHero.tsx"), /<CreatorsCornerBadge \/>\s*\{\/\*[\s\S]*?\*\/\}\s*<RadianceSeasonBanner placement="hero" \/>/, "the hero renders its own, at the top");
  assert.match(b, /sm:mt-8/, "clear of the absolute creators badge from sm");
});
