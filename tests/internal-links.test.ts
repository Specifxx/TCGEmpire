import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { getArticles } from "../src/lib/articles";

// ─────────────────────────────────────────────────────────────────────────────
// Every published article must be linked from at least one OTHER article's
// body, or from a hard-coded href in the app/component source. Audited
// 2026-09-21 after an outside SEO review flagged internal linking: 19 of 91
// published articles had no editorial inbound link at all — reachable only from
// the /blog and /guides indexes and the tag-based "recommended reads" module.
// Several were already earning impressions (the card-size guide: 1,413/28d; the
// Shen Signature post: 2,234). Contextual links were written into related
// articles; this keeps the graph from silently growing new orphans.
//
// Uses getArticles() rather than a regex over the source so the content-pack
// articles, whose links are `${L.x}` template variables, resolve properly.
// ─────────────────────────────────────────────────────────────────────────────

const LINK = /\]\((\/(?:blog|guides)\/[a-z0-9-]+)[^)]*\)/g;

test("every published article has an editorial or hard-coded inbound link", () => {
  const articles = getArticles();
  const slugs = new Set(articles.map((a) => a.slug));
  const inbound = new Map<string, number>();

  for (const a of articles) {
    for (const m of a.body.matchAll(LINK)) {
      const slug = m[1].split("/")[2];
      if (slug !== a.slug && slugs.has(slug)) inbound.set(slug, (inbound.get(slug) ?? 0) + 1);
    }
  }
  // Hard-coded links in routes and components (nav groups, hub link lists…).
  const src = execFileSync("grep", ["-rhoE", "/(blog|guides)/[a-z0-9-]+", "src/app", "src/components"], {
    encoding: "utf8",
  });
  for (const m of String(src).matchAll(/\/(?:blog|guides)\/([a-z0-9-]+)/g)) {
    if (slugs.has(m[1])) inbound.set(m[1], (inbound.get(m[1]) ?? 0) + 1);
  }

  const orphans = articles.filter((a) => !inbound.get(a.slug)).map((a) => `/${a.category === "guide" ? "guides" : "blog"}/${a.slug}`);
  assert.deepEqual(orphans, [], `articles with no inbound link — add a contextual link from a related article:\n  ${orphans.join("\n  ")}`);
});

test("the keyword-family guides cross-link each other", () => {
  // Four guides split one topic (combat, timing, growth, game actions). A reader
  // on any of them should be able to reach the other three without the index.
  const bySlug = new Map(getArticles().map((a) => [a.slug, a]));
  const family = [
    "riftbound-combat-keywords-explained",
    "riftbound-timing-keywords-explained",
    "riftbound-growth-keywords-explained",
    "riftbound-game-actions-explained",
  ];
  for (const slug of family) {
    const a = bySlug.get(slug);
    assert.ok(a, `${slug} must exist`);
    for (const other of family.filter((s) => s !== slug)) {
      assert.ok(a!.body.includes(`/guides/${other}`), `${slug} must link ${other}`);
    }
  }
});
