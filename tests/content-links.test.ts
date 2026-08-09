import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { ARTICLES, getArticles } from "../src/lib/articles";
import { COUNTRY_GUIDE_SLUGS, hreflangForCountryGuide } from "../src/lib/seo";
import { extractToc, headingId } from "../src/lib/toc";
import { cardSlug } from "../src/lib/card-url";
import { setByCode } from "../src/lib/constants";

type ManualCard = { name: string; setCode: string; collectorNumber: string; isPromo?: boolean };

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

// ─────────────────────────────────────────────────────────────────────────────
// The sitemap must never submit a URL we deleted or redirected.
// ─────────────────────────────────────────────────────────────────────────────
// Retiring a page means touching several files, and sitemap-sections.ts is the
// one that gets forgotten: nothing links to the entry, no typecheck catches it,
// and the page still "works" in dev. It only shows up as a soft 404 (or, worse,
// a "Page with redirect" exclusion) in Search Console weeks later, quietly
// eroding trust in every <lastmod> in the file.
//
// Both directions are checked, because both have bitten:
//   • deleted route still submitted  → 404 in the sitemap
//   • redirected route still submitted → Google is told the canonical URL is one
//     that immediately 301s somewhere else
//
// Source-level: the literal `${SITE_URL}/…` entries are parsed straight out of
// the file, so this needs no database and can gate a PR. Template-interpolated
// URLs (`/sets/${s.slug}`) are skipped — those are covered by their own tests.
test("every hard-coded sitemap URL resolves to a real, non-redirecting route", () => {
  const src = readFileSync(join(ROOT, "src/lib/sitemap-sections.ts"), "utf8");
  const redirects = redirectSources();

  const paths = [...src.matchAll(/\$\{SITE_URL\}(\/[A-Za-z0-9\-/._]*)`/g)]
    .map((m) => m[1].replace(/\/$/, ""))
    .filter((p) => p && !p.startsWith("/sitemaps/"));

  assert.ok(paths.length > 20, `expected to parse many sitemap URLs, found ${paths.length} — did the file's shape change?`);

  const dead = paths.filter((p) => !routeExists(p));
  assert.deepEqual(dead, [], `sitemap submits URLs with no route:\n  ${dead.join("\n  ")}`);

  const redirected = paths.filter((p) => redirects.has(p));
  assert.deepEqual(redirected, [], `sitemap submits URLs that 301 elsewhere:\n  ${redirected.join("\n  ")}`);
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

// ─────────────────────────────────────────────────────────────────────────────
// prisma/manual-cards.json ↔ the article embeds that reference it.
// ─────────────────────────────────────────────────────────────────────────────
// Card slugs are DERIVED (lib/card-url.ts cardSlug: name + set + number, plus a
// "-promo" suffix when isPromo), while the articles hard-code them as strings.
// Nothing connected the two, so a field change in the JSON silently broke every
// embed that pointed at it — flipping the six T1 printings to isPromo moved all
// six slugs, and the only symptom would have been a gallery quietly rendering
// nothing (resolveEmbed drops a slug that does not resolve, by design).
//
// Source-level and DB-free, like the rest of this file.

test("every article embed slug for a manual card matches what cardSlug() will generate", () => {
  const manual = (JSON.parse(readFileSync(join(ROOT, "prisma/manual-cards.json"), "utf8")) as unknown[])
    .filter((x): x is ManualCard => !!x && typeof x === "object" && !("_note" in (x as object)));

  // Scoped to sets with NO automated pipeline behind them — i.e. set codes absent
  // from constants.ts SETS. For a real set (OGN, VEN…) manual-cards.json holds only
  // a handful of promos while the importer supplies the rest, so "this set's code
  // appears in the slug" says nothing about where the card came from. For a
  // manual-only set it says everything: the JSON is the entire catalogue.
  const slugsBySet = new Map<string, string[]>();
  for (const c of manual) {
    if (setByCode(c.setCode)) continue;
    const list = slugsBySet.get(c.setCode) ?? [];
    list.push(cardSlug(c));
    slugsBySet.set(c.setCode, list);
  }
  assert.ok(slugsBySet.size > 0, "expected at least one manual-only set (T1S) — did the scoping rule break?");

  const embedSlugs = ARTICLES.flatMap((a) => [
    ...(a.embeds ?? []).flatMap((e) => e.slugs ?? []),
    ...(a.embed?.slugs ?? []),
    ...(a.closeups ?? []).flatMap((c) => c.slugs ?? []),
  ]);

  const broken: string[] = [];
  for (const [setCode, generated] of slugsBySet) {
    // Any embed slug carrying this set's code segment claims to be one of its
    // printings, so it has to be one of the slugs the importer will actually write.
    const marker = `-${setCode.toLowerCase()}-`;
    for (const s of embedSlugs) {
      if (s.includes(marker) && !generated.includes(s)) broken.push(`${s} (no ${setCode} manual card generates this)`);
    }
  }
  assert.deepEqual(broken, [], `article embeds point at slugs the importer will never create:\n  ${broken.join("\n  ")}`);
});

test("manual cards are applied by the deploy, not only by a hand-fired workflow", () => {
  // THE ROOT CAUSE of the six T1 printings 404ing in production for a day: the
  // only caller of add-manual-cards.ts was a workflow_dispatch-gated step in
  // maintenance.yml, so committing a card to the JSON and deploying did nothing
  // until somebody remembered to fire the job by hand. build-db-push.sh runs on
  // every Vercel production/preview build and is where the other best-effort
  // catalogue maintenance already lives.
  const sh = readFileSync(join(ROOT, "scripts/build-db-push.sh"), "utf8");
  assert.match(
    sh,
    /tsx scripts\/add-manual-cards\.ts/,
    "prisma/manual-cards.json is only a source of truth if something applies it on deploy"
  );
});
