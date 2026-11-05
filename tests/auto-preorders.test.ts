// The automatic pre-order pages (2026-11-02, DECISIONS.md "Pre-order pages
// build themselves"): every coming-soon set in SETS without a hand-built page
// gets /preorders/<slug>, retiring on its own after release.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SETS } from "../src/lib/constants";
import { AUTO_PREORDER_WINDOW_DAYS, autoPreorderState, openAutoPreorderSets, preorderRouteForSet, preordersHrefForSet } from "../src/lib/release-calendar";

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

test("a set with a hand-built page keeps it; the automatic route redirects there", () => {
  assert.equal(preorderRouteForSet("LGC"), "/legacy-preorders");
  assert.equal(preorderRouteForSet("RAD"), "/radiance-preorders");
  assert.deepEqual(autoPreorderState("legacy", at("2026-11-02")), { kind: "redirect", to: "/legacy-preorders" });
  assert.equal(openAutoPreorderSets(at("2026-11-02")).some((s) => s.code === "LGC"), false);
});

test("any other set in SETS has /preorders/<slug>, linked only while it is a pre-order", () => {
  const ven = SETS.find((s) => s.code === "VEN")!;
  assert.equal(preorderRouteForSet("VEN"), `/preorders/${ven.slug}`);
  assert.equal(preordersHrefForSet("VEN", at("2026-11-02")), null, "a released set links nowhere");
  assert.equal(preorderRouteForSet("NOPE"), null);
  assert.deepEqual(autoPreorderState("not-a-set"), { kind: "missing" });
});

test("a coming-soon set without a page is served, then shows stock, then redirects to its set page", () => {
  const fake = { code: "TST", name: "Test Set", slug: "test-set", comingSoon: true, releasedOn: "2027-05-01" };
  SETS.push(fake);
  try {
    assert.equal(preordersHrefForSet("TST", at("2027-04-01")), "/preorders/test-set");
    assert.deepEqual(autoPreorderState("test-set", at("2027-04-01")), { kind: "page", set: fake, upcoming: true });
    // REC (The Reckoning, 30 Apr 2027) is also open on 1 Apr 2027, so the list is checked for TST alone.
    assert.deepEqual(openAutoPreorderSets(at("2027-04-01")).map((s) => s.code).filter((c) => c === "TST"), ["TST"]);
    assert.deepEqual(autoPreorderState("test-set", at("2027-05-10")), { kind: "page", set: fake, upcoming: false });
    assert.equal(openAutoPreorderSets(at("2027-05-10")).length, 0, "out of the sitemap from release day");
    const late = new Date(Date.parse("2027-05-01T00:00:00+11:00") + (AUTO_PREORDER_WINDOW_DAYS + 1) * 86_400_000);
    assert.deepEqual(autoPreorderState("test-set", late), { kind: "redirect", to: "/sets/test-set" });
  } finally {
    SETS.splice(SETS.indexOf(fake), 1);
  }
});

test("the page: only data, PreOrder before release, six hours, tagged as its own page", () => {
  const page = readFileSync("src/app/preorders/[slug]/page.tsx", "utf8");
  assert.match(page, /export const revalidate = 21600/);
  assert.match(page, /schema\.org\/PreOrder/);
  assert.doesNotMatch(page, /generateStaticParams|@\/lib\/db["']|unstable_cache/);
  assert.doesNotMatch(page, /MSRP|US\$/, "no list price without a source");
  assert.match(page, /pageType="preorders"/);
  assert.match(readFileSync("src/components/PreorderPriceTable.tsx", "utf8"), /startsWith\("\/preorders\/"\)\s*\?\s*"preorders"/);
  assert.match(readFileSync("src/lib/sitemap-sections.ts", "utf8"), /openAutoPreorderSets\(\)/);
});
