import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// "One page per set in Google" (DECISIONS.md, 2026-10-27): Google split "<set> card list"
// between /sets/<slug> and its gallery, so the gallery canonicalises to the set page and
// only the set page is in the sitemap.
const read = (p: string) => readFileSync(p, "utf8");

test("the set gallery canonicalises to its set page", () => {
  const gallery = read("src/app/sets/[set]/gallery/page.tsx");
  assert.ok(gallery.includes("alternates: pageAlternates(`/sets/${set.slug}`"), "gallery canonical must be /sets/<slug>");
  assert.ok(!gallery.includes("pageAlternates(`/sets/${set.slug}/gallery`"), "gallery must not self-canonicalise");
});

test("the sitemap submits the set page, not its gallery", () => {
  const sitemap = read("src/lib/sitemap-sections.ts");
  assert.ok(!/\/sets\/\$\{s\.slug\}\/gallery/.test(sitemap), "no /sets/<slug>/gallery URL in the sitemap");
});
