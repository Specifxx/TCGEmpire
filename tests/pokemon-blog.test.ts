import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { ARTICLES } from "../src/lib/articles";
import { authorByName } from "../src/lib/content/authors";
import { COUNTRY_LIST } from "../src/lib/country";
import { POKEMON_TTL } from "../src/lib/pokemon/cache-keys";
import {
  POKEMON_POSTS,
  draftVisible,
  getAllPokemonPosts,
  getPokemonPost,
  getPokemonPosts,
  pokemonPostSitemapEntries,
} from "../src/lib/pokemon/blog/index";
import { BLOCKS, BLOCK_FACTS, BLOCK_IDS, isBlockId, type BlockCtx } from "../src/lib/pokemon/blog/blocks";
import { COMMON_FACTS, fillPost, fillTokens, postBlockIds, postEbayLinks, postFactKeys } from "../src/lib/pokemon/blog/render";
import type { PokemonPost } from "../src/lib/pokemon/blog/types";
import type { PkCatalog } from "../src/lib/pokemon/types";
import { textViolations } from "./helpers/pokemon-copy";

// The Pokémon blog (DECISIONS.md, the Pokémon homepage / indexability / blog /
// distribution panel, 2026-10-01): its own registry and renderer inside the
// Pokémon folders, posts held as drafts until Bill reviews them, and every
// number computed from the catalogue rather than typed into a post. These pin
// the registry's rules, the blocks against the real-data fixture and an empty
// catalogue, the copy rules on hand-written prose, the links, and the
// importer-safe imports.

const ROOT = process.cwd();
const catalog = JSON.parse(readFileSync("tests/fixtures/pokemon-catalog-us.json", "utf8")) as PkCatalog;
const EMPTY: PkCatalog = { market: "US", currency: "USD", tiles: [], sets: [], pricesAsOf: null, sources: [] };
const TODAY = "2026-10-01";
const ctx: BlockCtx = { catalog, today: TODAY };
const emptyCtx: BlockCtx = { catalog: EMPTY, today: TODAY };

// W1's pages, which land in the same integration. TEMPORARY: the integrator
// deletes this once /pokemon/booster-boxes and the rest exist on the branch.
const PLANNED_ROUTES = ["/pokemon/booster-boxes", "/pokemon/elite-trainer-boxes", "/pokemon/booster-bundles", "/pokemon/price-per-pack"];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const BLOCK_LINE = /^\s*\[\[pk:[a-z0-9-]+\]\]\s*$/;

/** The prose a person wrote: the body minus block lines, plus summary and FAQ. */
function handWritten(p: PokemonPost): string[] {
  return [
    ...p.body.split("\n").filter((l) => !BLOCK_LINE.test(l)),
    ...(p.summary ?? []),
    ...(p.faq ?? []).flatMap((f) => [f.q, f.a]),
  ];
}

/** Link targets, tokens and code spans out, so only the words a reader reads remain. */
function proseOnly(s: string): string {
  return s
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\[\[pk:[^\]]*\]\]/g, " ")
    .replace(/`[^`]*`/g, " ");
}

function internalLinks(text: string): string[] {
  return [...text.matchAll(/(?<!!)\[[^\]]*\]\((\/[^)\s]*)\)/g)].map((m) => m[1]);
}

/** Does a site path resolve to a route under src/app (static or [param] segments)? */
function routeExists(pathname: string): boolean {
  const segments = pathname.split("#")[0].split("?")[0].split("/").filter(Boolean);
  const walk = (dir: string, rest: string[]): boolean => {
    if (!rest.length) return ["page.tsx", "page.ts", "route.ts"].some((f) => existsSync(join(dir, f)));
    const [head, ...tail] = rest;
    if (existsSync(join(dir, head)) && statSync(join(dir, head)).isDirectory() && walk(join(dir, head), tail)) return true;
    return readdirSync(dir, { withFileTypes: true }).some((e) => e.isDirectory() && /^\[[^.].*\]$/.test(e.name) && walk(join(dir, e.name), tail));
  };
  return walk(join(ROOT, "src/app"), segments);
}

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

function allGenerated(filled: ReturnType<typeof fillPost>): string[] {
  return [filled.body, ...filled.summary, ...filled.faq.flatMap((f) => [f.q, f.a]), ...Object.values(filled.facts)];
}

// ── Registry ──────────────────────────────────────────────────────────────────

test("registry: three posts, unique slugs, none shared with a Riftbound article", () => {
  assert.equal(POKEMON_POSTS.length, 3);
  const slugs = POKEMON_POSTS.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  const riftbound = new Set(ARTICLES.map((a) => a.slug));
  for (const s of slugs) {
    assert.match(s, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!riftbound.has(s), `${s} is also a Riftbound article slug`);
  }
  assert.deepEqual(slugs.sort(), ["booster-box-vs-etb-vs-booster-bundle", "how-we-price-pokemon-sealed", "pokemon-center-etb-vs-elite-trainer-box"]);
});

test("registry: ISO dates, updated never before date, a published post is reviewed and has no [TODO]", () => {
  for (const p of POKEMON_POSTS) {
    assert.match(p.date, ISO_DAY, p.slug);
    if (p.updated) {
      assert.match(p.updated, ISO_DAY, p.slug);
      assert.ok(p.updated >= p.date, `${p.slug}: updated before date`);
    }
    if (p.reviewed) assert.match(p.reviewed, ISO_DAY, p.slug);
    if (p.status === "published") {
      assert.ok(p.reviewed && p.reviewed >= p.date, `${p.slug}: published without a review on or after its date`);
      assert.ok(!JSON.stringify(p).includes("[TODO]"), `${p.slug}: published with a [TODO]`);
    }
  }
});

test("registry: the three posts land as drafts by RiftCompare, dated as a placeholder", () => {
  for (const p of POKEMON_POSTS) {
    assert.equal(p.status, "draft", p.slug);
    assert.equal(p.author, "RiftCompare", p.slug);
    assert.equal(p.date, "2026-10-01", p.slug);
  }
});

test("registry: drafts are missing from getPokemonPosts and the sitemap entries; getPokemonPost still finds them", () => {
  assert.deepEqual(getPokemonPosts(), []);
  assert.deepEqual(pokemonPostSitemapEntries("https://example.com"), []);
  for (const p of POKEMON_POSTS) assert.equal(getPokemonPost(p.slug), p);
  assert.equal(getPokemonPost("no-such-post"), undefined);
  assert.equal(getAllPokemonPosts().length, POKEMON_POSTS.length);
});

test("registry: a published post reaches the sitemap with lastmod = updated ?? date (derived variant)", () => {
  // getPokemonPosts reads the registry array, so publish a copy in place and restore it.
  const arr = POKEMON_POSTS as PokemonPost[];
  const original = arr[0];
  try {
    arr[0] = { ...original, status: "published", reviewed: "2026-10-02", date: "2026-10-02", updated: "2026-10-05" };
    assert.deepEqual(getPokemonPosts().map((p) => p.slug), [original.slug]);
    const entries = pokemonPostSitemapEntries("https://example.com");
    assert.equal(entries.length, 1);
    assert.equal(entries[0].url, `https://example.com/pokemon/blog/${original.slug}`);
    assert.equal(entries[0].lastModified.toISOString().slice(0, 10), "2026-10-05");
  } finally {
    arr[0] = original;
  }
});

test("registry: draftVisible is true in development and on Vercel preview only", () => {
  assert.equal(draftVisible({ NODE_ENV: "production" }), false);
  assert.equal(draftVisible({ NODE_ENV: "production", VERCEL_ENV: "production" }), false);
  assert.equal(draftVisible({ NODE_ENV: "test" }), false);
  assert.equal(draftVisible({ NODE_ENV: "development" }), true);
  assert.equal(draftVisible({ NODE_ENV: "production", VERCEL_ENV: "preview" }), true);
});

test("titles ≤60 with no Riftbound; excerpts 50–155; bylines resolve", () => {
  for (const p of POKEMON_POSTS) {
    assert.ok(p.title.length <= 60, `${p.slug}: title ${p.title.length}`);
    assert.doesNotMatch(p.title, /riftbound/i);
    assert.ok(p.excerpt.length >= 50 && p.excerpt.length <= 155, `${p.slug}: excerpt ${p.excerpt.length}`);
    assert.ok(authorByName(p.author), `${p.slug}: author ${p.author} does not resolve`);
    assert.ok(p.tags.length > 0, p.slug);
  }
});

// ── Blocks ────────────────────────────────────────────────────────────────────

test("blocks: every block renders against the fixture and an empty catalogue, with no NaN, null or undefined", () => {
  for (const id of BLOCK_IDS) {
    for (const [name, c] of [
      ["fixture", ctx],
      ["empty", emptyCtx],
    ] as const) {
      const out = BLOCKS[id](c);
      const text = [out.markdown, ...Object.values(out.facts)].join("\n");
      assert.ok(out.markdown.trim().length > 0, `${id}/${name}: empty markdown`);
      assert.doesNotMatch(text, /\bNaN\b|\bnull\b|\bundefined\b|\[object /, `${id}/${name}`);
      assert.deepEqual(textViolations(text), [], `${id}/${name}`);
      for (const k of Object.keys(out.facts)) assert.ok(BLOCK_FACTS[id].includes(k), `${id} sets undeclared fact ${k}`);
    }
  }
});

test("blocks: per-pack-by-set covers the recent window, bolds each row's lowest, and labels US prices", () => {
  const out = BLOCKS["per-pack-by-set"](ctx);
  const rows = out.markdown.split("\n").filter((l) => l.startsWith("| [")).length;
  assert.ok(rows >= 3, out.markdown);
  assert.match(out.markdown, /\*\*US\$\d+\.\d\d\*\*/);
  assert.match(out.markdown, /US prices as of \d{1,2} \w{3} \d{4}/);
  assert.match(out.markdown, /\(\/pokemon\/sets\/[a-z0-9-]+\)/);
  assert.doesNotMatch(out.markdown, /delta-reign/, "a pre-order set is not a recent released set");
  assert.ok(out.facts.perPackLine && out.facts.perPackLowest);
});

test("blocks: pack-counts and etb-vs-pc-etb read the fixture's real counts", () => {
  const packs = BLOCKS["pack-counts"](ctx).facts;
  assert.equal(packs.boxPacks, "36");
  assert.equal(packs.bundlePacks, "6");
  assert.ok(Number(packs.pcEtbPacks) > Number(packs.etbPacks), "a Pokémon Center ETB holds more packs");
  const etb = BLOCKS["etb-vs-pc-etb"](ctx);
  assert.ok(etb.facts.etbVsPcLine && etb.facts.pcEtbExtraPacksLine && etb.facts.pcEtbGapLine);
  assert.match(etb.markdown, /\| PC ETB packs \|/);
});

test("blocks: sentences read right for a single set and for a clean sweep (derived variants)", () => {
  const one: PkCatalog = { ...catalog, sets: catalog.sets.filter((s) => s.slug === "pitch-black") };
  one.tiles = catalog.tiles.filter((t) => t.setSlug === "pitch-black");
  const perPack = BLOCKS["per-pack-by-set"]({ catalog: one, today: TODAY }).facts.perPackLine;
  assert.match(perPack, /^In the one recent set where/);
  assert.match(perPack, /lowest price per pack in it\.$/);
  const etb = BLOCKS["etb-vs-pc-etb"]({ catalog: one, today: TODAY }).facts.etbVsPcLine;
  assert.match(etb, /^In the one recent set where both/);
  assert.doesNotMatch(perPack + etb, /\bin 0\b/);
});

test("blocks: coverage names Cardmarket and eBay only when they hold rows", () => {
  const withCm = BLOCKS.coverage(ctx).facts.sourcesLine;
  assert.match(withCm, /Cardmarket/, "the fixture holds Cardmarket rows");
  assert.match(withCm, /No tracked eBay listing/, "the fixture holds no eBay rows");
  const prod: PkCatalog = { ...catalog, sources: ["tcgplayer", "tcgplayer_market", "ebay"] };
  const line = BLOCKS.coverage({ catalog: prod, today: TODAY }).facts.sourcesLine;
  assert.doesNotMatch(line, /Cardmarket/);
  assert.match(line, /eBay \(the cheapest matching listing/);
  assert.doesNotMatch(line, /No tracked eBay/);
});

test("blocks: method-constants quotes the code's own constants and names eBay's markets", () => {
  const f = BLOCKS["method-constants"](ctx).facts;
  assert.equal(f.offerStaleHours, "72");
  assert.equal(f.scopeStart, "7 Feb 2020");
  assert.equal(f.scopeSeries, "Sword & Shield");
  assert.equal(f.ebayMarkets, "the United States, the United Kingdom, Australia, Canada and the EU");
  assert.equal(f.ebaySearchOnly, "Singapore");
  assert.doesNotMatch(Object.values(f).join(" "), /\bfive\b/i);
});

// ── Posts: tokens, copy, length ───────────────────────────────────────────────

test("posts: every [[pk:…]] is a known block and every {{fact}} is one its blocks declare", () => {
  for (const p of POKEMON_POSTS) {
    const ids = postBlockIds(p);
    assert.ok(ids.length > 0, `${p.slug} places no block`);
    for (const id of ids) assert.ok(isBlockId(id), `${p.slug}: unknown block ${id}`);
    const declared = new Set<string>([...COMMON_FACTS, ...ids.filter(isBlockId).flatMap((id) => BLOCK_FACTS[id])]);
    for (const k of postFactKeys(p)) assert.ok(declared.has(k), `${p.slug}: {{${k}}} is not set by any of its blocks`);
  }
});

test("posts: against the fixture every token resolves, nothing is dropped, and no NaN/null/undefined renders", () => {
  for (const p of POKEMON_POSTS) {
    const filled = fillPost(p, ctx);
    assert.equal(filled.dropped, 0, p.slug);
    assert.equal(filled.summary.length, p.summary?.length ?? 0, p.slug);
    assert.equal(filled.faq.length, p.faq?.length ?? 0, p.slug);
    assert.ok(filled.faq.length >= 3, `${p.slug}: a FAQ of at least three`);
    assert.ok(filled.summary.length >= 3, `${p.slug}: a computed summary`);
    const all = allGenerated(filled).join("\n");
    assert.doesNotMatch(all, /\{\{|\[\[pk:|\bNaN\b|\bnull\b|\bundefined\b/, p.slug);
    assert.deepEqual(textViolations(all), [], p.slug);
    assert.ok(postFactKeys(p).every((k) => filled.facts[k]), p.slug);
  }
});

test("posts: against an empty catalogue they still render, leaving out what needed a fact", () => {
  for (const p of POKEMON_POSTS) {
    const filled = fillPost(p, emptyCtx);
    const all = allGenerated(filled).join("\n");
    assert.ok(filled.body.length > 1000, p.slug);
    assert.doesNotMatch(all, /\{\{|\[\[pk:|\bNaN\b|\bnull\b|\bundefined\b/, p.slug);
    assert.deepEqual(textViolations(all), [], p.slug);
  }
  assert.equal(fillTokens("a {{missing}} b", {}), null);
  assert.equal(fillTokens("a {{x}} b", { x: "1" }), "a 1 b");
});

test("posts: hand-written prose has no digits and names no set", () => {
  const setNames = catalog.sets.map((s) => s.name.toLowerCase());
  for (const p of POKEMON_POSTS) {
    for (const raw of [...handWritten(p), p.title, p.excerpt]) {
      const s = proseOnly(raw);
      assert.doesNotMatch(s, /\d/, `${p.slug}: a digit in hand-written prose: "${s.trim().slice(0, 120)}"`);
      const lower = s.toLowerCase();
      for (const n of setNames) assert.ok(!new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}\\b`).test(lower), `${p.slug} names the set "${n}"`);
    }
  }
});

test("posts: at least 600 words of hand-written prose each, tables and blocks excluded", () => {
  for (const p of POKEMON_POSTS) {
    const words = p.body
      .split("\n")
      .filter((l) => !BLOCK_LINE.test(l) && !l.trim().startsWith("#") && !l.trim().startsWith("|"))
      .map(proseOnly)
      .join(" ")
      .split(/\s+/)
      .filter((w) => /[A-Za-zÀ-ÿ]/.test(w)).length;
    assert.ok(words >= 600, `${p.slug}: ${words} words`);
  }
});

test("posts: banned wording is absent from every hand-written string", () => {
  for (const p of POKEMON_POSTS) {
    const text = [p.title, p.excerpt, ...handWritten(p), ...p.tags].join("\n");
    assert.deepEqual(textViolations(text), [], p.slug);
    assert.doesNotMatch(text, /\btoday\b/i, `${p.slug}: "as of {date}", never "today"`);
  }
});

// ── Links ─────────────────────────────────────────────────────────────────────

test("links: every internal link resolves to a route (or one of W1's planned pages)", () => {
  const broken: string[] = [];
  for (const p of POKEMON_POSTS) {
    const filled = fillPost(p, ctx);
    for (const href of [...internalLinks(filled.body), ...filled.summary.flatMap(internalLinks), ...filled.faq.flatMap((f) => internalLinks(f.a))]) {
      const path = href.split("#")[0].split("?")[0];
      if (PLANNED_ROUTES.includes(path)) continue;
      if (path.startsWith("/pokemon/blog/")) {
        if (!getPokemonPost(path.slice("/pokemon/blog/".length))) broken.push(`${p.slug} → ${href}`);
        continue;
      }
      if (!routeExists(path)) broken.push(`${p.slug} → ${href}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("links: each post links the sealed grid or a set page, and a kind hub or price-per-pack", () => {
  for (const p of POKEMON_POSTS) {
    const links = internalLinks(fillPost(p, ctx).body);
    assert.ok(links.some((l) => l === "/pokemon/sealed" || l.startsWith("/pokemon/sets")), `${p.slug}: no /pokemon/sealed or set link`);
    assert.ok(links.some((l) => PLANNED_ROUTES.includes(l)), `${p.slug}: no kind hub or price-per-pack link`);
  }
});

test("links: each post receives an inbound link from another post", () => {
  for (const p of POKEMON_POSTS) {
    const from = POKEMON_POSTS.filter((o) => o.slug !== p.slug && internalLinks(o.body).includes(`/pokemon/blog/${p.slug}`));
    assert.ok(from.length > 0, `${p.slug} has no inbound link from another post`);
  }
});

// ── eBay ──────────────────────────────────────────────────────────────────────

test("eBay: every market's links are built on the server, tagged pkmn-blog, on that market's eBay", () => {
  for (const p of POKEMON_POSTS) {
    const links = postEbayLinks(p);
    assert.deepEqual(Object.keys(links).sort(), COUNTRY_LIST.map((c) => c.code).sort());
    for (const c of COUNTRY_LIST) {
      assert.ok(links[c.code].length >= 1, `${p.slug}/${c.code}`);
      for (const l of links[c.code]) {
        const u = new URL(l.href);
        assert.match(u.searchParams.get("customid") ?? "", /(?:^|-)pkmn-blog(?:-|$)/, l.href);
        assert.match(u.searchParams.get("_nkw") ?? "", /^Pokemon /, "the game named once, first");
        assert.deepEqual(textViolations(l.label), []);
      }
    }
    assert.equal(new URL(links.UK[0].href).hostname, "www.ebay.co.uk");
    assert.equal(new URL(links.AU[0].href).hostname, "www.ebay.com.au");
  }
});

// ── Files: imports, caching, metadata ─────────────────────────────────────────

const BLOG_DIR = join(ROOT, "src/lib/pokemon/blog");
const importerSafe = ["index.ts", "types.ts", ...readdirSync(join(BLOG_DIR, "posts")).map((f) => `posts/${f}`)];

test("imports: index.ts, types.ts and posts/* import nothing outside the blog folder, and never blocks or render", () => {
  for (const rel of importerSafe) {
    const file = join(BLOG_DIR, rel);
    const src = readFileSync(file, "utf8");
    const specs = [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
    for (const spec of specs) {
      assert.ok(spec.startsWith("."), `${rel} imports a package or alias: ${spec}`);
      const target = resolve(dirname(file), spec);
      assert.ok(relative(BLOG_DIR, target).split("/")[0] !== "..", `${rel} imports outside the blog folder: ${spec}`);
      assert.doesNotMatch(spec, /(?:^|\/)(?:blocks|render)$/, `${rel} imports ${spec}`);
    }
  }
});

test("no Pokémon blog file names a banned Riftbound import, even in a comment", () => {
  const files = [
    ...readdirSync(BLOG_DIR, { recursive: true }).map((f) => join(BLOG_DIR, String(f))),
    join(ROOT, "src/app/pokemon/blog/page.tsx"),
    join(ROOT, "src/app/pokemon/blog/[slug]/page.tsx"),
    join(ROOT, "src/components/pokemon/PokemonPostView.tsx"),
    join(ROOT, "src/components/pokemon/PokemonPostList.tsx"),
    join(ROOT, "src/components/pokemon/PokemonMarketEbayPanel.tsx"),
  ].filter((f) => statSync(f).isFile());
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const banned of ["ArticleView", "@/lib/articles", "@/lib/posts", "tool-guides", "lib/indexnow"]) {
      assert.ok(!src.includes(banned), `${relative(ROOT, f)} mentions ${banned}`);
    }
  }
});

test("caching: a post is ISR at the catalogue's TTL with an empty generateStaticParams; the index reads no catalogue", () => {
  const post = stripComments(readFileSync(join(ROOT, "src/app/pokemon/blog/[slug]/page.tsx"), "utf8"));
  assert.equal(Number(/export const revalidate = (\d+);/.exec(post)?.[1]), POKEMON_TTL);
  assert.equal(POKEMON_TTL, 21600);
  assert.match(post, /export function generateStaticParams\(\): \{ slug: string \}\[\] \{\s*return \[\];\s*\}/);
  assert.equal((post.match(/getPokemonCatalog\(/g) ?? []).length, 1, "one catalogue read");
  assert.match(post, /getPokemonCatalog\("US"\)/);
  assert.doesNotMatch(post, /\.catch\(/, "a read error throws; ISR keeps the last good page");
  assert.doesNotMatch(post, /getCountry|cookies\(|headers\(/, "an ISR page reads no cookie");
  const index = stripComments(readFileSync(join(ROOT, "src/app/pokemon/blog/page.tsx"), "utf8"));
  assert.match(index, /export const revalidate = 86400;/);
  assert.doesNotMatch(index, /getPokemonCatalog|getPokemonProduct/);
});

test("metadata: both pages go through pokemonMeta with the section share image; drafts are noindex,nofollow", () => {
  const post = readFileSync(join(ROOT, "src/app/pokemon/blog/[slug]/page.tsx"), "utf8");
  assert.match(post, /pokemonMeta\(\{/);
  assert.match(post, /ogType: "article"/);
  assert.match(post, /ogImage: "section"/);
  assert.match(post, /robots: \{ index: false, follow: false \}/);
  assert.match(post, /if \(!pokemonEnabled\(\)\) return notFoundMetadata\(\);/);
  const index = readFileSync(join(ROOT, "src/app/pokemon/blog/page.tsx"), "utf8");
  assert.match(index, /pokemonMeta\(\{/);
  assert.match(index, /ogImage: "section"/);
  const title = /const TITLE = "([^"]+)";/.exec(index)?.[1] ?? "";
  const description = /const DESCRIPTION =\s*"([^"]+)";/.exec(index)?.[1] ?? "";
  assert.equal(title, "Pokémon Sealed Blog: Prices, Packs and Products");
  assert.ok(title.length <= 60);
  assert.ok(description.length > 50 && description.length <= 155, `description ${description.length}`);
  assert.deepEqual(textViolations(`${title} ${description}`), []);
});

test("the blog index's intro is at least 150 words with no digits", () => {
  const src = readFileSync(join(ROOT, "src/app/pokemon/blog/page.tsx"), "utf8");
  // The JSX between the H1 and the drafts note, tags and expressions removed.
  const intro = src.slice(src.indexOf("<h1"), src.indexOf("{drafts > 0"));
  const text = intro
    .replace(/<[^>]*>/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/&apos;/g, "'");
  const words = text.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
  assert.ok(words >= 150, `intro ${words} words`);
  assert.doesNotMatch(text, /\d/);
});
