import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RADIANCE_RELEASE_DATE, isBeforeRadianceRelease } from "../src/lib/sets/radiance";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Radiance launch capture — "email me the day Radiance prices go live"
// (2026-09-23).
//
// lib/release-day.ts emails the opt-in newsletter list on release day, but no
// Radiance surface offered that list, so the launch-month traffic (one leak post
// alone was 28% of the site's search clicks in the 28 days to 2026-09-21) had no
// way onto it. Three surfaces now carry one shared capture: the /sets/radiance
// hub, /radiance-preorders and every radiance-tagged article. These pin the
// attribution (a source the API does not whitelist is silently stored as
// "footer"), the shared pre-release gate, and the article's primary CTA.
// ─────────────────────────────────────────────────────────────────────────────

const PLACEMENTS = [
  "src/components/sets/RadianceHub.tsx",
  "src/app/radiance-preorders/page.tsx",
  "src/components/ArticleView.tsx",
];

/** The <NewsletterSignup … /> element carrying the Radiance source, or null. */
function captureIn(src: string): string | null {
  return /<NewsletterSignup\b[^>]*source="radiance-launch"[^>]*\/>/.exec(src)?.[0] ?? null;
}

test("all three Radiance surfaces render the capture with source=\"radiance-launch\"", () => {
  for (const file of PLACEMENTS) {
    const el = captureIn(read(file));
    assert.ok(el, `${file} must render <NewsletterSignup source="radiance-launch" … />`);
    assert.match(el!, /variant="card"/, `${file}: the boxed inline unit, not the bare footer row`);
    assert.match(el!, /trackEvent="radiance_notify_click"/, `${file}: its own analytics event`);
    assert.match(el!, /cta="Notify me"/, file);
    assert.match(el!, /heading="Get an email the day Radiance prices go live"/, file);
  }
});

test("each placement is gated on the one shared pre-release helper", () => {
  for (const file of PLACEMENTS) {
    const src = read(file);
    assert.match(src, /import \{[^}]*\bisBeforeRadianceRelease\b[^}]*\} from "@\/lib\/sets\/radiance"/, file);
    // The gate must sit in front of the capture, not somewhere else in the file.
    const gateAt = src.lastIndexOf("isBeforeRadianceRelease() && (", src.indexOf('source="radiance-launch"'));
    assert.ok(gateAt > -1, `${file}: the capture must render inside an isBeforeRadianceRelease() gate`);
  }
});

test("the article capture rides the radiance tag and never adds a second primary button", () => {
  const src = read("src/components/ArticleView.tsx");
  assert.match(src, /\{article\.tags\.includes\("radiance"\) && isBeforeRadianceRelease\(\) && \(/);
  // "Compare Radiance preorder prices" stays the block's primary; the capture's
  // submit is the ghost button. "Ready to buy?" below is filled green too.
  assert.match(captureIn(src)!, /button="ghost"/);
  assert.match(src, /href="\/radiance-preorders" className="btn-primary max-w-full text-center">Compare Radiance preorder prices/);
  const component = read("src/components/NewsletterSignup.tsx");
  assert.match(component, /button === "ghost" \? "btn-ghost" : "btn-primary"/);
});

test("the API whitelists radiance-launch, within the schema's 20-character cap", () => {
  const route = read("src/app/api/newsletter/route.ts");
  const sources = /const SOURCES = new Set\(\[([^\]]*)\]\)/.exec(route);
  assert.ok(sources, "SOURCES moved — re-derive this test");
  assert.match(sources![1], /"radiance-launch"/);
  const max = Number(/source: z\.string\(\)\.max\((\d+)\)/.exec(route)?.[1]);
  assert.ok("radiance-launch".length <= max, `"radiance-launch" must fit source's max(${max})`);
});

test("isBeforeRadianceRelease is true before 23 Oct 2026 and false on and after it", () => {
  assert.equal(RADIANCE_RELEASE_DATE, "2026-10-23");
  assert.equal(isBeforeRadianceRelease(new Date("2026-09-23T12:00:00Z")), true);
  assert.equal(isBeforeRadianceRelease(new Date("2026-10-22T23:59:59Z")), true);
  assert.equal(isBeforeRadianceRelease(new Date("2026-10-23T00:00:00Z")), false);
  assert.equal(isBeforeRadianceRelease(new Date("2026-10-23T12:00:00Z")), false);
  assert.equal(isBeforeRadianceRelease(new Date("2026-11-30T00:00:00Z")), false);
  assert.equal(isBeforeRadianceRelease(new Date("2027-01-01T00:00:00Z")), false);
});
