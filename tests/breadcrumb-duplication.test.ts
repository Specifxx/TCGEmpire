import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// <Breadcrumbs> (components/Breadcrumbs.tsx) already emits its own BreadcrumbList
// JSON-LD alongside the visible trail it renders — see that file's own header
// comment. A route that ALSO calls the raw breadcrumb() builder and puts the
// result in a second <script> block describes the same hierarchy twice in one
// document, which is exactly the anti-pattern tests/pack-composition.test.ts
// already pins for games/pack-sim.
//
// Found live on three routes during the 2026-09 SEO pass (stores/[slug],
// champions/[slug], champions/page.tsx) — all three imported BOTH `Breadcrumbs`
// and `breadcrumb` and used both. Fixed by dropping the redundant breadcrumb()
// call (and its now-unused import) from each, keeping <Breadcrumbs> as the sole
// emitter. This test generalises the one-off pack-sim regression test into a
// repo-wide rule so the same mistake can't reappear on a fourth route unnoticed.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const APP_DIR = join(ROOT, "src/app");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (entry === "page.tsx") out.push(p);
  }
  return out;
}

test("no page.tsx imports both <Breadcrumbs> and the raw breadcrumb() builder", () => {
  const pages = walk(APP_DIR);
  const offenders: string[] = [];
  for (const p of pages) {
    const src = readFileSync(p, "utf8");
    const usesComponent = /<Breadcrumbs\s/.test(src);
    // Only the raw builder import — not the type-only `Crumb` import some pages
    // use for their own trail array typing.
    const importsBuilder = /import\s*\{[^}]*\bbreadcrumb\b[^}]*\}\s*from\s*["']@\/lib\/jsonld["']/.test(src);
    if (usesComponent && importsBuilder) offenders.push(p.replace(ROOT + "/", ""));
  }
  assert.deepEqual(offenders, [], `these routes import both <Breadcrumbs> and breadcrumb() — pick one: ${offenders.join(", ")}`);
});

test("the three routes fixed for this bug stay fixed", () => {
  // Specific regression pins, in addition to the repo-wide sweep above — so a
  // future refactor that renames the sweep's pattern still catches these three
  // by name.
  for (const rel of ["src/app/stores/[slug]/page.tsx", "src/app/champions/[slug]/page.tsx", "src/app/champions/page.tsx"]) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    assert.match(src, /<Breadcrumbs\s/, `${rel}: expected a breadcrumb trail`);
    assert.doesNotMatch(src, /"@type":\s*"BreadcrumbList"/, `${rel}: duplicate BreadcrumbList — <Breadcrumbs> already emits one`);
  }
});
