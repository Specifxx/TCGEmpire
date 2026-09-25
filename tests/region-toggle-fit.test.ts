import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// "The website is way too small for phone now and zoomed out" (2026-09-22).
//
// Not a font-size or a zoom setting: RegionToggle's segmented market row was
// `inline-flex` with no wrapping, so its min-content width was the SUM of all
// six market buttons — 441px, measured at a 390px viewport. A flex item cannot
// shrink below min-content, and the parent's own `flex-wrap` could not help
// because it wraps the row as a single unit.
//
// So /tools/deal-finder and /tools/value-finder laid out 457px wide on a 390px
// phone. Chrome for Android's response to content wider than the viewport is to
// WIDEN THE LAYOUT VIEWPORT and scale the page down to fit — and it persists
// that zoom per site, so every other page renders shrunken afterwards. One
// un-wrappable row on two tool pages read as "the whole site is zoomed out",
// which is why the report named no particular page.
//
// The invariant, stated so it survives a future market being added: no
// horizontal strip of per-market controls may be unable to wrap. COUNTRY_LIST
// has already grown once (EU was the sixth) and the sixth is what broke it.
// ─────────────────────────────────────────────────────────────────────────────

test("RegionToggle's market row can wrap, so it can never exceed the viewport", () => {
  const src = codeOnly(read("src/components/RegionToggle.tsx"));
  const rowAt = src.indexOf("rounded-lg border border-ink-700 bg-ink-900 p-1");
  assert.ok(rowAt >= 0, "expected the segmented market row");
  const row = src.slice(Math.max(0, rowAt - 120), rowAt + 60);
  assert.match(row, /flex-wrap/, "the row must wrap — without it its min-content width is the sum of every market button");
  assert.ok(
    !/\binline-flex\b/.test(row),
    "inline-flex here is the exact shape that forced a 441px min-content width on a 390px phone",
  );
});

test("every market in COUNTRY_LIST is still rendered — wrapping must not hide one", () => {
  // The alternative fix (overflow-x-auto) would have put markets behind a
  // scroll gesture. Wrapping keeps all of them visible, and this pins that the
  // component still maps the full list rather than slicing it to fit.
  const src = codeOnly(read("src/components/RegionToggle.tsx"));
  assert.match(src, /COUNTRY_LIST\.map\(/);
  assert.ok(!/COUNTRY_LIST\.slice\(/.test(src), "no market may be dropped to make the row fit");
});

test("the mobile audit actually loads the tool pages that carry this control", () => {
  // The audit is the thing that would have caught this and had never once
  // loaded the page. A fix that leaves the blind spot open is half a fix.
  const src = read("scripts/mobile-check.ts");
  const defaults = /process\.env\.MOBILE_CHECK_PATHS \?\?\s*\n?\s*"([^"]+)"/.exec(src)?.[1] ?? "";
  assert.ok(defaults.includes("/tools/deal-finder"), "deal-finder carries RegionToggle and must be audited");
  // /tools/value-finder carried it too until the Value Finder left the product
  // (2026-09-25); every page still rendering the control must stay audited.
  for (const f of ["src/app/tools/deal-finder/page.tsx"]) {
    assert.match(read(f), /<RegionToggle/, `${f} is expected to carry RegionToggle`);
  }
  assert.ok(!defaults.includes("/tools/value-finder"), "a redirected URL audits /movers, not the control");
});
