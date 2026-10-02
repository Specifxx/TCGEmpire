import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getArticles } from "../src/lib/articles";
import { SETS } from "../src/lib/constants";
import { COUNTRY_LIST } from "../src/lib/country";
import { COUNTRY_GUIDE_SLUGS } from "../src/lib/seo";
import { articleHref } from "../src/lib/content/tool-guides";
import { BLOG_PICKS, GUIDE_PICKS, MARKET_READS, START_HERE, startHereFor } from "../src/lib/content/featured";

// The homepage's editorial band and the curated lists behind it, /blog and
// /guides. DECISIONS.md, "Blog and tools, joined up", 2026-09-26: after an
// AdSense "low value content" rejection the owner asked for the homepage to
// feature its writing prominently, and chose the slot directly under the price
// table, reversing the 2026-09-21 order for this one band. On 2026-09-28 it
// moved up again, above the table, directly under the hero ("we need the blog
// and guides to be prominent so that we get approved for adsense with their
// lazy crawlers").

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const HUB = "src/components/home/EditorialHub.tsx";

test("every home has one structure: hero, editorial band, Top Deals, price guide, HomeSections", () => {
  for (const f of ["src/app/page.tsx", "src/components/home/RegionHome.tsx"]) {
    const src = code(f);
    const order = ["<CinematicHero", "<EditorialHub", "<TodaysTopDeals", "<PriceGuideCallout", "<HomeSections"].map((t) => src.indexOf(t));
    assert.ok(order[0] >= 0 && order.every((v, i) => i === 0 || v > order[i - 1]), `${f}: ${order}`);
    assert.equal(src.split("<EditorialHub").length - 1, 1, `${f}: one band`);
    assert.doesNotMatch(src, /<PriceTodayTable|getPriceTable\(/);
    assert.match(src, /showTopDeals=\{false\}/, "HomeSections does not render the deals a second time");
  }
  // "/" is market-neutral; a region home leads "Start here" with its own guide.
  assert.match(code("src/app/page.tsx"), /<EditorialHub freshness=\{freshness\} \/>/);
  assert.match(code("src/components/home/RegionHome.tsx"), /<EditorialHub freshness=\{freshness\} market=\{region\} \/>/);
});

test("the band replaces the old teaser rows rather than repeating them", () => {
  const home = code("src/components/home/HomeSections.tsx");
  assert.doesNotMatch(home, /<LatestPosts|getArticles\(/, "HomeSections must not render a second list of posts");
  assert.ok(!existsSync(join(process.cwd(), "src/components/home/LatestPosts.tsx")), "LatestPosts had one caller and went with it");
});

test("the band links the writing, the trust pages and the market pages", () => {
  const src = code(HUB);
  for (const href of ["/guides", "/blog", "/editorial-policy", "/methodology", "/about", "/movers", "/market"]) {
    assert.match(src, new RegExp(`["']${href}["']`), `the band must link ${href}`);
  }
  assert.match(src, /Guides, news &amp; market updates/);
  assert.match(src, /grid grid-cols-1 gap-4 md:grid-cols-3/, "text in one column on phones, three from md");
});

test("the band says how articles are made, in the owner's words, and claims no traffic ranking", () => {
  const src = read(HUB);
  assert.match(src, /drafted with AI assistance, then edited and fact-checked by Bill/);
  assert.match(src, /never from the draft/);
  assert.doesNotMatch(code(HUB), /most read|most popular|top posts|trending/i);
  const list = code("src/components/FilterableArticles.tsx");
  assert.doesNotMatch(list, /Most read/, "no per-article view count exists to back a traffic label");
  assert.match(list, /title: "Editor's picks"/);
});

test("the band is a server component with no query, and phones get no images", () => {
  const src = code(HUB);
  assert.doesNotMatch(src, /^["']use client["']/m);
  assert.doesNotMatch(src, /prisma|@\/lib\/db|unstable_cache/, "ARTICLES is in memory; the band needs no read (db.ts rules 5 and 6)");
  assert.match(src, /freshness: string \| null/, "the market column reuses the freshness the page already loads");
  // The one image: md up only, out of flow inside its aspect box.
  const at = src.indexOf("aspect-[1.91/1]");
  assert.ok(at >= 0);
  const box = src.slice(src.lastIndexOf("<span", at), at + 400);
  assert.match(box, /\bhidden\b[^"]*\bmd:block\b/);
  assert.match(box, /\bfill\b/);
});

const redirectSources = () => new Set([...read("next.config.js").matchAll(/source:\s*"(\/[^"]*)"/g)].map((m) => m[1]));
const words = (body: string) => body.replace(/\[\[[^\]]*\]\]/g, "").split(/\s+/).filter(Boolean).length;
const SET_WORDS = SETS.flatMap((s) => [s.slug, s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")]);

test("every curated pick is published, in its list's category, substantial, set-agnostic and not redirected", () => {
  const published = new Map(getArticles().map((a) => [a.slug, a]));
  const sources = redirectSources();
  const lists: [string, readonly string[], "blog" | "guide" | null][] = [
    ["START_HERE", START_HERE.map((p) => p.slug), null],
    ["MARKET_READS", MARKET_READS.map((p) => p.slug), null],
    ["BLOG_PICKS", BLOG_PICKS, "blog"],
    ["GUIDE_PICKS", GUIDE_PICKS, "guide"],
  ];
  for (const [name, slugs, category] of lists) {
    assert.ok(slugs.length >= 2, `${name} is empty`);
    assert.equal(new Set(slugs).size, slugs.length, `${name} repeats a slug`);
    for (const slug of slugs) {
      const a = published.get(slug);
      assert.ok(a, `${name}: ${slug} is not a published article`);
      if (category) assert.equal(a.category, category, `${name}: ${slug} is a ${a.category}`);
      assert.ok(!sources.has(articleHref(a)), `${name}: ${articleHref(a)} is a next.config.js redirect source`);
      assert.ok(words(a.body) >= 600, `${name}: ${slug} is ${words(a.body)} words; picks are the first thing a reviewer opens`);
      for (const set of SET_WORDS) assert.ok(!slug.includes(set), `${name}: ${slug} names the set "${set}" and will go stale`);
      // A pick is how the site introduces itself: no invest/flip framing in what
      // the band and the index cards show (the title and excerpt).
      assert.doesNotMatch(`${a.title} ${a.excerpt}`, /invest|flip|profit|resell/i, `${name}: ${slug} reads as investment advice`);
    }
  }
  const start = new Set(START_HERE.map((p) => p.slug));
  assert.ok(MARKET_READS.every((p) => !start.has(p.slug)), "a pick belongs to one column");
  for (const p of [...START_HERE, ...MARKET_READS]) assert.ok(p.line.length > 20 && p.line.length < 120, `${p.slug}: one line`);
});

test("each market home leads Start here with its own buying guide, so the six bands differ", () => {
  const published = new Set(getArticles().map((a) => a.slug));
  const leads = new Set<string>([startHereFor()[0].slug]);
  assert.equal(startHereFor()[0].slug, "where-to-buy-riftbound-cards", '"/" keeps the six-market guide');
  for (const { code: c } of COUNTRY_LIST) {
    const picks = startHereFor(c);
    assert.equal(picks[0].slug, COUNTRY_GUIDE_SLUGS[c], `${c} leads with its own guide`);
    assert.ok(published.has(picks[0].slug), `${c}: ${picks[0].slug} is not published`);
    assert.equal(picks.length, START_HERE.length, `${c}: the market guide replaces the general one, not adds to it`);
    assert.ok(!picks.some((p) => p.slug === "where-to-buy-riftbound-cards"));
    leads.add(picks[0].slug);
  }
  assert.equal(leads.size, COUNTRY_LIST.length + 1);
});

test("/blog and /guides introduce themselves, say who writes them and link the tools", () => {
  for (const f of ["src/app/blog/page.tsx", "src/app/guides/page.tsx"]) {
    const src = read(f);
    assert.match(src, /drafted with AI assistance, then edited and fact-checked/, f);
    for (const href of ["/editorial-policy", "/authors", "/methodology"]) assert.match(src, new RegExp(`href="${href}"`), `${f} → ${href}`);
    for (const href of ["/browse", "/tools/best-basket", "/tools/box-ev", "/movers", "/market"]) {
      assert.match(src, new RegExp(`href: "${href}"`), `${f}: tool line → ${href}`);
    }
    // Only list fields cross into the client component, never a markdown body.
    assert.match(src, /articles=\{items\}/, f);
    assert.doesNotMatch(src, /articles=\{articles\}/, f);
  }
  assert.match(read("src/app/blog/page.tsx"), /featured=\{BLOG_PICKS\}/);
  assert.match(read("src/app/guides/page.tsx"), /featured=\{GUIDE_PICKS\}/);
  assert.match(read("src/components/FilterableArticles.tsx"), /export type ArticleListItem = Pick<Article, [^>]*>/);
  assert.doesNotMatch(read("src/components/FilterableArticles.tsx").match(/export type ArticleListItem = Pick<Article, [^>]*>/)![0], /"body"/);
});

test("the blog's JSON-LD no longer promises the removed daily market report", () => {
  assert.doesNotMatch(read("src/app/blog/page.tsx").replace(/\/\/[^\n]*/g, ""), /Daily Market Report|daily Riftbound market report/i);
});
