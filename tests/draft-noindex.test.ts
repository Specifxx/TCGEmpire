import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ARTICLES, draftNoindexHeaders, getArticle } from "../src/lib/articles";

// A draft still carries [TODO] markers in its body. /blog/<slug> and /guides/<slug>
// noindex those, but both pages advertise a `text/markdown` rel=alternate pointing
// at /llm/blog/<slug> and /llm/guides/<slug> — and those mirrors served the same
// unfinished text at HTTP 200 with no robots signal. The noindexed page was handing
// crawlers an indexable copy of itself. These pin the header that closes that.

test("every draft article gets a noindex header for its markdown mirror", () => {
  const drafts = ARTICLES.filter((a) => a.draft);
  assert.ok(drafts.length > 0, "fixture check: the corpus should contain at least one draft");
  for (const a of drafts) {
    assert.deepEqual(
      draftNoindexHeaders(a.slug),
      { "X-Robots-Tag": "noindex, follow" },
      `draft "${a.slug}" must not be indexable via its markdown mirror`,
    );
  }
});

test("published articles are not noindexed", () => {
  const published = ARTICLES.filter((a) => !a.draft);
  assert.ok(published.length > 0);
  for (const a of published) {
    assert.deepEqual(draftNoindexHeaders(a.slug), {}, `published "${a.slug}" must stay indexable`);
  }
});

test("an unknown slug adds no headers", () => {
  // The mirrors 404 before reaching this, but it must not throw or invent a header.
  assert.deepEqual(draftNoindexHeaders("no-such-article-slug"), {});
});

test("follow is preserved, so a draft's outbound links still pass equity", () => {
  const draft = ARTICLES.find((a) => a.draft);
  assert.ok(draft);
  assert.match(draftNoindexHeaders(draft.slug)["X-Robots-Tag"], /\bfollow\b/);
  assert.doesNotMatch(draftNoindexHeaders(draft.slug)["X-Robots-Tag"], /\bnofollow\b/);
});

// ── Sitemap must not submit a page that says noindex ────────────────────────
// "Submitted URL marked 'noindex'" in Search Console: crawl budget spent to be
// told to go away, and a site that disagrees with itself. /feedback carries a
// blanket noindex (AdSense remediation § Phase 7) and was being submitted anyway.
// Read as source rather than by calling core(): that builder awaits priceDay(),
// which needs the database, and this suite runs without one.
const sitemapSrc = readFileSync(join(process.cwd(), "src/lib/sitemap-sections.ts"), "utf8");
const submittedPaths = [...sitemapSrc.matchAll(/^\s*\{\s*url:\s*`\$\{SITE_URL\}(\/[a-z0-9/-]*)`/gim)].map((m) => m[1]);

test("the sitemap does not submit /feedback, which is noindex", () => {
  assert.ok(submittedPaths.length > 0, "fixture check: the parse should find sitemap entries");
  assert.ok(
    !submittedPaths.includes("/feedback"),
    "/feedback sets robots.index=false, so it must not be submitted in the sitemap",
  );
});

test("the trust pages a reviewer looks for are still submitted", () => {
  // Positive control: proves the assertion above is not passing because the parse
  // came back empty or the entry shape changed underneath it.
  assert.ok(submittedPaths.includes("/about"), `parsed: ${submittedPaths.join(", ")}`);
  assert.ok(submittedPaths.includes("/editorial-policy"));
});

test("/feedback still declares its own noindex (the reason it is not submitted)", () => {
  const page = readFileSync(join(process.cwd(), "src/app/feedback/page.tsx"), "utf8");
  assert.match(page, /robots:\s*\{\s*index:\s*false,\s*follow:\s*true\s*\}/);
});

test("draft articles are real, resolvable articles (the mirror does serve them)", () => {
  // If getArticle stopped resolving drafts the header would be moot — but so would
  // the leak. This pins WHY the header is needed: the slug resolves, so the mirror
  // would render it.
  const draft = ARTICLES.find((a) => a.draft);
  assert.ok(draft);
  assert.equal(getArticle(draft.slug)?.slug, draft.slug);
});
