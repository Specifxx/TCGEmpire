import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// AdSense off, Journey on articles only, AdSense back on, off again, on again, then off (owner, 2026-10-26, 27, 2026-11-01 and 2026-11-03; DECISIONS.md).
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("AdSense is switched at one constant (off since 2026-11-03), and the loader honours it", () => {
  const lib = read("src/lib/adsense.ts");
  assert.match(lib, /export const ADSENSE_SERVING = false;/);
  assert.match(lib, /AD_UNITS_ENABLED =\s*ADSENSE_SERVING &&/);
  assert.match(read("src/components/AdSenseLoader.tsx"), /if \(!ADSENSE_SERVING\) return null;/);
});

test("Journey loads only on blog and guide articles", () => {
  assert.doesNotMatch(read("src/app/layout.tsx"), /<MediavineLoader/);
  for (const p of ["src/app/blog/[slug]/page.tsx", "src/app/guides/[slug]/page.tsx"]) {
    assert.match(read(p), /<MediavineLoader \/>/, p);
  }
  const loader = read("src/components/MediavineLoader.tsx");
  assert.match(loader, /hasAttribute\(AD_FREE_ATTR\)\) return;/, "never for an ad-free member");
  assert.match(loader, /window\.location\.assign/, "links off an article are full page loads");
});

test("while AdSense is off, the Rate us strip and the rating form say so and ask for a review", () => {
  const lib = read("src/lib/adsense.ts");
  assert.match(lib, /ADS_OFF_NOTICE: string \| null = ADSENSE_SERVING\s*\? null/);
  assert.match(read("src/components/RateUsStrip.tsx"), /ADS_OFF_NOTICE/);
  assert.match(read("src/components/RatingReviewForm.tsx"), /data-ads-off-notice/);
});
