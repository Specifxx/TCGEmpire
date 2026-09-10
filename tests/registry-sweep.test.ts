import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const src = read("scripts/sweep-registry.ts");

// ─────────────────────────────────────────────────────────────────────────────
// scripts/sweep-registry.ts is the registry-driven generalisation of
// probe-eu-stores.ts's `--registry` mode to every market. These tests pin the
// same store-quality contract tests/eu-store-quality.test.ts pins for the EU
// pass — the sweep exists to decide which stores get ADDED, so it must apply
// the exact same bar, not a looser one that happens to find more stores.
// ─────────────────────────────────────────────────────────────────────────────

test("the sweep applies the singles threshold, not a raw stock count", () => {
  assert.match(src, /singles < MIN_SINGLES_FOR_STORE/, "must reject stores below the bar the same way the EU probe does");
});

test("the sweep ranks on isSinglesTitle, not raw in-stock product count", () => {
  assert.match(src, /isSinglesTitle\(/, "ranking on raw stock is what produced 96 unusable EU stores in 2026-08");
});

test("the sweep de-duplicates listings across collections before counting", () => {
  assert.match(src, /seenHandles/, "a card listed in two overlapping collections must not count twice");
});

test("the sweep tries the conventional BinderPOS handles, not just sitemap discovery", () => {
  assert.match(src, /CONVENTIONAL_SINGLES_HANDLES/, "sitemap discovery alone missed real singles catalogues (see lib/woocommerce.ts)");
});

test("the sweep also scans collections.json by title, catching handles with no 'riftbound' in them", () => {
  assert.match(src, /\/collections\.json/, "e.g. Toy Snowman's magic-the-gathering-singles-copy handle has no 'riftbound' string");
});

test("the sweep proves currency under the same ?country= the real importer scrapes with", () => {
  assert.match(src, /isoCountry\(/, "products.json carries no currency field — the proof has to be per-market");
});

test("the sweep never retries a 429/Cloudflare rate limit", () => {
  assert.match(src, /isRateLimited/, "must record and move on, matching lib/scrape-http.ts's convention");
});

test("the sweep never touches the database", () => {
  assert.doesNotMatch(src, /@prisma\/client/, "this is a read-only research tool, not part of the import pipeline");
  assert.doesNotMatch(src, /from ["']\.\.\/src\/lib\/db["']/, "must not import the db client");
});

test("the sweep writes its progress file atomically", () => {
  assert.match(src, /renameSync/, "a crash mid-write must never corrupt the resumable progress file");
});

test("the sweep drops social/marketplace registry websites and already-tracked domains", () => {
  assert.match(src, /NOT_A_SHOP/, "roughly half the registry's website field is a social profile, not a webshop");
  assert.match(src, /apexDomain/, "a tracked store's registry entry must be recognised even on a different subdomain");
});
