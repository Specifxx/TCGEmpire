import test from "node:test";
import assert from "node:assert/strict";
import { ARTICLES } from "../src/lib/articles";

// ─────────────────────────────────────────────────────────────────────────────
// The "leaked mechanics" post (tagged "spoilers") is Radiance's highest-traffic
// blog entry and already sends readers to /radiance-preorders twice in the
// body. It predates /sets/radiance — the content-complete hub (confirmed
// facts, legends, live pre-order table, FAQ) — which didn't exist when this
// post was last written, so it never linked there. Pin that gap closed.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = "riftbound-radiance-leaked-mechanics";

function article() {
  const a = ARTICLES.find((x) => x.slug === SLUG);
  assert.ok(a, `expected to find the ${SLUG} article`);
  return a!;
}

test("the leaked-mechanics post is tagged radiance and spoilers, as this file assumes", () => {
  const a = article();
  assert.ok(a.tags.includes("radiance"));
  assert.ok(a.tags.includes("spoilers"));
});

test("the body links to the Radiance hub, not just the pre-order comparison", () => {
  const a = article();
  assert.match(a.body, /\[Radiance hub\]\(\/sets\/radiance\)/);
});

test("the body still links to Radiance pre-order pricing (unchanged, not regressed by the hub link)", () => {
  const a = article();
  const matches = a.body.match(/\(\/radiance-preorders\)/g) ?? [];
  assert.ok(matches.length >= 2, "expected the two pre-existing /radiance-preorders links to still be there");
});
