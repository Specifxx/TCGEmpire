import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getArticles } from "../src/lib/articles";
import { articleHref } from "../src/lib/content/tool-guides";

// How a published article is reached, and where it sends a reader on to
// (2026-09-26, "Blog and tools, joined up" in DECISIONS.md).

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ── A redirect must never shadow a published article ─────────────────────────
// next.config.js redirects run before routes, so a leftover source equal to a
// live article's URL hides the article completely. /guides/whats-in-the-
// riftbound-unleashed-set did exactly that for sixteen days: published, in the
// sitemap, linked from the homepage's guide row on all six market homes, and a
// 308 to /sets/unleashed for anyone who clicked. content-links.test.ts accepts a
// redirect source as a valid link target by design, and watchlist.test.ts only
// checks filesystem routes, so nothing caught it.

const redirectSources = () =>
  new Set([...read("next.config.js").matchAll(/source:\s*"(\/[^"]*)"/g)].map((m) => m[1]));

test("no published article's own URL is a next.config.js redirect source", () => {
  const sources = redirectSources();
  const shadowed = getArticles()
    .map((a) => articleHref(a))
    .filter((href) => sources.has(href));
  assert.deepEqual(shadowed, [], `published articles hidden behind a redirect:\n  ${shadowed.join("\n  ")}`);
});

test("the Unleashed guide is reachable, and its retired /blog twin still redirects", () => {
  const sources = redirectSources();
  assert.ok(getArticles().some((a) => articleHref(a) === "/guides/whats-in-the-riftbound-unleashed-set"));
  assert.ok(!sources.has("/guides/whats-in-the-riftbound-unleashed-set"));
  assert.ok(sources.has("/blog/whats-in-the-riftbound-unleashed-set"), "the retired /blog URL keeps its 301");
});

// ── The tool links under "Ready to buy?" follow the article ───────────────────
// They were /sealed, /deck and /champions on every article. Now they are the
// tools the article explains (toolsForArticle, the inverse of TOOL_GUIDES),
// topped up from that trio. Source-level, like the other ArticleView pins: the
// component imports the database client.

test("ArticleView's related tools come from the tool↔guide map, topped up to three", () => {
  const src = read("src/components/ArticleView.tsx");
  assert.match(src, /const TOOL_FALLBACK: readonly ToolRoute\[\] = \["\/sealed", "\/deck", "\/champions"\];/);
  assert.match(src, /const tools = toolsForArticle\(slug, ctaPath\);/);
  assert.match(src, /const ctaPath = ctaHref\.split\(\/\[\?#\]\/\)\[0\];/, "the CTA's own page is never listed twice");
  assert.match(src, /const tools = articleTools\(article\.slug, cta\.href\);/);
  assert.doesNotMatch(src, /<span className="text-slate-500">Explore:<\/span>/, "the fixed trio is gone");
  // Placement: after "Ready to buy?", before "Recommended reads".
  const ready = src.indexOf("<h2 className=\"font-bold text-white\">Ready to buy?</h2>");
  const row = src.indexOf("{tools.map((t) => (");
  const reads = src.indexOf("Recommended reads</h2>");
  assert.ok(ready > 0 && ready < row && row < reads, "Ready to buy? → related tools → Recommended reads");
});
