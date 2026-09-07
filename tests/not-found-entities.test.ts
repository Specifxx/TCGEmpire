import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// A real 404 status (not a 200 rendering "not found" copy, and not a soft-404)
// for every major entity route is checked piecemeal across many feature-specific
// test files (deck-groups.test.ts, region-pages.test.ts, etc.) but has no single
// place asserting the whole set at once — this is that place. Each assertion
// below pins the SAME source-level guard confirmed live in each route file: a
// Next.js `notFound()` call, thrown when the requested slug/id doesn't resolve
// to a real entity, which is what src/app/not-found.tsx's own header comment
// says is the only thing that reliably produces a genuine HTTP 404 with correct
// metadata (a `notFound()` throw discards the route's own generateMetadata
// result — src/app/not-found.tsx owns what's actually served).
//
// These are structural (source-pattern) checks, not live HTTP requests — this
// repo's test environment has no database, so a real request/response 404 check
// isn't possible here; scripts/crawl-check.ts and scripts/seo-gate.ts cover that
// against a running server with a database instead.
// ─────────────────────────────────────────────────────────────────────────────

const ENTITY_ROUTES: [name: string, file: string, guard: RegExp][] = [
  ["card", "src/app/card/[id]/page.tsx", /if\s*\(\s*!card\s*\)\s*notFound\(\)/],
  ["set", "src/app/sets/[set]/page.tsx", /if\s*\(\s*!set\s*\)\s*notFound\(\)/],
  ["champion", "src/app/champions/[slug]/page.tsx", /if\s*\(\s*!champ\s*\)\s*notFound\(\)/],
  ["domain", "src/app/domains/[slug]/page.tsx", /if\s*\(\s*!domain\s*\)\s*notFound\(\)/],
  ["keyword", "src/app/keywords/[slug]/page.tsx", /if\s*\(\s*!kw\s*\)\s*notFound\(\)/],
  ["deck", "src/app/decks/[slug]/page.tsx", /if\s*\(\s*!seed\s*\)\s*notFound\(\)/],
  ["deck archetype group", "src/app/decks/archetype/[slug]/page.tsx", /if\s*\(\s*!group\s*\|\|\s*seedsInGroup\(group\)\.length\s*===\s*0\s*\)\s*notFound\(\)/],
  ["deck domain group", "src/app/decks/domain/[slug]/page.tsx", /if\s*\(\s*!group\s*\|\|\s*seedsInGroup\(group\)\.length\s*===\s*0\s*\)\s*notFound\(\)/],
  ["card type facet", "src/app/cards/type/[type]/page.tsx", /if\s*\(\s*!facet\s*\)\s*notFound\(\)/],
  ["card rarity facet", "src/app/cards/rarity/[rarity]/page.tsx", /if\s*\(\s*!facet\s*\)\s*notFound\(\)/],
  ["card printing facet", "src/app/cards/printing/[printing]/page.tsx", /if\s*\(\s*!facet\s*\)\s*notFound\(\)/],
];

for (const [name, file, guard] of ENTITY_ROUTES) {
  test(`${name} page 404s a slug/id that doesn't resolve to a real entity`, () => {
    const src = read(file);
    assert.match(src, /notFound\(\)/, `${file}: expected a notFound() call at all`);
    assert.match(src, guard, `${file}: expected the specific "unresolved entity → notFound()" guard`);
    // notFound() only produces a real 404 status/metadata via Next's not-found
    // boundary — confirm the route also imports it from next/navigation rather
    // than, say, a same-named local helper that renders inline "not found" copy
    // at HTTP 200 (a soft 404).
    assert.match(src, /import\s*\{[^}]*\bnotFound\b[^}]*\}\s*from\s*["']next\/navigation["']/, `${file}: notFound must come from next/navigation, not a local soft-404 helper`);
  });
}

test("champion page also 404s a real champion with zero live cards, not just an unknown slug", () => {
  // Distinct from the unknown-slug case above: champions/[slug] additionally
  // guards against a champion whose slug IS valid but whose card query legitimately
  // returns nothing, so a thin/empty page is never served at 200 — but a DB
  // outage must NOT 404 a real champion (see the source's own dbReachable guard).
  const src = read("src/app/champions/[slug]/page.tsx");
  assert.match(
    src,
    /if\s*\(\s*dbReachable\s*&&\s*cards\.length\s*===\s*0\s*\)\s*notFound\(\)/,
    "expected a zero-cards 404 that fails OPEN (skipped) on a DB outage, not fails closed",
  );
});

test("the root not-found boundary is what actually serves 404 metadata", () => {
  // Per src/app/not-found.tsx's own header comment: a notFound() thrown by any
  // page above discards that route's own generateMetadata result, so THIS file
  // is what determines the served title/robots — confirming it exists and uses
  // notFoundMetadata() (index:false) is what makes every assertion above mean
  // anything for what a crawler actually receives.
  const src = read("src/app/not-found.tsx");
  assert.match(src, /export const metadata\s*=\s*notFoundMetadata\(/, "root not-found.tsx must set robots:noindex via notFoundMetadata()");
});
