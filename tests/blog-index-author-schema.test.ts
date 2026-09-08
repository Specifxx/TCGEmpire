import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// The /blog index page's Blog/BlogPosting JSON-LD used to hardcode every post's
// author as `{ "@type": "Person", name: a.author }` — which mistypes the site's
// own Organization byline ("RiftCompare") as a Person, a fabricated-credential
// mismatch ArticleView.tsx (the actual article pages) and authors/[slug]/page.tsx
// both already avoid by resolving the real type through authorJsonLd(). The blog
// index was the one place still hand-typing it.
// ─────────────────────────────────────────────────────────────────────────────

test("the blog index's per-post author schema uses authorJsonLd(), not a hardcoded Person", () => {
  const src = read("src/app/blog/page.tsx");
  assert.match(src, /import\s*\{\s*authorJsonLd\s*\}\s*from\s*["']@\/lib\/content\/authors["']/, "must import the shared author-schema helper");
  assert.match(src, /author:\s*authorJsonLd\(/, "blogPost entries must resolve author type via authorJsonLd()");
  assert.doesNotMatch(
    src,
    /author:\s*\{\s*"@type":\s*"Person"/,
    'must not hardcode "@type": "Person" for every author — an Organization byline would be mistyped',
  );
});
