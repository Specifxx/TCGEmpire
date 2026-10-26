import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// AdSense off, Journey on articles only (owner, 2026-10-26; DECISIONS.md).
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("AdSense is switched off at one constant, and the loader honours it", () => {
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
