import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ARTICLES, getArticles } from "../src/lib/articles";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Drafts: written, but not published.
// ─────────────────────────────────────────────────────────────────────────────
// ARTICLES had no unpublished state — adding an entry put it in /blog, both
// feeds, the sitemap and the Google News section on the next deploy. That makes
// it impossible to land a post that still has facts to verify without publishing
// the unverified version first.
//
// The failure mode is silent in both directions: a draft that leaks onto a public
// surface looks like a normal post, and a finished post left flagged as a draft
// simply never appears. Neither breaks a build.

const drafts = ARTICLES.filter((a) => a.draft);

test("there is at least one draft, so these guards are not vacuous", () => {
  assert.ok(drafts.length > 0, "no drafts in ARTICLES — this suite would pass trivially");
});

test("no draft reaches any published surface", () => {
  // getArticles() is the single chokepoint: the /blog and /guides indexes, both
  // feeds, the sitemap, the authors pages and the /llm mirrors all read it.
  const published = new Set(getArticles().map((a) => a.slug));
  const leaked = drafts.filter((a) => published.has(a.slug)).map((a) => a.slug);
  assert.deepEqual(leaked, [], `drafts exposed by getArticles(): ${leaked.join(", ")}`);

  // …and per-category, since the indexes call it that way.
  for (const cat of ["blog", "guide"] as const) {
    const inCat = new Set(getArticles(cat).map((a) => a.slug));
    const bad = drafts.filter((a) => inCat.has(a.slug)).map((a) => a.slug);
    assert.deepEqual(bad, [], `drafts exposed by getArticles("${cat}"): ${bad.join(", ")}`);
  }
});

test("the blog feed filters drafts too", () => {
  // getBlogPosts() reads ARTICLES directly rather than going through
  // getArticles(), so it needs its own filter — and it is the one that feeds the
  // Google News sitemap, where an unfinished post is worst.
  const src = read("src/lib/posts.ts");
  assert.match(src, /!a\.draft/, "getBlogPosts must exclude drafts");
});

test("a draft page renders noindex", () => {
  assert.match(
    read("src/app/blog/[slug]/page.tsx"),
    /isDraft[\s\S]{0,200}robots:\s*\{\s*index:\s*false/,
    "blog: a draft must be noindexed",
  );
  assert.match(
    read("src/app/guides/[slug]/page.tsx"),
    /a\.draft\s*\?\s*\{\s*robots:\s*\{\s*index:\s*false/,
    "guides: a draft must be noindexed",
  );
});

test("the related-posts rail never recommends a draft", () => {
  // The one module whose entire job is sending a reader to another page.
  const src = read("src/components/ArticleView.tsx");
  const matches = src.match(/ARTICLES\s*\n?\s*\.filter\(\([^)]*\) =>[^\n]*/g) ?? [];
  assert.ok(matches.length >= 2, "expected both related-post queries to be found");
  for (const m of matches) {
    assert.ok(/!a\.draft/.test(m), `related-posts query does not exclude drafts: ${m.trim()}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// THE ONE THAT MATTERS MOST.
// ─────────────────────────────────────────────────────────────────────────────
// Publishing is a one-line edit (delete `draft: true`), which makes it exactly
// the kind of change that happens in a hurry. This asserts that an article still
// carrying an unresolved [TODO] marker cannot be published by that edit alone —
// the suite fails until the placeholders are actually filled in.
test("an article containing a [TODO] placeholder must still be a draft", () => {
  const offenders: string[] = [];
  for (const a of ARTICLES) {
    if (a.draft) continue;
    const text = [
      a.body,
      a.excerpt,
      ...(a.summary ?? []),
      ...(a.faq ?? []).flatMap((f) => [f.q, f.a]),
      a.browseCta?.blurb ?? "",
      a.embed?.note ?? "",
    ].join("\n");
    if (/\[TODO\b/i.test(text)) offenders.push(a.slug);
  }
  assert.deepEqual(
    offenders,
    [],
    `published articles still contain [TODO] placeholders:\n  ${offenders.join("\n  ")}`,
  );
});
