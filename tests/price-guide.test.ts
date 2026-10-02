import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCardWhere, type CardQuery } from "../src/lib/cards";
import { priceField, type Country } from "../src/lib/country";
import { normalizeSearch } from "../src/lib/format";
import { STALE_HISTORY_MS } from "../src/lib/price-history";
import {
  GUIDE_MARKETS,
  GUIDE_STALE_MS,
  changeOverDays,
  filterGuideRows,
  guideStats,
  listedGuideRows,
  normalizeGuideSort,
  parseGuideQuery,
  sortGuideRows,
  thirtyDayCoverage,
  type GuideQuery,
  type GuideRow,
} from "../src/lib/price-guide-query";
import { priceGuideDescription, priceGuideIndexing, priceGuideTitle, PRICE_GUIDE_FAQ } from "../src/lib/price-guide-seo";

// /price-guide (DECISIONS.md, "Site-wide price guide at /price-guide: one
// cached catalogue, filtered in memory", 2026-10-02). The page filters an
// in-memory array where /browse asks Postgres, so the first thing pinned here
// is that both answer the same words with the same cards.

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ── Fixtures: one spec, two shapes (a Prisma Card and a guide row) ───────────

type Spec = {
  id: string;
  name: string;
  set: string;
  no: string;
  dom: string;
  ty: string;
  r: string;
  variant?: string;
  promo?: boolean;
  over?: boolean;
  slug?: string;
  /** Cents per market, GUIDE_MARKETS order. */
  p: (number | null)[];
  pop?: number;
  add?: number;
};

const SPECS: Spec[] = [
  { id: "akali", name: "Akali", set: "OGN", no: "1/298", dom: "Fury", ty: "Unit", r: "Common", p: [80, 50, 40, 70, 60, 45] },
  { id: "akali-over", name: "Akali", set: "OGN", no: "301/298", dom: "Fury", ty: "Unit", r: "Showcase", over: true, p: [9000, 6000, 5000, 8000, 7000, 5500] },
  { id: "akali-alt", name: "Akali", set: "SFD", no: "10/221", dom: "Fury", ty: "Unit", r: "Showcase", variant: "alt", p: [3000, 2000, 1800, null, null, null] },
  { id: "kennen-legend", name: "Kennen", set: "OGN", no: "250/298", dom: "Mind", ty: "Legend", r: "Rare", p: [1500, 900, 800, 1400, 1200, 850] },
  { id: "kennen-unit", name: "Kennen", set: "OGN", no: "2/298", dom: "Mind", ty: "Unit", r: "Uncommon", p: [30, 20, null, null, null, null] },
  { id: "rune-prison", name: "Rune Prison", set: "SFD", no: "60/221", dom: "Calm", ty: "Spell", r: "Common", p: [40, 25, 20, 30, 30, 20] },
  { id: "hall", name: "Hall of Legends", set: "UNL", no: "70/219", dom: "Order", ty: "Gear", r: "Rare", p: [500, 300, 250, 400, 350, 280] },
  { id: "shen-sig", name: "Shen, Eye of Twilight", set: "VEN", no: "193*/166", dom: "Calm", ty: "Legend", r: "Showcase", slug: "shen-eye-of-twilight-ven-193s-166", p: [25000, 18000, 15000, 22000, 20000, 16000] },
  { id: "shen", name: "Shen, Eye of Twilight", set: "VEN", no: "50/166", dom: "Calm", ty: "Legend", r: "Rare", p: [400, 250, 220, null, 300, 240] },
  { id: "jinx-gambit", name: "Jinx's Gambit", set: "SFD", no: "120/221", dom: "Fury", ty: "Spell", r: "Epic", p: [700, 450, 400, 600, 550, 420] },
  { id: "jinx-alt", name: "Jinx", set: "SFD", no: "205/221", dom: "Fury", ty: "Unit", r: "Epic", variant: "alt", p: [12000, 8000, 7000, null, 10000, 7500] },
  { id: "jinx-promo", name: "Jinx", set: "OGN", no: "P3", dom: "Fury", ty: "Unit", r: "Rare", promo: true, p: [null, null, null, null, null, null] },
  { id: "nashor", name: "Baron Nashor", set: "UNL", no: "238/219", dom: "Chaos", ty: "Unit", r: "Showcase", over: true, p: [40000, 30000, 26000, null, null, 27000] },
  { id: "kaisa", name: "Kai'Sa", set: "UNL", no: "15/219", dom: "Body", ty: "Unit", r: "Epic", p: [150, null, 90, null, null, null] },
  { id: "fury-rune", name: "Fury Rune", set: "OGN", no: "R1", dom: "Fury", ty: "Rune", r: "Common", p: [10, 5, 5, 10, 10, 5] },
];

const prismaCard = (s: Spec): Record<string, unknown> & { id: string } => {
  const out: Record<string, unknown> & { id: string } = {
    id: s.id,
    slug: s.slug ?? s.id,
    name: s.name,
    nameNormalized: normalizeSearch(s.name),
    setCode: s.set,
    collectorNumber: s.no,
    domain: s.dom,
    type: s.ty,
    rarity: s.r,
    variant: s.variant ?? null,
    isPromo: !!s.promo,
    isOvernumbered: !!s.over,
  };
  GUIDE_MARKETS.forEach((m, i) => (out[priceField(m)] = s.p[i]));
  return out;
};

const guideRow = (s: Spec): GuideRow => ({
  id: s.id,
  slug: s.slug ?? s.id,
  n: s.name,
  dn: s.name,
  nn: normalizeSearch(s.name),
  v: null,
  set: s.set,
  no: s.no,
  dom: s.dom,
  ty: s.ty,
  r: s.r,
  alt: s.variant ? 1 : 0,
  promo: s.promo ? 1 : 0,
  over: s.over ? 1 : 0,
  e: null,
  m: null,
  img: null,
  p: s.p,
  s: s.p.map((c) => (c == null ? 0 : 3)),
  pop: s.pop ?? 1,
  add: s.add ?? 20000,
});

// A tiny evaluator for exactly the Prisma where shapes buildCardWhere emits —
// so the reference answer is buildCardWhere's own output, not a re-statement.
type W = Record<string, unknown>;
function matchField(v: unknown, f: unknown): boolean {
  if (f === null || typeof f !== "object") return v === f;
  const o = f as W;
  if ("in" in o && !(o.in as unknown[]).includes(v)) return false;
  if ("contains" in o && !(typeof v === "string" && v.includes(o.contains as string))) return false;
  if ("startsWith" in o && !(typeof v === "string" && v.startsWith(o.startsWith as string))) return false;
  if ("not" in o) {
    if (o.not === null) {
      if (v == null) return false;
    } else if (typeof o.not === "object") {
      if (matchField(v, o.not)) return false;
    } else if (v === o.not) return false;
  }
  if ("gte" in o && o.gte != null && !(typeof v === "number" && v >= (o.gte as number))) return false;
  if ("lte" in o && o.lte != null && !(typeof v === "number" && v <= (o.lte as number))) return false;
  return true;
}
function matchWhere(card: W, where: W): boolean {
  return Object.entries(where).every(([k, f]) => {
    if (k === "AND") return (f as W[]).every((w) => matchWhere(card, w));
    if (k === "OR") return (f as W[]).some((w) => matchWhere(card, w));
    return matchField(card[k], f);
  });
}

const CARDS = SPECS.map(prismaCard);
const ROWS = SPECS.map(guideRow);
const ids = (xs: { id: unknown }[]) => xs.map((x) => String(x.id)).sort();

const PARITY: GuideQuery[] = [
  {},
  { q: "akali" },
  { q: "akali overnumbered" },
  { q: "alt art jinx" },
  { q: "kennen legend" },
  { q: "kennen legend", type: "Unit" },
  { q: "kennen legend", type: "" },
  { q: "Rune Prison" },
  { q: "Hall of Legends" },
  { q: "193*/166" },
  { q: "P3" },
  { q: "Armpit Shen" },
  { q: "kaisa" },
  { q: "signature", printing: "normal" },
  { q: "signature jinx" },
  { sig: "1", printing: "normal" },
  { q: "epic fury spell" },
  { q: "epic fury spell", domain: "Calm" },
  { q: "legend" },
  { q: "showcase" },
  { q: "showcase", rarity: "Epic" },
  { ult: "1" },
  { promo: "1" },
  { over: "1" },
  { variant: "alt" },
  { variant: "base" },
  { printing: "normal" },
  { set: "OGN,SFD" },
  { set: "OGN", rarity: "Common,Rare", domain: "Fury,Mind" },
  { type: "Unit,Spell", domain: "Fury" },
  { priced: "1" },
  { min: "1", max: "10" },
  { min: "100" },
  { max: "0.5", q: "akali" },
  { q: "zzzz" },
];

test("in-memory filters return exactly the cards buildCardWhere returns (every market)", () => {
  for (const country of GUIDE_MARKETS) {
    for (const q of PARITY) {
      const want = ids(CARDS.filter((c) => matchWhere(c, buildCardWhere(q as CardQuery, country) as W)));
      const got = ids(filterGuideRows(ROWS, q, country));
      assert.deepEqual(got, want, `${country} ${JSON.stringify(q)}`);
    }
  }
});

test("the parity fixtures exercise the cases that matter", () => {
  const f = (q: GuideQuery, c: Country = "US") => ids(filterGuideRows(ROWS, q, c));
  assert.deepEqual(f({ q: "akali overnumbered" }), ["akali-over"]);
  assert.deepEqual(f({ q: "kennen legend" }), ["kennen-legend"]);
  assert.deepEqual(f({ q: "Rune Prison" }), ["rune-prison"], "a facet word inside a name never hides the card");
  assert.deepEqual(f({ q: "Hall of Legends" }), ["hall"]);
  assert.deepEqual(f({ q: "193*/166" }), ["shen-sig"], "the raw collector number, star intact");
  assert.deepEqual(f({ q: "Armpit Shen" }), ["shen-sig"], "a community alias resolves by slug");
  assert.ok(!f({ q: "signature", printing: "normal" }).includes("shen-sig"), "printing=normal beats a typed signature");
  assert.deepEqual(f({ q: "epic fury spell" }), ["jinx-gambit"], "facet-only words become filters");
  assert.deepEqual(f({ ult: "1" }), ["nashor"]);
  assert.deepEqual(f({ q: "kaisa" }), ["kaisa"]);
  assert.ok(!f({ priced: "1" }).includes("kaisa") && f({ priced: "1" }, "AU").includes("kaisa"), "priced reads the market's own column");
});

test("a UK visitor shown euros filters on the euro figure they see", () => {
  const toEur = (c: number) => Math.round(c * 1.2);
  // Akali: £0.40 = €0.48. A €0.45 floor keeps it; on raw GBP it would not.
  const got = ids(filterGuideRows(ROWS, { min: "0.45", max: "0.5" }, "UK", { toDisplayCents: toEur }));
  assert.ok(got.includes("akali"));
  assert.ok(!ids(filterGuideRows(ROWS, { min: "0.45", max: "0.5" }, "UK")).includes("akali"));
});

test("parseGuideQuery keeps empty values (they matter to buildCardWhere) and takes the first of a repeat", () => {
  assert.deepEqual(parseGuideQuery({ q: "x", type: "", set: ["OGN", "SFD"], junk: "1" }), { q: "x", type: "", set: "OGN" });
});

// ── Sorting ──────────────────────────────────────────────────────────────────

test("price_desc is the default: dearest first, unpriced last, then name", () => {
  assert.equal(normalizeGuideSort(undefined), "price_desc");
  assert.equal(normalizeGuideSort("nonsense"), "price_desc");
  const s = sortGuideRows(ROWS, "price_desc", "US").map((r) => r.id);
  assert.equal(s[0], "nashor");
  assert.deepEqual(s.slice(-2), ["jinx-promo", "kaisa"], "nulls last, by name");
  const a = sortGuideRows(ROWS, "price_asc", "US").map((r) => r.id);
  assert.equal(a[0], "fury-rune");
  assert.deepEqual(a.slice(-2), ["jinx-promo", "kaisa"], "nulls last ascending too");
});

test("popular mirrors buildCardOrderBy: demand, then price dearest first, then name", () => {
  const rows = [
    { ...guideRow(SPECS[0]), pop: 2 },
    { ...guideRow(SPECS[1]), pop: 1 },
    { ...guideRow(SPECS[3]), pop: 2 },
    { ...guideRow(SPECS[11]), pop: 2 },
  ];
  assert.deepEqual(sortGuideRows(rows, "popular", "US").map((r) => r.id), ["akali-over", "kennen-legend", "akali", "jinx-promo"]);
});

test("number sorts by set order, then the collector number numerically", () => {
  const s = sortGuideRows(ROWS.filter((r) => r.set === "OGN"), "number", "US").map((r) => r.no);
  assert.deepEqual(s.slice(0, 3), ["1/298", "2/298", "250/298"]);
  const sets = sortGuideRows(ROWS, "number", "US").map((r) => r.set);
  assert.ok(sets.indexOf("SFD") > sets.lastIndexOf("OGN") && sets.indexOf("VEN") > sets.lastIndexOf("UNL"));
});

test("change sorts put cards with no figure last in both directions", () => {
  const d7 = new Map([["akali", 5], ["kennen-unit", -12], ["hall", 30]]);
  assert.deepEqual(sortGuideRows(ROWS, "change_desc", "US", d7).slice(0, 3).map((r) => r.id), ["hall", "akali", "kennen-unit"]);
  assert.deepEqual(sortGuideRows(ROWS, "change_asc", "US", d7).slice(0, 3).map((r) => r.id), ["kennen-unit", "akali", "hall"]);
});

test("listed rows drop pre-order sets by date, so a set appears on its release day", () => {
  const rows = [{ set: "OGN" }, { set: "RAD" }];
  assert.ok(listedGuideRows(rows).some((r) => r.set === "OGN"));
});

// ── Changes ──────────────────────────────────────────────────────────────────

const D = 86_400_000;

test("changeOverDays: a 30-day figure needs a reference 25-37 days back, fresh data and a sane move", () => {
  const now = 100 * D;
  const pts = (spec: [number, number][]) => spec.map(([d, v]) => ({ t: d * D, v }));
  assert.equal(changeOverDays(pts([[69, 100], [76, 105], [83, 110], [90, 120], [97, 130]]), 30, 25 * D, now), 30);
  assert.equal(changeOverDays(pts([[83, 100], [90, 110], [97, 120]]), 30, 25 * D, now), null, "only 14 days of series");
  assert.equal(changeOverDays(pts([[30, 100], [97, 120]]), 30, 25 * D, now), null, "a 67-day gap is not a 30-day move");
  assert.equal(changeOverDays(pts([[60, 100], [80, 130]]), 30, 15 * D, now), null, "stale series");
  assert.equal(changeOverDays(pts([[67, 100], [97, 500]]), 30, 25 * D, now), null, "outlier spike");
  assert.equal(GUIDE_STALE_MS, STALE_HISTORY_MS);
});

test("the 30-day column waits for half the priced rows", () => {
  const d30 = new Map(ROWS.slice(0, 3).map((r) => [r.id, 1]));
  assert.ok(thirtyDayCoverage(ROWS, "US", d30) < 0.5);
  assert.equal(thirtyDayCoverage(ROWS, "US", new Map(ROWS.map((r) => [r.id, 1]))), 1);
});

test("stats: median and dearest in display cents, unpriced rows not counted", () => {
  const st = guideStats(ROWS, "US");
  assert.equal(st.listed, ROWS.length);
  assert.equal(st.priced, ROWS.filter((r) => r.p[1] != null).length);
  assert.equal(st.dearest?.row.id, "nashor");
});

// ── SEO ──────────────────────────────────────────────────────────────────────

test("titles: ≤60 characters, the guide's phrase first, never another page's", () => {
  const titles = [
    priceGuideTitle(1412),
    priceGuideTitle(9999),
    priceGuideTitle(null),
    priceGuideTitle(0),
    priceGuideTitle(1412, 2, 15),
    priceGuideTitle(1412, 15, 15),
  ];
  for (const t of titles) {
    assert.ok(t.length <= 60, `${t} (${t.length})`);
    assert.match(t, /^Riftbound Price Guide/);
    assert.doesNotMatch(t, /^Riftbound Card Prices/i);
    assert.doesNotMatch(t, /card list|card values|most (expensive|valuable)|spoiler|chart|stores?\b/i, t);
    assert.doesNotMatch(t, /Origins|Spirit ?forged|Unleashed|Vendetta|Radiance/);
  }
  assert.equal(priceGuideTitle(1412), "Riftbound Price Guide: All 1,412 Cards in One Price List");
  assert.doesNotMatch(priceGuideTitle(null), /\d/, "no typed number when N is unknown");
  assert.notEqual(priceGuideTitle(1412, 2, 15), priceGuideTitle(1412, 3, 15));
});

test("descriptions: ≤155 characters, market-neutral, no banned claims", () => {
  for (const d of [priceGuideDescription(1412), priceGuideDescription(null), priceGuideDescription(1412, 7, 15)]) {
    assert.ok(d.length <= 155, `${d.length}: ${d}`);
    assert.doesNotMatch(d, /^Riftbound Card Prices/i);
    assert.doesNotMatch(d, /real[- ]time|updated hourly|five markets|shipping included|delivered/i);
    assert.doesNotMatch(d, /A\$|US\$|£|€|S\$|C\$/);
  }
});

test("indexing: the clean URL and clean in-range ?page=N index; everything else is noindex with the clean canonical", () => {
  assert.deepEqual(priceGuideIndexing({}, 15), { canonical: "/price-guide", index: true, page: 1 });
  assert.deepEqual(priceGuideIndexing({ page: "1" }, 15), { canonical: "/price-guide", index: true, page: 1 });
  assert.deepEqual(priceGuideIndexing({ page: "2" }, 15), { canonical: "/price-guide?page=2", index: true, page: 2 });
  assert.deepEqual(priceGuideIndexing({ page: "15" }, 15), { canonical: "/price-guide?page=15", index: true, page: 15 });
  assert.deepEqual(priceGuideIndexing({ q: "" }, 15), { canonical: "/price-guide", index: true, page: 1 }, "an empty param is no param");
  const noindex = { canonical: "/price-guide", index: false, page: 1 };
  assert.deepEqual(priceGuideIndexing({ page: "16" }, 15), noindex, "out of range");
  assert.deepEqual(priceGuideIndexing({ page: "2x" }, 15), noindex, "malformed");
  assert.deepEqual(priceGuideIndexing({ page: "2" }, null), noindex, "catalogue unavailable");
  for (const k of ["q", "set", "rarity", "domain", "type", "variant", "sig", "over", "ult", "promo", "printing", "priced", "min", "max", "sort", "size", "market", "tag", "rules"]) {
    assert.deepEqual(priceGuideIndexing({ [k]: "x" }, 15), noindex, k);
    assert.deepEqual(priceGuideIndexing({ [k]: "x", page: "2" }, 15), noindex, `${k} + page`);
  }
});

test("the FAQ makes no claim the site does not", () => {
  const text = PRICE_GUIDE_FAQ.map((f) => `${f.q} ${f.a}`).join(" ");
  assert.doesNotMatch(text, /real[- ]time|updated hourly|five markets|shipping included|sold listings|invest|flip/i);
  assert.match(text, /07:00 and 19:00 UTC/);
});

// ── Source pins ──────────────────────────────────────────────────────────────

const PAGE = "src/app/price-guide/page.tsx";
const COMPONENTS = readdirSync(join(ROOT, "src/components/price-guide")).map((f) => `src/components/price-guide/${f}`);

test("the route: force-dynamic, Next's names only, no prewarming, no loading.tsx, no query of its own", () => {
  const src = code(PAGE);
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(src, /export const revalidate|generateStaticParams|prisma\.|unstable_cache/);
  const exported = [...src.matchAll(/^export (?:const|async function|function|default async function|default function) (\w+)/gm)].map((m) => m[1]);
  for (const name of exported) assert.ok(["dynamic", "generateMetadata", "PriceGuidePage"].includes(name), `unexpected export ${name}`);
  assert.ok(!existsSync(join(ROOT, "src/app/price-guide/loading.tsx")));
  assert.match(src, /<Breadcrumbs trail=\{\[\{ name: "Price guide", href: PRICE_GUIDE_PATH \}\]\} \/>/);
  assert.doesNotMatch(src, /breadcrumb\(/, "Breadcrumbs xor breadcrumb()");
  assert.equal((src.match(/<h1\b/g) ?? []).length, 1);
});

test("the loader: CONTENT_TAG, never HISTORY_TAG; history read at page level, never inside a cache callback", () => {
  const src = code("src/lib/price-guide.ts");
  assert.match(src, /cachedOrDirect\(\(\) => computePriceGuideRows\(\), PRICE_GUIDE_KEY, \{\s*revalidate: 86400,\s*tags: \[CONTENT_TAG\]/);
  assert.doesNotMatch(src, /HISTORY_TAG/);
  assert.doesNotMatch(src, /unstable_cache/);
  const compute = src.slice(src.indexOf("async function computePriceGuideRows"), src.indexOf("type RowsMemo"));
  assert.doesNotMatch(compute, /getRiseHistory|getDuplicateMap|withStoreCounts/);
  assert.match(compute, /buildDuplicateMap\(cards\)/);
  assert.match(compute, /take: PRICE_GUIDE_MAX_ROWS/);
  // Never imported by a client file (it imports Prisma).
  for (const f of COMPONENTS) assert.doesNotMatch(read(f), /from "@\/lib\/price-guide"/, f);
});

// 2026-10-02: TCGplayer and eBay columns were added at the owner's request
// (DECISIONS.md, "Price guide: TCGplayer and eBay on every row"). Still
// forbidden: demand counters, the synthetic market price, and the US
// TCGplayer MARKET reference key (the US column is the buyable listing).
test("no forbidden columns: demand counters, synthetic market price, TCGplayer market key", () => {
  for (const f of [PAGE, ...COMPONENTS, "src/lib/price-guide-query.ts"]) {
    assert.doesNotMatch(code(f), /searchCount|viewCount|marketPriceCents|tcgplayer_market|TCGPLAYER_MARKET/i, f);
  }
  assert.doesNotMatch(code("src/lib/price-guide.ts"), /TCGPLAYER_MARKET_RETAILER|tcgplayer_market/);
});

test("TCGplayer and eBay on every row: buttons via OutboundLink with their own surfaces, disclosure above", () => {
  const rows = code("src/components/price-guide/PriceGuideRows.tsx");
  assert.match(rows, /surface="price_guide_ebay"/);
  assert.match(rows, /surface="price_guide_tcgplayer"/);
  assert.match(rows, /ebaySearchUrl\(market, riftboundEbayQuery\(r\.q\), "price-guide"\)/);
  assert.match(rows, /affiliateUrl\(TCG_SEARCH/);
  assert.match(rows, /btn-ebay-ghost/);
  const page = code(PAGE);
  assert.ok(page.indexOf("<AffiliateDisclosure") < page.indexOf("<PriceGuideTable"), "disclosure sits above the table");
  // Lowest is never re-ranked by eBay or TCGplayer: no new sorts.
  assert.doesNotMatch(read("src/lib/price-guide-query.ts"), /"(ebay|tcg)[a-z_]*"/);
});

test("a plain click on a row opens the quick view; the href stays real", () => {
  const rows = code("src/components/price-guide/PriceGuideRows.tsx");
  assert.match(rows, /useQuickView\(\)/);
  assert.match(rows, /<Link href=\{r\.h\} prefetch=\{false\} onClick=/);
  assert.match(rows, /e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey \|\| e\.button !== 0/);
});

test("card links skip prefetch and thumbnails go through cardThumbProps", () => {
  const table = code("src/components/price-guide/PriceGuideTable.tsx");
  const rowsSrc = code("src/components/price-guide/PriceGuideRows.tsx");
  const links = (table + rowsSrc).match(/<Link\b[^>]*>/g) ?? [];
  assert.ok(links.length > 0);
  for (const l of links) assert.match(l, /prefetch=\{false\}/);
  assert.match(table, /cardThumbProps\(/);
  assert.doesNotMatch(table, /brand-[23]00/);
  assert.match(table, /aria-sort|PriceGuideSortHeader/);
  assert.match(code("src/components/price-guide/PriceGuideSortHeader.tsx"), /aria-sort=\{dir\}/);
  // Sort headers navigate with buttons, never crawlable ?sort= anchors.
  assert.doesNotMatch(table + code("src/components/price-guide/PriceGuideSortHeader.tsx"), /href=\{?["`][^"`]*\?sort=/);
});

// Page weight (brief: ≤450 KB document, ≤200 KB soft-nav RSC, at 100 rows).
// A server-rendered row tree was serialised twice — HTML and inline RSC — at
// ~2 KB + ~2.2 KB a row, and the clean page measured ~786 KB (2026-10-02). The
// rows are now a client <tbody> fed compact props, with short pg-* classes and
// no srcSet; measured after `next build`: see DECISIONS.md.
test("price-guide rows ship as compact client props, not a server element tree", () => {
  const table = code("src/components/price-guide/PriceGuideTable.tsx");
  const rowsSrc = read("src/components/price-guide/PriceGuideRows.tsx");
  assert.match(rowsSrc, /^"use client";/);
  assert.match(table, /<PriceGuideRows rows=\{items\.map\(\(it\) => toRowProps\(it, currency\)\)\}/);
  assert.doesNotMatch(table, /<tr key|<td\b/, "row markup belongs in PriceGuideRows");
  // The client rows import nothing server-side or bundle-heavy: since
  // 2026-10-02 also QuickView, CardTile's type, OutboundLink and lib/affiliate,
  // all already in the root layout's bundle.
  const imports = [...rowsSrc.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ["../CardTile", "../OutboundLink", "../QuickView", "./PriceGuideChange", "@/lib/affiliate", "next/link", "react"]);
  // No srcSet, and no long utility strings repeated per cell.
  assert.doesNotMatch(code("src/components/price-guide/PriceGuideRows.tsx") + table, /srcSet|sizes=/);
  for (const cls of rowsSrc.matchAll(/className="([^"]+)"/g)) assert.ok(cls[1].length <= 40, `long row class: ${cls[1]}`);
  const css = read("src/app/globals.css");
  for (const c of ["pg-t", "pg-a", "pg-i", "pg-nm", "pg-sm", "pg-md", "pg-x2", "pg-sb"]) assert.match(css, new RegExp(`\\.${c}\\b`), c);
});

test("the price guide's Set facet hides pre-order sets it never lists, and explains the 30-day column", () => {
  const page = read("src/app/price-guide/page.tsx");
  assert.match(page, /<Filters[^>]*hidePreorderSets/);
  assert.match(page, /30-day change: the same US-dollar basis/);
  const filters = read("src/components/Filters.tsx");
  assert.match(filters, /hidePreorderSets \? SETS\.filter\(\(s\) => !isPreorderSetCode\(s\.code\)\)/);
});

test("out-of-range page: Back to page 1 keeps filters and toolbar never shows start > end", () => {
  const src = readFileSync("src/app/price-guide/page.tsx", "utf8");
  assert.match(src, /href: pageOneHref, label: "Back to page 1"/);
  assert.match(src, /e\[0\] !== "page"/);
  assert.match(src, /\{pageRows\.length > 0 \? \(\s*<p>\s*Showing/);
});

test("price guide row links and sort buttons get 48px on coarse pointers", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /@media \(pointer: coarse\) \{[^}]*\.pg-a,\s*\.pg-sb \{\s*min-height: 48px;/);
});
