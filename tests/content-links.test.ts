import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { ARTICLES, getArticles } from "../src/lib/articles";
import { COUNTRY_GUIDE_SLUGS, hreflangForCountryGuide } from "../src/lib/seo";
import { extractToc, headingId } from "../src/lib/toc";

// ─────────────────────────────────────────────────────────────────────────────
// Guards for the editorial content pack.
//
// The failure these exist to prevent is specific and has a long history in SEO
// work: an article confidently links to a page that doesn't exist. It looks fine
// in review (the markdown is well-formed), it renders fine (a link is a link),
// and it is only discovered when a crawler reports a 404 — by which point the
// page has been shipping dead internal links for weeks.
//
// SOURCE-LEVEL, like tests/seo-landing-pages.test.ts: no server, no database, so
// this can gate a PR.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const APP = join(ROOT, "src/app");

/** Every internal href in every article body, summary, CTA and FAQ answer. */
function internalLinks(): { slug: string; href: string }[] {
  const out: { slug: string; href: string }[] = [];
  const collect = (slug: string, text: string) => {
    // `(?<!!)` skips markdown IMAGES — `![alt](/hero.png)` points at a file in
    // public/, not a route, and is covered by scripts/check-images.ts instead.
    for (const m of text.matchAll(/(?<!!)\[[^\]]*\]\((\/[^)\s]*)\)/g)) out.push({ slug, href: m[1] });
  };
  for (const a of ARTICLES) {
    collect(a.slug, a.body);
    for (const s of a.summary ?? []) collect(a.slug, s);
    for (const f of a.faq ?? []) collect(a.slug, f.a);
    if (a.browseCta) out.push({ slug: a.slug, href: a.browseCta.href });
  }
  return out;
}

/** Redirect sources declared in next.config.js — a 301 target counts as existing. */
function redirectSources(): Set<string> {
  const cfg = readFileSync(join(ROOT, "next.config.js"), "utf8");
  return new Set([...cfg.matchAll(/source:\s*"([^"]+)"/g)].map((m) => m[1]));
}

/**
 * Resolve a site-relative path against the App Router tree. Handles static
 * segments, dynamic [param] segments, and route groups.
 */
function routeExists(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);

  const walk = (dir: string, rest: string[]): boolean => {
    if (rest.length === 0) {
      return ["page.tsx", "page.ts", "route.ts", "route.tsx"].some((f) => existsSync(join(dir, f)));
    }
    const [head, ...tail] = rest;
    const exact = join(dir, head);
    if (existsSync(exact) && statSync(exact).isDirectory() && walk(exact, tail)) return true;
    // A dynamic segment matches anything; a catch-all matches the remainder.
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (/^\[\.\.\..+\]$/.test(entry.name)) return true;
      if (/^\[[^.].*\]$/.test(entry.name) && walk(join(dir, entry.name), tail)) return true;
    }
    return false;
  };

  return walk(APP, segments);
}

test("every internal link in an article resolves to a real route or a declared redirect", () => {
  const redirects = redirectSources();
  const broken: string[] = [];
  for (const { slug, href } of internalLinks()) {
    const path = href.split("#")[0].split("?")[0].replace(/\/$/, "") || "/";
    if (redirects.has(path)) continue;
    if (!routeExists(path)) broken.push(`${slug} → ${href}`);
  }
  assert.deepEqual(broken, [], `articles link to routes that do not exist:\n  ${broken.join("\n  ")}`);
});

test("article slugs are unique", () => {
  const seen = new Map<string, number>();
  for (const a of ARTICLES) seen.set(a.slug, (seen.get(a.slug) ?? 0) + 1);
  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([s]) => s);
  assert.deepEqual(dupes, [], `duplicate article slugs would make one unreachable: ${dupes.join(", ")}`);
});

test("every article carries a title, excerpt, author and a parseable date", () => {
  for (const a of ARTICLES) {
    assert.ok(a.title.trim(), `${a.slug}: empty title`);
    assert.ok(a.excerpt.trim(), `${a.slug}: empty excerpt — it is the meta description`);
    assert.ok(a.author.trim(), `${a.slug}: no author byline`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(a.date), `${a.slug}: date must be ISO YYYY-MM-DD, got "${a.date}"`);
    if (a.updated) {
      assert.ok(a.updated >= a.date, `${a.slug}: dateModified (${a.updated}) precedes datePublished (${a.date})`);
    }
  }
});

test("meta descriptions stay in the length Google will render", () => {
  // Not a hard SEO rule, but an excerpt over ~250 chars is certainly truncated
  // in the SERP, and a one-line one is a wasted slot.
  for (const a of ARTICLES) {
    assert.ok(a.excerpt.length >= 50, `${a.slug}: excerpt is only ${a.excerpt.length} chars`);
    assert.ok(a.excerpt.length <= 250, `${a.slug}: excerpt is ${a.excerpt.length} chars and will be truncated`);
  }
});

test("every article hero image exists on disk and has alt text", () => {
  for (const a of ARTICLES) {
    if (!a.hero) continue;
    assert.ok(a.hero.alt.trim(), `${a.slug}: hero image has no alt text`);
    const file = join(ROOT, "public", a.hero.src.replace(/^\//, ""));
    assert.ok(existsSync(file), `${a.slug}: hero image ${a.hero.src} is not in public/`);
  }
});

test("a TOC entry always has a heading to jump to", () => {
  for (const a of ARTICLES) {
    const toc = extractToc(a.body);
    const ids = new Set(toc.map((t) => t.id));
    assert.equal(ids.size, toc.length, `${a.slug}: two TOC entries share an anchor id`);
    for (const t of toc) {
      assert.ok(t.text.trim(), `${a.slug}: empty heading text`);
      assert.ok(headingId(t.text), `${a.slug}: heading "${t.text}" produces an empty anchor`);
    }
  }
});

test("ArticleView refuses to render a second FAQ when the body already has one", () => {
  // Ten pre-existing articles carry BOTH a structured `faq` (for the FAQPage
  // JSON-LD) and a hand-written "## … FAQ" markdown section — the duplication
  // lib/articles.ts's own doc comment admits to. Rendering the structured FAQ
  // visibly, as this batch now does, would show those readers the same questions
  // twice. ArticleView guards on the body instead, so this can't happen; the
  // guard is load-bearing enough to assert on.
  const src = readFileSync(join(ROOT, "src/components/ArticleView.tsx"), "utf8");
  assert.ok(
    src.includes("bodyHasFaqSection"),
    "ArticleView must skip <ArticleFaq> when the body already contains a visible FAQ section"
  );
});

test("no NEW content-pack article duplicates its FAQ in the body", () => {
  // The pack is the clean baseline: structured `faq` is the single source, and
  // nothing hand-writes a second copy. The legacy articles are migrating.
  const packSlugs = new Set([
    "riftbound-card-values",
    "ebay-bidding-strategies",
    "tcgplayer-fees",
    "currency-conversion-fees",
    "most-expensive-riftbound-cards",
    "best-riftbound-marketplaces",
    "riftbound-card-price-comparison",
    "riftcompare-review",
    "how-to-choose-a-riftbound-marketplace",
    "riftbound-variant-glossary",
  ]);
  const offenders = ARTICLES.filter(
    (a) => packSlugs.has(a.slug) && a.faq?.length && /^##+ .*\bFAQ\b/m.test(a.body)
  ).map((a) => a.slug);
  assert.deepEqual(offenders, [], `content-pack articles duplicating their FAQ: ${offenders.join(", ")}`);
});

test("the six country buying guides form a complete hreflang cluster", () => {
  for (const slug of Object.values(COUNTRY_GUIDE_SLUGS)) {
    const article = ARTICLES.find((a) => a.slug === slug);
    assert.ok(article, `hreflang cluster names ${slug}, which is not an article`);
    assert.equal(article!.category, "blog", `${slug} must live under /blog for its hreflang URLs to resolve`);
    const map = hreflangForCountryGuide(slug);
    assert.ok(map, `${slug} should be recognised as a country guide`);
    // Six markets plus x-default, all pointing at real cluster members.
    assert.equal(Object.keys(map!).length, 7, `${slug}: expected 6 locales + x-default`);
  }
});

test("the five briefed articles are published under their briefed slugs", () => {
  const required = [
    "riftbound-card-values",
    "ebay-bidding-strategies",
    "tcgplayer-fees",
    "currency-conversion-fees",
    "most-expensive-riftbound-cards",
  ];
  const slugs = new Set(getArticles().map((a) => a.slug));
  for (const slug of required) assert.ok(slugs.has(slug), `content-pack article missing: ${slug}`);
});

test("the AI-visibility target pages exist and carry a FAQ", () => {
  // These four pages exist to be CITED by answer engines. A structured FAQ is
  // the single most liftable block on them, so an edit that drops it defeats the
  // page's whole reason for existing.
  const targets = [
    "best-riftbound-marketplaces",
    "riftbound-card-price-comparison",
    "riftcompare-review",
    "how-to-choose-a-riftbound-marketplace",
  ];
  for (const slug of targets) {
    const a = ARTICLES.find((x) => x.slug === slug);
    assert.ok(a, `AI-visibility target page missing: ${slug}`);
    assert.ok((a!.faq?.length ?? 0) >= 3, `${slug}: needs at least 3 structured FAQ entries`);
    assert.ok((a!.summary?.length ?? 0) >= 3, `${slug}: needs an answer-first summary block`);
  }
});

test("every content-pack article links to at least three tool or category pages", () => {
  // The internal-linking rule from the brief. Counted over DISTINCT destinations
  // so three links to the same page don't pass.
  const TOOL_OR_CATEGORY = /^\/(browse|sets|champions|movers|tools|trade|alerts|cards|sealed|market|stores|premium|singles|decks|deck|domains|keywords|portfolio)(\/|$)/;
  const packSlugs = new Set([
    "riftbound-card-values",
    "ebay-bidding-strategies",
    "tcgplayer-fees",
    "currency-conversion-fees",
    "most-expensive-riftbound-cards",
    "best-riftbound-marketplaces",
    "riftbound-card-price-comparison",
    "riftcompare-review",
    "how-to-choose-a-riftbound-marketplace",
    "riftbound-variant-glossary",
  ]);
  const byArticle = new Map<string, Set<string>>();
  for (const { slug, href } of internalLinks()) {
    if (!packSlugs.has(slug)) continue;
    const path = href.split("#")[0].split("?")[0];
    if (!TOOL_OR_CATEGORY.test(path)) continue;
    if (!byArticle.has(slug)) byArticle.set(slug, new Set());
    byArticle.get(slug)!.add(path);
  }
  for (const slug of packSlugs) {
    const n = byArticle.get(slug)?.size ?? 0;
    assert.ok(n >= 3, `${slug}: links to only ${n} distinct tool/category pages, needs 3+`);
  }
});
