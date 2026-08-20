/**
 * scripts/seo-gate.ts — the pre-deploy SEO gate for the generated page surface.
 *
 *   npx tsx scripts/seo-gate.ts --plan                       # no server needed
 *   npx tsx scripts/seo-gate.ts --url http://localhost:3111  # full gate
 *   npx tsx scripts/seo-gate.ts --url https://riftcompare.com --max 2000
 *
 * Exits non-zero on the first FAILING gate, so it can sit in front of a deploy.
 *
 * WHY THIS EXISTS SEPARATELY FROM scripts/crawl-check.ts: crawl-check walks the
 * site from the homepage like a bot and reports navigation health. This walks the
 * SITEMAP instead and asserts publication correctness — is every URL we submitted
 * actually servable, does every page carry exactly one self-referencing canonical,
 * is any structured data we emit parseable, and — the one that matters most on a
 * price-comparison site — does every price figure we publish resolve to a real,
 * in-range number. A wrong price shown to a shopper is a different class of
 * failure from a slow crawl, and it needs its own gate.
 *
 * The checks:
 *   1. Sitemap validity — index and every child are well-formed XML, and the
 *      index's children are exactly SECTIONS.
 *   2. Every submitted URL returns 200 (no redirects, no 404s, no 5xx).
 *   3. Per page — a non-empty <title> and meta description, exactly one
 *      <link rel=canonical> pointing at the page's own URL, no robots noindex on
 *      a submitted URL, and every application/ld+json block parses.
 *   4. Duplicates — no two submitted pages share a title or a description.
 *   5. Thin content — every submitted page carries at least MIN_WORDS of visible
 *      text in the SERVER HTML (not after hydration).
 *   6. Price integrity — every money figure on a price-bearing page parses to a
 *      real number inside a sane band; zero, NaN and absurd values fail.
 *
 * --plan prints the per-template page inventory that IS knowable from static seed
 * data with no database, which is the summary a reviewer wants before a deploy.
 */
export {};

import { SECTIONS, sectionUrl } from "../src/lib/sitemap-sections";
import { SITE_URL } from "../src/lib/site";
import {
  DECK_GROUPS,
  deckGroupPath,
  indexableDeckGroups,
  liveDeckGroups,
  seedsInGroup,
} from "../src/lib/deck-groups";
import { META_DECKS } from "../src/lib/meta-decks";
import { CHAMPIONS } from "../src/lib/champions";
import { KEYWORDS } from "../src/lib/keywords";
import { DOMAIN_PAGES } from "../src/lib/domains";
import { TYPE_FACETS, RARITY_FACETS, PRINTING_FACETS } from "../src/lib/facets";
import { SETS } from "../src/lib/constants";
import { getArticles } from "../src/lib/articles";

const args = process.argv.slice(2);
const has = (n: string) => args.includes(n);
const argOf = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const BASE = argOf("--url", "").replace(/\/$/, "");
const MAX_PAGES = Number(argOf("--max", "3000"));
const CONCURRENCY = Number(argOf("--concurrency", "8"));
const UA = "Mozilla/5.0 (compatible; RiftCompare-SeoGate/1.0)";

/** Below this many words of visible server-rendered text a submitted page is
 *  thin. Matches the 150-word floor scripts/adsense-audit.ts already measures
 *  indexable pages against, so the two can't disagree about what "thin" means. */
const MIN_WORDS = 150;

/** Money sanity band for a single rendered figure, in cents. A card or a deck
 *  costing under 1c or over $50,000 is a data fault, not a market. */
const MIN_CENTS = 1;
const MAX_CENTS = 50_000_00;

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const OFF = "\x1b[0m";

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log(`  ${RED}✗${OFF} ${msg}`);
};
const pass = (msg: string) => console.log(`  ${GREEN}✓${OFF} ${msg}`);
const note = (msg: string) => console.log(`    ${YELLOW}·${OFF} ${msg}`);

// ─────────────────────────────────────────────────────────────────────────────
// Template classification. Every submitted URL is bucketed so the summary can
// report "pages generated per template", and so a per-template rule (price
// integrity on deck pages, say) can be applied to the right pages.
// ─────────────────────────────────────────────────────────────────────────────
const TEMPLATES: [name: string, test: (p: string) => boolean, priceBearing: boolean][] = [
  ["decks/archetype", (p) => p.startsWith("/decks/archetype/"), true],
  ["decks/domain", (p) => p.startsWith("/decks/domain/"), true],
  ["decks/[slug]", (p) => /^\/decks\/[^/]+$/.test(p) && p !== "/decks", true],
  ["champions/[slug]", (p) => p.startsWith("/champions/") && p !== "/champions", true],
  ["keywords/[slug]", (p) => p.startsWith("/keywords/") && p !== "/keywords", false],
  ["domains/[slug]", (p) => p.startsWith("/domains/") && p !== "/domains", true],
  ["cards/facet", (p) => /^\/cards\/(type|rarity|printing)\//.test(p), true],
  ["card/[id]", (p) => p.startsWith("/card/"), true],
  ["sets/gallery", (p) => /^\/sets\/[^/]+\/gallery$/.test(p), false],
  ["sets/[set]", (p) => /^\/sets\/[^/]+$/.test(p) && p !== "/sets", true],
  ["stores/[slug]", (p) => p.startsWith("/stores/") && p !== "/stores", true],
  ["marketplace/seller", (p) => p.startsWith("/marketplace/seller/"), false],
  ["guides", (p) => p.startsWith("/guides/"), false],
  ["blog", (p) => p.startsWith("/blog/"), false],
  ["authors", (p) => p.startsWith("/authors/"), false],
];
function templateOf(path: string): { name: string; priceBearing: boolean } {
  for (const [name, t, priceBearing] of TEMPLATES) if (t(path)) return { name, priceBearing };
  return { name: "static", priceBearing: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// --plan: the DB-free inventory.
// ─────────────────────────────────────────────────────────────────────────────
function printPlan(): void {
  console.log(`\n${BOLD}Page inventory (static seed data — no database)${OFF}\n`);
  const rows: [string, string, string][] = [];

  const liveGroups = liveDeckGroups();
  const idxGroups = indexableDeckGroups();
  rows.push([
    "decks/archetype",
    `${liveGroups.filter((g) => g.axis === "archetype").length} live / ${idxGroups.filter((g) => g.axis === "archetype").length} submitted`,
    `${DECK_GROUPS.filter((g) => g.axis === "archetype").length} defined`,
  ]);
  rows.push([
    "decks/domain",
    `${liveGroups.filter((g) => g.axis === "domain").length} live / ${idxGroups.filter((g) => g.axis === "domain").length} submitted`,
    `${DECK_GROUPS.filter((g) => g.axis === "domain").length} defined`,
  ]);
  rows.push(["decks/[slug]", `${META_DECKS.length} live / ${META_DECKS.length} submitted`, "one per real decklist"]);
  rows.push(["keywords/[slug]", `${KEYWORDS.length} live / ${KEYWORDS.length} submitted`, "only keywords with verified rules text"]);
  rows.push(["domains/[slug]", `${DOMAIN_PAGES.length} live / ${DOMAIN_PAGES.length} submitted`, ""]);
  rows.push([
    "sets",
    `${SETS.length * 2} live`,
    "set page + gallery each; empty sets withheld at build time",
  ]);
  rows.push([
    "guides + blog",
    `${getArticles().length} live`,
    `${getArticles().filter((a) => a.category === "guide").length} guides, ${getArticles().filter((a) => a.category === "blog").length} posts`,
  ]);
  rows.push(["champions/[slug]", `${CHAMPIONS.length} defined`, `${DIM}submitted count is DB-gated (>= 8 printings)${OFF}`]);
  rows.push([
    "cards/facet",
    `${TYPE_FACETS.length + RARITY_FACETS.length + PRINTING_FACETS.length} defined`,
    `${DIM}submitted count is DB-gated (>= 8 cards)${OFF}`,
  ]);
  rows.push(["card/[id]", "—", `${DIM}one per card row; DB-gated${OFF}`]);
  rows.push(["stores/[slug]", "—", `${DIM}DB-gated (>= 1 in-stock listing)${OFF}`]);

  const w = Math.max(...rows.map((r) => r[0].length));
  for (const [name, count, extra] of rows) {
    console.log(`  ${name.padEnd(w)}  ${count.padEnd(28)} ${extra}`);
  }

  console.log(`\n${BOLD}Deck groups, in detail${OFF}\n`);
  for (const g of DECK_GROUPS) {
    const n = seedsInGroup(g).length;
    const state = n === 0 ? `${DIM}404 (no real deck)${OFF}` : n === 1 ? `${YELLOW}noindex (thin)${OFF}` : `${GREEN}submitted${OFF}`;
    console.log(`  ${deckGroupPath(g).padEnd(30)} ${String(n).padStart(2)} deck${n === 1 ? " " : "s"}  ${state}`);
  }
  console.log(
    `\n  ${idxGroups.length} new URLs submitted, ${liveGroups.length - idxGroups.length} rendered-but-noindexed, ` +
      `${DECK_GROUPS.length - liveGroups.length} not rendered at all.\n`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// XML well-formedness. Deliberately dependency-free: this repo ships no XML
// parser, and adding one to a gate script is a worse trade than 40 lines that
// catch what actually breaks a sitemap — an unescaped ampersand, a stray "<" in
// a URL, or an unclosed tag.
// ─────────────────────────────────────────────────────────────────────────────
function xmlErrors(xml: string): string[] {
  const errs: string[] = [];
  if (!xml.startsWith("<?xml")) errs.push("missing XML declaration");

  // Raw "&" that isn't the start of an entity is the classic sitemap breaker.
  const badAmp = xml.match(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g);
  if (badAmp) errs.push(`${badAmp.length} unescaped "&" (must be &amp;)`);

  // Tag balance.
  const stack: string[] = [];
  const tagRe = /<\/?([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml))) {
    const [raw, name, , selfClose] = m;
    if (raw.startsWith("<?") || raw.startsWith("<!")) continue;
    if (raw.startsWith("</")) {
      const open = stack.pop();
      if (open !== name) errs.push(`closing </${name}> does not match <${open ?? "nothing"}>`);
    } else if (!selfClose) {
      stack.push(name);
    }
  }
  if (stack.length) errs.push(`unclosed tag(s): ${stack.join(", ")}`);
  return errs;
}

const locsOf = (xml: string): string[] =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  );

// ─────────────────────────────────────────────────────────────────────────────
// Page fetching + parsing.
// ─────────────────────────────────────────────────────────────────────────────
interface Page {
  path: string;
  status: number;
  title: string;
  description: string;
  canonicals: string[];
  noindex: boolean;
  jsonLd: string[];
  words: number;
  money: MoneyHit[];
  /** True when a currency symbol is followed by NaN/Infinity/undefined. */
  brokenMoney: boolean;
  error?: string;
}

interface MoneyHit {
  /** The rendered figure, e.g. "A$233.84". */
  raw: string;
  /** The words immediately after it, which is what decides whether a zero is legal. */
  after: string;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ldquo;|&rdquo;/g, '"');

// Every currency symbol lib/format.ts can emit. Kept in sync deliberately: a
// symbol missing here means that market's prices are silently unchecked.
const SYMBOLS = String.raw`(?:A\$|US\$|C\$|S\$|£|€|\$)`;
const MONEY_RE = new RegExp(`${SYMBOLS}\\s?-?[\\d,]+(?:\\.\\d{1,2})?`, "g");
const BROKEN_MONEY_RE = new RegExp(`${SYMBOLS}\\s*(?:NaN|Infinity|undefined|null)`, "i");

// Contexts where a rendered zero is a FACT, not a fault. Postage really can be
// free, and a saving really can be nil — refusing to print those would be its own
// dishonesty. A zero anywhere else on a price-bearing page means a null was
// summed as 0 and published as the cost of something, which is the failure this
// gate exists for, so the allowlist is deliberately short and explicit.
const ZERO_IS_LEGAL = /^\s*(?:postage|shipping|delivery|freight|saved|savings?|discount|fees?)\b/i;

async function fetchPage(path: string): Promise<Page> {
  const base: Page = {
    path, status: 0, title: "", description: "", canonicals: [], noindex: false, jsonLd: [], words: 0, money: [],
    brokenMoney: false,
  };
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { "user-agent": UA, accept: "text/html" } });
  } catch (e) {
    return { ...base, error: String(e).slice(0, 160) };
  }
  const html = res.status < 300 || res.status >= 400 ? await res.text() : "";

  const head = html.slice(0, html.indexOf("</head>") + 7 || html.length);
  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "").trim();
  const description = decode(
    /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i.exec(head)?.[1] ?? ""
  ).trim();
  const canonicals = [...head.matchAll(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/gi)].map((m) =>
    decode(m[1])
  );
  // Both attribute orders — rel before href and href before rel — because Next
  // has emitted each at different times and missing one would read as "no
  // canonical" on a page that has one.
  canonicals.push(
    ...[...head.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/gi)].map((m) => decode(m[1]))
  );
  const robotsMeta = /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i.exec(head)?.[1] ?? "";
  const noindex =
    /noindex/i.test(robotsMeta) || /x-robots-tag/i.test(res.headers.get("x-robots-tag") ? "x-robots-tag" : "")
      ? /noindex/i.test(robotsMeta) || /noindex/i.test(res.headers.get("x-robots-tag") ?? "")
      : false;

  const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(
    (m) => m[1]
  );

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const text = decode(body).replace(/\s+/g, " ").trim();

  const money: MoneyHit[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    money.push({ raw: m[0], after: text.slice(m.index + m[0].length, m.index + m[0].length + 24) });
  }

  return {
    ...base,
    status: res.status,
    title,
    description,
    canonicals: [...new Set(canonicals)],
    noindex,
    jsonLd,
    words: text ? text.split(" ").length : 0,
    money,
    brokenMoney: BROKEN_MONEY_RE.test(text),
  };
}

/**
 * Every node in a JSON-LD block must be an object carrying an @type — a block
 * that parses but describes nothing is markup Google silently ignores.
 *
 * `@graph` is unwrapped rather than rejected: app/layout.tsx emits the site-wide
 * Organization + WebSite entities as a single `{ "@context", "@graph": [...] }`
 * envelope, which is the documented shape for a multi-entity block and has no
 * top-level @type of its own.
 */
function assertLdNodes(parsed: unknown): void {
  const nodes = Array.isArray(parsed) ? parsed : [parsed];
  for (const n of nodes) {
    if (!n || typeof n !== "object") throw new Error("node is not an object");
    const node = n as Record<string, unknown>;
    if (Array.isArray(node["@graph"])) {
      assertLdNodes(node["@graph"]);
      continue;
    }
    if (!("@type" in node)) throw new Error(`node has no @type: ${Object.keys(node).slice(0, 4).join(",")}`);
  }
}

function moneyToCents(s: string): number | null {
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const k = i++;
        if (k >= items.length) return;
        out[k] = await fn(items[k]);
      }
    })
  );
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (has("--plan") || !BASE) {
    printPlan();
    if (!BASE) {
      console.log(
        `${YELLOW}No --url given: printed the inventory only.${OFF} The rendered gates (URL 200s, canonical,\n` +
          `structured data, thin content, price integrity, sitemap validity) need a running server with a\n` +
          `database — run: npx tsx scripts/seo-gate.ts --url http://localhost:3111\n`
      );
      process.exit(0);
    }
  }

  console.log(`\n${BOLD}SEO gate — ${BASE}${OFF}\n`);

  // ── 1. Sitemap validity ───────────────────────────────────────────────────
  console.log(`${BOLD}1. Sitemap validity${OFF}`);
  const idxRes = await fetch(`${BASE}/sitemap.xml`, { headers: { "user-agent": UA } });
  if (idxRes.status !== 200) {
    fail(`/sitemap.xml returned ${idxRes.status}`);
    return finish();
  }
  const idxXml = await idxRes.text();
  const idxErrs = xmlErrors(idxXml);
  if (idxErrs.length) idxErrs.forEach((e) => fail(`/sitemap.xml: ${e}`));
  else pass("/sitemap.xml is well-formed");

  const childLocs = locsOf(idxXml);
  const expected = SECTIONS.map((id) => sectionUrl(id));
  const missing = expected.filter((u) => !childLocs.some((l) => l.endsWith(new URL(u).pathname)));
  if (missing.length) fail(`sitemap index is missing ${missing.length} section(s): ${missing.join(", ")}`);
  else pass(`sitemap index lists all ${expected.length} sections`);

  const urls = new Set<string>();
  const perSection = new Map<string, number>();
  for (const loc of childLocs) {
    const path = new URL(loc).pathname;
    const res = await fetch(`${BASE}${path}`, { headers: { "user-agent": UA } });
    if (res.status !== 200) {
      fail(`${path} returned ${res.status}`);
      continue;
    }
    const xml = await res.text();
    const errs = xmlErrors(xml);
    if (errs.length) {
      errs.forEach((e) => fail(`${path}: ${e}`));
      continue;
    }
    const locs = locsOf(xml);
    perSection.set(path, locs.length);
    for (const u of locs) {
      // A submitted URL on another origin would never be crawled as ours.
      if (!u.startsWith(SITE_URL) && !u.startsWith(BASE)) {
        fail(`${path}: foreign URL ${u}`);
        continue;
      }
      urls.add(new URL(u).pathname);
    }
  }
  if (perSection.size === childLocs.length) pass(`all ${childLocs.length} child sitemaps are well-formed`);
  for (const [p, n] of perSection) note(`${p} — ${n} URL${n === 1 ? "" : "s"}`);

  const paths = [...urls].slice(0, MAX_PAGES);
  if (paths.length < urls.size) note(`capped at ${MAX_PAGES} of ${urls.size} URLs (--max to raise)`);

  // ── 2-6. Per-page ─────────────────────────────────────────────────────────
  console.log(`\n${BOLD}2. Fetching ${paths.length} submitted URLs${OFF}`);
  const pages = await pool(paths, CONCURRENCY, fetchPage);

  const bad = pages.filter((p) => p.status !== 200 || p.error);
  if (bad.length) {
    for (const p of bad.slice(0, 25)) fail(`${p.path} → ${p.error ?? p.status}`);
    if (bad.length > 25) fail(`…and ${bad.length - 25} more non-200 submitted URLs`);
  } else pass(`every submitted URL returns 200`);

  const ok = pages.filter((p) => p.status === 200 && !p.error);

  console.log(`\n${BOLD}3. Per-page metadata${OFF}`);
  let noTitle = 0, noDesc = 0, badCanon = 0, noindexed = 0, badLd = 0;
  for (const p of ok) {
    if (!p.title) { noTitle++; if (noTitle <= 5) fail(`${p.path}: empty <title>`); }
    if (!p.description) { noDesc++; if (noDesc <= 5) fail(`${p.path}: empty meta description`); }
    if (p.canonicals.length !== 1) {
      badCanon++;
      if (badCanon <= 5) fail(`${p.path}: ${p.canonicals.length} canonical tags (need exactly 1)`);
    } else {
      const self = new URL(p.canonicals[0]).pathname.replace(/\/$/, "") || "/";
      const own = p.path.replace(/\/$/, "") || "/";
      if (self !== own) {
        badCanon++;
        if (badCanon <= 5) fail(`${p.path}: canonical points at ${self}`);
      }
    }
    if (p.noindex) { noindexed++; fail(`${p.path}: submitted in the sitemap but carries noindex`); }
    for (const raw of p.jsonLd) {
      try {
        assertLdNodes(JSON.parse(raw));
      } catch (e) {
        badLd++;
        if (badLd <= 5) fail(`${p.path}: invalid JSON-LD — ${String(e).slice(0, 90)}`);
      }
    }
  }
  if (!noTitle) pass("every page has a non-empty title");
  if (!noDesc) pass("every page has a non-empty meta description");
  if (!badCanon) pass("every page has exactly one self-referencing canonical");
  if (!noindexed) pass("no submitted URL carries noindex");
  if (!badLd) pass("every structured-data block parses and is typed");

  console.log(`\n${BOLD}4. Duplicate titles & descriptions${OFF}`);
  const byTitle = new Map<string, string[]>();
  const byDesc = new Map<string, string[]>();
  for (const p of ok) {
    if (p.title) byTitle.set(p.title, [...(byTitle.get(p.title) ?? []), p.path]);
    if (p.description) byDesc.set(p.description, [...(byDesc.get(p.description) ?? []), p.path]);
  }
  const dupTitles = [...byTitle.entries()].filter(([, v]) => v.length > 1);
  const dupDescs = [...byDesc.entries()].filter(([, v]) => v.length > 1);
  if (dupTitles.length) {
    for (const [t, v] of dupTitles.slice(0, 10)) fail(`duplicate title on ${v.length} pages: "${t}" (${v.slice(0, 3).join(", ")})`);
  } else pass("no two submitted pages share a title");
  if (dupDescs.length) {
    for (const [, v] of dupDescs.slice(0, 10)) fail(`duplicate description on ${v.length} pages (${v.slice(0, 3).join(", ")})`);
  } else pass("no two submitted pages share a description");

  console.log(`\n${BOLD}5. Thin content${OFF}`);
  const thin = ok.filter((p) => p.words < MIN_WORDS);
  if (thin.length) {
    for (const p of thin.slice(0, 15)) fail(`${p.path}: ${p.words} words of server-rendered text (< ${MIN_WORDS})`);
    if (thin.length > 15) fail(`…and ${thin.length - 15} more submitted pages under ${MIN_WORDS} words`);
  } else pass(`every submitted page carries at least ${MIN_WORDS} words`);

  console.log(`\n${BOLD}6. Price integrity${OFF}`);
  // A shopper acts on these numbers. Zero, NaN, negative and absurd values are
  // all "we published a wrong price", and each has a different silent cause.
  let priceFails = 0;
  let priceChecked = 0;
  for (const p of ok) {
    const { priceBearing } = templateOf(p.path);
    if (!priceBearing) continue;
    for (const hit of p.money) {
      priceChecked++;
      const cents = moneyToCents(hit.raw);
      if (cents == null) {
        priceFails++;
        if (priceFails <= 15) fail(`${p.path}: unparseable money figure ${JSON.stringify(hit.raw)}`);
      } else if (cents === 0) {
        if (ZERO_IS_LEGAL.test(hit.after)) continue; // free postage is a fact, not a fault
        priceFails++;
        if (priceFails <= 15) {
          fail(`${p.path}: published a zero price (${hit.raw}${hit.after.trim() ? ` ${hit.after.trim()}` : ""}) — a null summed as 0`);
        }
      } else if (cents < MIN_CENTS || cents > MAX_CENTS) {
        priceFails++;
        if (priceFails <= 15) fail(`${p.path}: out-of-range price ${hit.raw}`);
      }
    }
    if (p.brokenMoney) {
      priceFails++;
      fail(`${p.path}: rendered a non-numeric price (NaN/Infinity/undefined after a currency symbol)`);
    }
  }
  if (!priceFails) pass(`all ${priceChecked} price figures on price-bearing pages are real and in range`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}Pages generated per template${OFF}\n`);
  const byTemplate = new Map<string, { total: number; ok: number; words: number }>();
  for (const p of pages) {
    const t = templateOf(p.path).name;
    const e = byTemplate.get(t) ?? { total: 0, ok: 0, words: 0 };
    e.total++;
    if (p.status === 200 && !p.error) { e.ok++; e.words += p.words; }
    byTemplate.set(t, e);
  }
  const w = Math.max(...[...byTemplate.keys()].map((k) => k.length));
  for (const [name, e] of [...byTemplate.entries()].sort((a, b) => b[1].total - a[1].total)) {
    const avg = e.ok ? Math.round(e.words / e.ok) : 0;
    console.log(`  ${name.padEnd(w)}  ${String(e.total).padStart(5)} submitted  ${String(e.ok).padStart(5)} × 200  ${DIM}avg ${avg} words${OFF}`);
  }
  console.log(`  ${"TOTAL".padEnd(w)}  ${String(pages.length).padStart(5)} submitted  ${String(ok.length).padStart(5)} × 200`);

  finish();
}

function finish(): never {
  console.log(
    failures === 0
      ? `\n${GREEN}${BOLD}SEO gate passed.${OFF}\n`
      : `\n${RED}${BOLD}SEO gate FAILED — ${failures} problem${failures === 1 ? "" : "s"}.${OFF}\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`${RED}seo-gate crashed:${OFF}`, e);
  process.exit(1);
});
