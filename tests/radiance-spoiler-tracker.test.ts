import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ARTICLES } from "../src/lib/articles";

// ─────────────────────────────────────────────────────────────────────────────
// Search Console, 28 days to 2026-09-21: "riftbound radiance spoilers" (1,152
// impr / 163 clicks) and "riftbound radiance card list" (817 / 49) were the
// site's #2 and #5 queries — and every one of those clicks landed on the 8 Sep
// mechanics-LEAK post, because nothing owned the official reveals. Preview
// Season opens 25 Sep. This pins the tracker that now owns them: a dated log
// around a self-populating gallery, so it is current after each reveal with no
// edit, and wired into the surfaces a Radiance visitor actually arrives on.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = "riftbound-radiance-spoilers";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function tracker() {
  const a = ARTICLES.find((x) => x.slug === SLUG);
  assert.ok(a, `expected ${SLUG} to exist`);
  return a!;
}

test("the tracker is a published blog post whose snippet leads with the query", () => {
  const a = tracker();
  assert.equal(a.category, "blog");
  assert.ok(!a.draft, "must be published, not a draft");
  assert.match(a.title, /^Riftbound Radiance Spoilers\b/);
  assert.ok(`${a.title} — RiftCompare`.length <= 60, `title is ${`${a.title} — RiftCompare`.length} chars with the suffix`);
  // The card LIST is /sets/radiance's query (docs/seo-keyword-map.md); the tracker
  // must not compete for it in the title.
  assert.doesNotMatch(a.title, /card list/i);
  assert.ok(a.excerpt.length <= 155, `excerpt is ${a.excerpt.length} chars and would be clamped`);
});

test("the gallery is the whole set, self-populating, and positioned in the body", () => {
  const a = tracker();
  const g = a.embeds?.[0];
  assert.ok(g, "needs an embeds[0] gallery");
  assert.equal(g!.setAll, "RAD", "must be the every-card-of-the-set mode, not a hand-typed slug list");
  assert.equal(g!.filterable, true, "needs the filter bar for the 'most recently added' sort");
  assert.ok(a.body.includes("[[embed:0]]"), "the gallery must be placed inline, not dumped after the body");
});

test("the tracker separates official reveals from leaks and links both ways", () => {
  const a = tracker();
  for (const href of [
    "/blog/riftbound-radiance-leaked-mechanics", // leaks stay on the leak post
    "/blog/riftbound-radiance-what-we-know", // the set's confirmed facts
    "/blog/riftbound-neeko-blending-in-spoiler", // the one card photographed so far
    "/sets/radiance", // the card list's owner
    "/radiance-preorders",
    "/release-dates",
  ]) {
    assert.ok(a.body.includes(`](${href})`), `tracker must link ${href}`);
  }
  assert.ok((a.faq?.length ?? 0) >= 4, "needs a FAQ for FAQPage schema");
  assert.doesNotMatch(a.body, /^##+ .*\bFAQ\b/m, "structured faq is the single source; no hand-written FAQ section");
});

test("the surfaces a Radiance visitor lands on link to the tracker", () => {
  const link = `/blog/${SLUG}`;
  const bySlug = new Map(ARTICLES.map((a) => [a.slug, a]));
  assert.ok(bySlug.get("riftbound-radiance-what-we-know")!.body.includes(link), "what-we-know post must link the tracker");
  assert.ok(bySlug.get("riftbound-radiance-leaked-mechanics")!.body.includes(link), "leak post must link the tracker");
  const hub = read("src/app/sets/[set]/page.tsx");
  const links = hub.slice(hub.indexOf("PRE_RELEASE_LINKS"), hub.indexOf("};", hub.indexOf("PRE_RELEASE_LINKS")));
  assert.ok(links.includes(link), "/sets/radiance pre-release links must include the tracker");
  assert.ok(read("docs/seo-keyword-map.md").includes(link), "keyword map must record the tracker as the spoilers owner");
});

test("only one page targets the radiance spoilers query", () => {
  const titled = ARTICLES.filter((a) => /radiance/i.test(a.title) && /spoiler/i.test(a.title));
  assert.deepEqual(titled.map((a) => a.slug), [SLUG]);
});
