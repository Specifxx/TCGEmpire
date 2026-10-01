import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  productDescription,
  productTitle,
  productTitleLadder,
  setDescription,
  setTitle,
} from "../src/lib/pokemon/seo";
import type { ProductFacts } from "../src/lib/pokemon/product-facts";
import type { SetFacts } from "../src/lib/pokemon/set-facts";
import type { Country } from "../src/lib/country";
import type { PkKind } from "../src/lib/pokemon/kinds";
import { textViolations } from "./helpers/pokemon-copy";

// THE POKÉMON SECTION'S TITLES, DESCRIPTIONS, INDEX GATE AND AUDIT ROWS.
//
// Titles and descriptions are checked against every active product and set
// name in the local import of 2026-10-01 (tests/fixtures/pokemon-names.json),
// because the failures that matter are data-shaped: a 93-character Pokémon
// Center ETB name, two "[variant]" ETBs that differ only inside the bracket,
// an "(International Version)" tin beside its plain twin. A duplicate title or
// description among indexable pages fails crawl-check, and with it the build.

type NameRow = { name: string; kind: PkKind; set: string | null; packCount: number | null };
const NAMES = JSON.parse(readFileSync("tests/fixtures/pokemon-names.json", "utf8")) as NameRow[];
const SETS = [...new Set(NAMES.map((n) => n.set).filter((s): s is string => Boolean(s)))];
const GATED = new Set(["booster-box", "etb", "pc-etb", "booster-bundle"]);
const read = (p: string) => readFileSync(p, "utf8");
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

test("fixture: every active product, with kind, set and pack count", () => {
  assert.ok(NAMES.length >= 1000, `${NAMES.length} names`);
  assert.equal(new Set(NAMES.map((n) => n.name)).size, NAMES.length, "names are unique in the catalogue");
  assert.ok(SETS.length >= 40);
  assert.ok(NAMES.some((n) => /\[[^\]]+\]/.test(n.name) && n.kind === "pc-etb"), "bracketed Pokémon Center ETBs present");
});

test("productTitle: ≤60, unique over every product, bracket kept, rung counts reported", (t) => {
  const seen = new Map<string, string>();
  const rungs = { 1: 0, 2: 0, 3: 0 };
  const gated = { 1: 0, 2: 0, 3: 0 };
  for (const n of NAMES) {
    const { title, rung } = productTitleLadder(n.name);
    assert.equal(productTitle(n.name), title);
    assert.ok(title.length <= TITLE_MAX, `${title.length}: ${title}`);
    assert.ok(!seen.has(title), `duplicate title "${title}" for "${n.name}" and "${seen.get(title)}"`);
    seen.set(title, n.name);
    assert.deepEqual(textViolations(title), [], title);
    assert.doesNotMatch(title, /RiftCompare/i, "no brand in a Pokémon title");
    rungs[rung]++;
    if (GATED.has(n.kind) && n.packCount != null) gated[rung]++;
    // Rung 1 whenever it fits: nothing is shortened for no reason.
    if (`${n.name} Price`.length <= TITLE_MAX) assert.equal(rung, 1, n.name);
    // The bracket is the product for a variant ETB: it survives whenever it can fit at all.
    const bracket = /\[[^\]]+\]/.exec(n.name)?.[0];
    if (bracket && bracket.length <= TITLE_MAX - 12) assert.ok(title.includes(bracket), `bracket lost: ${n.name} → ${title}`);
  }
  t.diagnostic(`all products: rung 1 ${rungs[1]}, rung 2 ${rungs[2]}, rung 3 ${rungs[3]}`);
  t.diagnostic(`stage-1 gated: rung 1 ${gated[1]}, rung 2 ${gated[2]}, rung 3 ${gated[3]}`);
  // 2026-10-01: 161 gated products, 39 of which need rung 2 or 3.
  assert.ok(gated[1] + gated[2] + gated[3] >= 150);
  assert.ok(gated[2] + gated[3] > 0 && gated[3] < gated[2], "rung 3 is the exception, not the rule");
});

test("productTitle ladder: the cases that shaped it", () => {
  assert.equal(productTitle("Phantasmal Flames Booster Box"), "Phantasmal Flames Booster Box Price");
  // "(Exclusive)" goes; the ETB abbreviation keeps the rest whole.
  assert.equal(productTitle("Delta Reign Pokémon Center Elite Trainer Box (Exclusive)"), "Delta Reign Pokémon Center ETB Price");
  // A named variant in parentheses stays: it is what separates two products.
  assert.equal(productTitle("Prismatic Evolutions Elite Trainer Box (Dollar General Exclusive)"), "Prismatic Evolutions ETB (Dollar General Exclusive) Price");
  assert.notEqual(
    productTitle("Crown Zenith Tin [Galarian Articuno] (International Version)"),
    productTitle("Crown Zenith Tin [Galarian Articuno]"),
  );
  // " Price" is dropped before anything that identifies the product.
  assert.equal(
    productTitle("Chilling Reign Pokémon Center Elite Trainer Box [Shadow Rider Calyrex] (Exclusive)"),
    "Chilling Reign Pokémon Center ETB [Shadow Rider Calyrex]",
  );
  const a = productTitle("Evolving Skies Pokémon Center Elite Trainer Box [Glaceon/Vaporeon/Sylveon/Espeon] (Exclusive)");
  const b = productTitle("Evolving Skies Pokémon Center Elite Trainer Box [Jolteon/Flareon/Umbreon/Leafeon] (Exclusive)");
  assert.ok(a.includes("[Glaceon/Vaporeon/Sylveon/Espeon]") && b.includes("[Jolteon/Flareon/Umbreon/Leafeon]"));
  assert.ok(a.length <= TITLE_MAX && b.length <= TITLE_MAX);
  // A bracket too long to keep whole is cut inside, never dropped.
  const long = productTitle("Enhanced 2-Pack Blister Pack [Galarian Articuno, Galarian Zapdos, & Galarian Moltres]");
  assert.ok(long.length <= TITLE_MAX && /\[Galarian Articuno.*…\]$/.test(long), long);
});

test("setTitle: ≤60 for every set, with and without per-pack figures", () => {
  for (const s of SETS) {
    for (const perPack of [true, false]) {
      const title = setTitle(s, { perPack });
      assert.ok(title.length <= TITLE_MAX, `${title.length}: ${title}`);
      assert.ok(title.startsWith(s));
      if (!perPack) assert.equal(title, `${s} Sealed Prices`, "no per-pack promise without a figure");
    }
  }
  assert.equal(setTitle("Phantasmal Flames"), "Phantasmal Flames Sealed Prices & Price per Pack");
  assert.equal(setTitle("A Set Name Long Enough To Need The Fallback"), "A Set Name Long Enough To Need The Fallback Sealed Prices");
});

const ALL_EBAY: Country[] = ["AU", "UK", "CA", "EU"];
function productFactsFor(n: NameRow, shape: "worst" | "bare" | "listed"): ProductFacts {
  const worst = shape === "worst";
  return {
    slug: "x",
    name: n.name,
    kind: n.kind,
    set: n.set ? { slug: "s", name: n.set, releasedOn: "2026-11-06" } : null,
    presale: worst,
    releasedOn: shape === "bare" ? null : "2026-11-06",
    packCount: shape === "bare" ? null : worst ? 36 : n.packCount,
    packCountFrom: shape === "bare" ? null : "contents",
    asOf: "as of 30 Sep 2026",
    us: shape === "bare" ? null : { cents: worst ? 999_999 : 12_345, currency: "USD", source: worst ? "tcgplayer" : "ebay", perPackCents: worst ? 99_999 : 1_234 },
    markets: [],
    ebayMarkets: worst ? ALL_EBAY : [],
    setPerPack: null,
    sameKind: null,
    daysAfterSet: null,
    history: null,
  };
}

test("productDescription: ≤155 on worst-case facts, starts with the name, unique over every product", () => {
  for (const shape of ["worst", "bare", "listed"] as const) {
    const seen = new Map<string, string>();
    for (const n of NAMES) {
      const d = productDescription(productFactsFor(n, shape));
      assert.ok(d.length <= DESCRIPTION_MAX, `${shape} ${d.length}: ${d}`);
      assert.ok(d.startsWith(n.name), `starts with the product name: ${d}`);
      assert.ok(d.endsWith("Updated daily."), d);
      assert.ok(!seen.has(d), `duplicate description for "${n.name}" and "${seen.get(d)}"`);
      seen.set(d, n.name);
      assert.deepEqual(textViolations(d), [], d);
      assert.doesNotMatch(d, /\b(?:NaN|null|undefined)\b|\btoday\b/, d);
    }
  }
});

test("productDescription: clauses name only what exists", () => {
  const etb = NAMES.find((n) => n.name === "Phantasmal Flames Elite Trainer Box") as NameRow;
  const listed = productDescription(productFactsFor(etb, "listed"));
  assert.match(listed, /Cheapest US listing US\$123\.45 on eBay \(US\$12\.34 a pack\)/);
  assert.doesNotMatch(listed, /Tracked eBay listings in/, "no eBay markets named without eBay rows");
  const bare = productDescription(productFactsFor(etb, "bare"));
  assert.doesNotMatch(bare, /US\$|booster packs|TCGplayer lists/);
  const pre = productDescription({ ...productFactsFor(etb, "listed"), presale: true });
  assert.match(pre, /pre-order, TCGplayer lists 6 Nov 2026/);
  const ebay = productDescription({ ...productFactsFor({ ...etb, name: "Short ETB" }, "listed"), ebayMarkets: ["UK", "CA"] });
  assert.match(ebay, /Tracked eBay listings in the United Kingdom and Canada/);
});

test("productDescription: with no US listing, only figures this product has", () => {
  const blister = NAMES.find((n) => n.name === "Scarlet & Violet Premium Checklane Blister [Gengar]") as NameRow;
  assert.ok(blister, "fixture name");
  const facts = (markets: ProductFacts["markets"], ebayMarkets: Country[] = []) => ({ ...productFactsFor(blister, "bare"), markets, ebayMarkets });
  const none = { listing: null, ebay: false, reference: null };
  // Its only row in the local import: a Cardmarket listing in the EU.
  const eu = productDescription(
    facts([
      { market: "US", ...none },
      { market: "EU", ...none, listing: { cents: 1_290, currency: "EUR", source: "cardmarket", label: "Cardmarket" } },
    ]),
  );
  assert.equal(eu, "Scarlet & Violet Premium Checklane Blister [Gengar]: Listed in the EU from €12.90 on Cardmarket. Updated daily.");
  assert.doesNotMatch(eu, /market price/, "no TCGplayer market price without its row");
  // The eBay market the stand-in already names is not named again.
  const uk = productDescription(
    facts(
      [
        { market: "US", ...none },
        { market: "UK", ...none, ebay: true, listing: { cents: 1_100, currency: "GBP", source: "ebay", label: "eBay UK" } },
        { market: "CA", ...none, ebay: true, listing: { cents: 2_000, currency: "CAD", source: "ebay", label: "eBay Canada" } },
      ],
      ["UK", "CA"],
    ),
  );
  assert.match(uk, /: Listed in the United Kingdom from £11\.00 on eBay\. Tracked eBay listings in Canada\. Updated daily\.$/);
  // No listing anywhere: TCGplayer's US market price only when it has that row.
  const ref = productDescription(facts([{ market: "US", ...none, reference: { cents: 2_499, currency: "USD", converted: false } }]));
  assert.equal(ref, "Scarlet & Violet Premium Checklane Blister [Gengar]: TCGplayer's market price US$24.99. Updated daily.");
  assert.equal(productDescription(facts([{ market: "US", ...none }])), "Scarlet & Violet Premium Checklane Blister [Gengar]. Updated daily.");
});

function setFactsFor(name: string, shape: "worst" | "upcoming" | "none"): SetFacts {
  const kinds: PkKind[] = ["booster-box", "etb", "pc-etb", "booster-bundle"];
  return {
    slug: "s",
    name,
    series: "Mega Evolution",
    code: null,
    releasedOn: "2026-11-06",
    upcoming: shape === "upcoming",
    productCount: 999,
    market: "US",
    currency: "USD",
    converted: false,
    place: "the United States",
    asOf: "as of 30 Sep 2026",
    mix: [],
    cheapest: shape === "none" ? [] : kinds.map((kind) => ({ kind, slug: kind, name: kind, cents: 999_999 })),
    perPack: shape === "none" ? [] : kinds.map((kind) => ({ kind, slug: kind, name: kind, cents: 999_999, perPackCents: 99_999 })),
    countable: shape !== "none",
    preorders: { count: 0, first: null, last: null },
    boxes: null,
    nav: { older: null, newer: null },
  };
}

test("setDescription: ≤155, starts with the set, unique over every set", () => {
  for (const shape of ["worst", "upcoming", "none"] as const) {
    const seen = new Set<string>();
    for (const s of SETS) {
      const d = setDescription(setFactsFor(s, shape));
      assert.ok(d.length <= DESCRIPTION_MAX, `${d.length}: ${d}`);
      assert.ok(d.startsWith(`${s}:`), d);
      assert.ok(d.endsWith("Updated daily."), d);
      assert.ok(!seen.has(d), d);
      seen.add(d);
      assert.deepEqual(textViolations(d), [], d);
      if (shape === "upcoming") assert.match(d, /TCGplayer lists Nov 2026/);
      if (shape === "worst") assert.match(d, /released Nov 2026: booster box from US\$9,999\.99/);
    }
  }
});

test("setDescription: the UK shown in euros marks its figures ≈", () => {
  const f = { ...setFactsFor("Phantasmal Flames", "worst"), market: "UK" as const, currency: "EUR", converted: true, place: "the United Kingdom" };
  assert.match(setDescription(f), /booster box from ≈ €9,999\.99/);
  assert.doesNotMatch(setDescription(setFactsFor("Phantasmal Flames", "worst")), /≈/);
});

// ── Metadata wiring on the pages this workstream owns ────────────────────────
// (Widened to every src/app/pokemon/**/page.tsx once every page builds its
// metadata through pokemonMeta.)
const OWNED_PAGES = ["src/app/pokemon/sealed/[slug]/page.tsx", "src/app/pokemon/sets/[set]/page.tsx"];

test("product and set pages build metadata through pokemonMeta, with their own share image", () => {
  for (const rel of OWNED_PAGES) {
    const src = codeOnly(read(rel));
    assert.match(src, /pokemonMeta\(\{/, `${rel} uses pokemonMeta`);
    assert.doesNotMatch(src, /pageOpenGraph|pageAlternates/, `${rel}: no Riftbound metadata helpers (feed alternates, branded titles)`);
    assert.match(src, /ogImage: "colocated"/, `${rel}: the route's own opengraph-image.tsx is its share image`);
    assert.doesNotMatch(src, /images:/, `${rel}: no openGraph images key, which would replace the route's own image`);
  }
  const product = codeOnly(read(OWNED_PAGES[0]));
  assert.match(product, /title: productTitle\(p\.name\)/);
  assert.match(product, /description: productDescription\(facts\)/);
  assert.match(product, /robots: productIsIndexed\(p\) \? undefined : \{ index: false, follow: true \}/);
  const set = codeOnly(read(OWNED_PAGES[1]));
  assert.match(set, /title: setTitle\(loaded\.set\.name, \{ perPack: facts\.countable \}\)/, "the same title in every market");
  assert.match(set, /description: setDescription\(facts\)/);
});

test("fail-open: a read error is never caught into a 404", () => {
  // DECISIONS D14: a thrown read gives a 500 (never cached by ISR, never "gone"
  // to a crawler); only an unknown product or set is notFound().
  for (const rel of OWNED_PAGES) {
    const src = codeOnly(read(rel));
    assert.doesNotMatch(src, /\.catch\(\s*\(\)\s*=>\s*null\s*\)/, `${rel} swallows a read error`);
  }
  const product = codeOnly(read(OWNED_PAGES[0]));
  assert.match(product, /const p = await getPokemonProduct\(params\.slug\);\s*if \(!p\) notFound\(\);/);
  // The US catalogue is optional on the product page: its failure drops the comparisons only.
  assert.match(product, /try \{\s*usCatalog = await getPokemonCatalog\("US"\);\s*\} catch/);
  const set = codeOnly(read(OWNED_PAGES[1]));
  assert.match(set, /const catalog = await getPokemonCatalog\(market\);/);
  assert.doesNotMatch(set, /try \{/, "the set page has no try: a read error is a 500");
});

test("JSON-LD: Product only with an open US listing; FAQPage from the visible FAQ's array", () => {
  const product = codeOnly(read(OWNED_PAGES[0]));
  assert.match(product, /const productLd = usOpen\.length\s*\?/);
  assert.match(product, /const faqLd = faqPage\(faq\);/);
  assert.match(product, /<ProductFaq faq=\{faq\} \/>/);
  assert.doesNotMatch(product, /"@type": "Event"/);
  const set = codeOnly(read(OWNED_PAGES[1]));
  assert.match(set, /type: "CollectionPage"/);
  assert.match(set, /indexed\.length \? pokemonItemList\(/, "the ItemList only when a product is indexable");
});

// ── The index gate and the sitemap ───────────────────────────────────────────

test("index-gate.ts: the gate reads only kind and pack count, and its kinds are pinned", () => {
  const src = codeOnly(read("src/lib/pokemon/index-gate.ts"));
  assert.match(src, /export const INDEX_STAGE1_KINDS = \["booster-box", "etb", "pc-etb", "booster-bundle"\] as const;/);
  const sig = /export function productPassesIndexGate\(p: \{([^}]*)\}\)/.exec(src);
  assert.ok(sig, "productPassesIndexGate's parameter is an inline object type");
  const fields = sig[1].split(";").map((f) => f.trim().split(":")[0].trim()).filter(Boolean).sort();
  assert.deepEqual(fields, ["kind", "packCount"], "durable facts only: never stock, offers, presale or history");
  assert.doesNotMatch(src, /^\s*import\b/m, "no imports: it is on the Riftbound importers' load path");
});

test("sitemap.ts: the gate from ./index-gate, a narrow select, the landing pages, Discord only when it exists", () => {
  const src = codeOnly(read("src/lib/pokemon/sitemap.ts"));
  assert.match(src, /import \{ INDEX_STAGE1_KINDS, productPassesIndexGate \} from "\.\/index-gate";/);
  assert.doesNotMatch(src, /from "\.\/seo"|from "\.\/data"|getPokemonCatalog/, "never the metadata module or the catalogue loader");
  assert.doesNotMatch(src, /^import[^;]*from "\.\/db"/m, "the Pokémon client stays a dynamic import");
  assert.match(src, /where: \{ active: true, kind: \{ in: \[\.\.\.INDEX_STAGE1_KINDS\] \} \}/);
  assert.match(src, /select: \{ slug: true, imageUrl: true, kind: true, packCount: true \}/);
  assert.match(src, /products\.filter\(productPassesIndexGate\)/);
  for (const p of ["/pokemon/booster-boxes", "/pokemon/elite-trainer-boxes", "/pokemon/booster-bundles", "/pokemon/price-per-pack"]) {
    assert.ok(src.includes(`"${p}"`), p);
  }
  assert.match(src, /process\.env\.POKEMON_DISCORD_APP_ID \? \[\{ url: `\$\{SITE_URL\}\/pokemon\/discord`, changeFrequency: "monthly" as const, priority: 0\.4 \}\]/);
});

test("the import's purge refreshes the section's sitemap and keeps its gate", () => {
  const src = codeOnly(read("src/app/api/pokemon/revalidate/route.ts"));
  assert.match(src, /if \(!pokemonEnabled\(\)\)/);
  assert.match(src, /revalidateTag\(POKEMON_TAG\)/);
  assert.match(src, /revalidatePath\("\/pokemon", "layout"\)/);
  assert.match(src, /revalidatePath\("\/sitemaps\/pokemon\.xml"\)/);
  assert.match(src, /authorization/, "auth unchanged");
});

// ── Audit registrations ──────────────────────────────────────────────────────
// Read as TEXT: both scripts run on import.

function regexFromLiteral(lit: string): RegExp {
  const m = /^\/(.*)\/([a-z]*)$/.exec(lit);
  assert.ok(m, `not a regex literal: ${lit}`);
  return new RegExp(m[1], m[2]);
}

test("adsense-audit: the Pokémon templates come first and classify their pages", () => {
  const src = read("scripts/adsense-audit.ts");
  const block = src.slice(src.indexOf("const TEMPLATES"), src.indexOf("];", src.indexOf("const TEMPLATES")));
  const rows = [...block.matchAll(/^\s*\["([\w-]+)", (\/.+\/[a-z]*)\],?\s*$/gm)].map((m) => ({ name: m[1], re: regexFromLiteral(m[2]) }));
  const names = rows.map((r) => r.name);
  const pokemon = ["pokemon-product", "pokemon-set", "pokemon-post", "pokemon-landing"];
  assert.deepEqual(names.slice(0, 4), pokemon, "Pokémon rows lead the list");
  assert.ok(names.includes("card") && names.includes("static"), "the Riftbound rows were parsed too");
  const templateOf = (p: string) => rows.find((r) => r.re.test(p))?.name;
  const expect: [string, string][] = [
    ["/pokemon/sealed/phantasmal-flames-booster-box", "pokemon-product"],
    ["/pokemon/sets/phantasmal-flames", "pokemon-set"],
    ["/pokemon/blog/booster-box-vs-etb-vs-booster-bundle", "pokemon-post"],
    ["/pokemon", "pokemon-landing"],
    ["/pokemon/booster-boxes", "pokemon-landing"],
    ["/pokemon/elite-trainer-boxes", "pokemon-landing"],
    ["/pokemon/booster-bundles", "pokemon-landing"],
    ["/pokemon/price-per-pack", "pokemon-landing"],
    ["/pokemon/sealed", "pokemon-landing"],
    ["/pokemon/sets", "pokemon-landing"],
    ["/pokemon/blog", "pokemon-landing"],
    ["/pokemon/discord", "pokemon-landing"],
    // Riftbound paths keep their templates.
    ["/sets/origins", "set"],
    ["/sealed", "tool"],
    ["/card/abc", "card"],
  ];
  for (const [path, want] of expect) assert.equal(templateOf(path), want, path);
});

test("template-seo-check: the Pokémon specs come first and match their pages", () => {
  const src = read("scripts/template-seo-check.ts");
  const block = src.slice(src.indexOf("const SPECS"), src.indexOf("];", src.indexOf("const SPECS")));
  const firstRiftbound = block.indexOf('name: "card"');
  assert.ok(firstRiftbound > 0);
  const specs = [...block.matchAll(/\{ name: "(pokemon-[\w-]+)", test: \(p\) => (\/.+?\/[a-z]*)\.test\(p\), requires: \[([^\]]*)\]/g)].map((m) => ({
    name: m[1],
    at: m.index ?? 0,
    re: regexFromLiteral(m[2]),
    requires: m[3].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean),
  }));
  assert.deepEqual(
    specs.map((s) => s.name),
    ["pokemon-hub", "pokemon-landing", "pokemon-index", "pokemon-set", "pokemon-product", "pokemon-post"],
  );
  for (const s of specs) assert.ok(s.at < firstRiftbound, `${s.name} sits ahead of the first Riftbound spec`);
  const specOf = (p: string) => specs.find((s) => s.re.test(p))?.name ?? null;
  const expect: [string, string | null][] = [
    ["/pokemon", "pokemon-hub"],
    ["/pokemon/booster-boxes", "pokemon-landing"],
    ["/pokemon/elite-trainer-boxes", "pokemon-landing"],
    ["/pokemon/booster-bundles", "pokemon-landing"],
    ["/pokemon/price-per-pack", "pokemon-landing"],
    ["/pokemon/sealed", "pokemon-index"],
    ["/pokemon/sets", "pokemon-index"],
    ["/pokemon/blog", "pokemon-index"],
    ["/pokemon/discord", "pokemon-index"],
    ["/pokemon/sets/delta-reign", "pokemon-set"],
    ["/pokemon/sealed/delta-reign-booster-box", "pokemon-product"],
    ["/pokemon/blog/how-we-price-pokemon-sealed", "pokemon-post"],
    ["/sets/origins", null],
    ["/pokemonx", null],
  ];
  for (const [path, want] of expect) assert.equal(specOf(path), want, path);
  const req = Object.fromEntries(specs.map((s) => [s.name, s.requires]));
  assert.deepEqual(req["pokemon-product"], ["BreadcrumbList"], "Product is optional: only with an open US listing");
  assert.deepEqual(req["pokemon-set"], ["BreadcrumbList", "CollectionPage"]);
  assert.deepEqual(req["pokemon-hub"], ["BreadcrumbList", "CollectionPage"]);
  assert.deepEqual(req["pokemon-landing"], ["BreadcrumbList", "CollectionPage"]);
});
