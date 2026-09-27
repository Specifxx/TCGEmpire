import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getArticles } from "../src/lib/articles";
import { SETS } from "../src/lib/constants";
import { CHAMPIONS } from "../src/lib/champions";
import { COUNTRY_LIST } from "../src/lib/country";
import { COUNTRY_GUIDE_SLUGS } from "../src/lib/seo";
import { SET_GUIDES, guidesForCard, guidesForChampion, guidesForSet, type CardForGuides } from "../src/lib/content/related-guides";
import { TOOL_GUIDES, articleHref } from "../src/lib/content/tool-guides";
import { GET as llmsTxt } from "../src/app/llms.txt/route";
import { GET as aiPlugin } from "../src/app/.well-known/ai-plugin.json/route";
import { GET as mcpManifest } from "../src/app/.well-known/mcp.json/route";

// The catalogue and price pages, joined to the writing that explains them
// (DECISIONS.md, "Blog and tools, joined up", 2026-09-26): the card list, set
// pages and galleries, facet, domain and champion hubs, store pages, /singles,
// and the site's machine-readable self-descriptions. Source-level and DB-free,
// like the other link tests, so it gates a PR.

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
// Comments are notes to developers — several quote the old false wording on
// purpose, to say why it went — so they are blanked before any copy check.
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

const published = new Map(getArticles().map((a) => [a.slug, a]));
const redirectSources = new Set(
  [...read("next.config.js").matchAll(/source:\s*"(\/[^"]*)"/g)].map((m) => m[1]),
);
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// ── Sets ─────────────────────────────────────────────────────────────────────

test("every set has its own guides, each published, reachable and described plainly", () => {
  for (const s of SETS) {
    const refs = SET_GUIDES[s.code] ?? [];
    assert.ok(refs.length >= 1 && refs.length <= 3, `${s.code} (${s.name}) needs 1-3 guides in SET_GUIDES`);
    assert.equal(new Set(refs.map((g) => g.slug)).size, refs.length, `${s.code}: a guide listed twice`);
    for (const g of refs) {
      const a = published.get(g.slug);
      assert.ok(a, `${s.code} → ${g.slug} is not a published article`);
      assert.ok(!redirectSources.has(articleHref(a)), `${articleHref(a)} is shadowed by a next.config.js redirect`);
      assert.ok(g.reason.length >= 20 && g.reason.length <= 110, `${s.code} → ${g.slug}: reason length`);
      assert.doesNotMatch(g.reason, /\b(invest|flip|scalp|profit|predict|will rise|ahead of the market)/i);
      assert.doesNotMatch(g.reason, /value finder|rising sealed|condition calculator|bulk pricer/i);
    }
  }
});

test("a card page's Read next leads with its set's own guide, not the newest post naming the set", () => {
  // The bug: ties broken by date sent an Unleashed common to a Radiance
  // spoiler and a Vendetta card to the Astral Heron post.
  const common = (setCode: string, setName: string): CardForGuides => ({
    setName, setCode, rarity: "Common", type: "Unit", domain: "Fury",
    isPromo: false, variant: null, isSignature: false, priceCents: 25, description: null,
  });
  for (const s of SETS) {
    const guides = guidesForCard(common(s.code, s.name));
    assert.equal(guides[0]?.slug, SET_GUIDES[s.code][0].slug, `${s.name}: the set's own guide should lead`);
    assert.equal(guides[0].reason, SET_GUIDES[s.code][0].reason);
    assert.equal(new Set(guides.map((g) => g.slug)).size, guides.length, "no duplicate links");
  }
  // One set guide, not a second loosely set-matched post beside it.
  const unl = guidesForCard(common("UNL", "Unleashed")).map((g) => g.slug);
  assert.ok(!unl.some((slug) => /radiance|heartsteel/.test(slug)), `Unleashed linked a Radiance post: ${unl}`);
  // A set with no row yet still gets the old name-matched fallback, not nothing.
  assert.ok(guidesForCard(common("ZZZ", "Not A Set")).length > 0);
});

test("set pages and galleries show the set's guides from data, before the eBay block", () => {
  for (const s of SETS) {
    const guides = guidesForSet(s.code);
    assert.ok(guides.length >= 1 && guides.length <= 3, `${s.code}: 1-3 guides`);
    assert.equal(guides[0].slug, SET_GUIDES[s.code][0].slug, `${s.code}: its own guide first`);
    assert.equal(new Set(guides.map((g) => g.slug)).size, guides.length, `${s.code}: duplicate guide`);
  }
  const page = code("src/app/sets/[set]/page.tsx");
  const guidesAt = page.indexOf("<RelatedGuides guides={guidesForSet(set.code)}");
  assert.ok(guidesAt > page.indexOf("<SetPriceGuide "), "the set's guides follow the price guide");
  assert.ok(guidesAt < page.indexOf("<EbayPicks"), "…and lead the eBay block");
  assert.doesNotMatch(page, /ranked by total delivered cost/);
  // Under the grid, per the 2026-09-24 set-page decision: nothing new between
  // the hero and the card grid.
  assert.ok(page.indexOf("How to read {set.name} prices") > page.indexOf("<Reveal stagger"));

  const gallery = code("src/app/sets/[set]/gallery/page.tsx");
  assert.match(gallery, /<RelatedGuides guides=\{guidesForSet\(set\.code\)\}/);
  assert.doesNotMatch(gallery, /set\.code === "/, "a set's reading list is a SET_GUIDES row, never a code check in the template");
});

// ── Champions ────────────────────────────────────────────────────────────────

test("a champion hub links that champion's own articles, matched on the whole tag", () => {
  assert.equal(guidesForChampion({ slug: "ahri" })[0]?.slug, "every-ahri-card-in-riftbound");
  // Punctuation normalised on both sides: tag "ksante", slug "k-sante".
  assert.ok(guidesForChampion({ slug: "k-sante" }).some((g) => g.slug === "riftbound-ksante-radiance-spoiler"));

  const generic = new Set<string>(TOOL_GUIDES["/champions"].guides.map((g) => g.slug));
  for (const c of CHAMPIONS) {
    const guides = guidesForChampion(c);
    assert.ok(guides.length >= 1 && guides.length <= 3, `${c.slug}: 1-3 guides`);
    assert.equal(new Set(guides.map((g) => g.slug)).size, guides.length, `${c.slug}: duplicate guide`);
    for (const g of guides) {
      if (generic.has(g.slug)) continue;
      const a = published.get(g.slug);
      assert.ok(a, `${c.slug} → ${g.slug} is not published`);
      // Equality, never a substring — "mel" must not match "melee".
      assert.ok(a!.tags.some((t) => squash(t) === squash(c.slug)), `${c.slug} → ${g.slug}: no tag names this champion`);
    }
  }

  const page = code("src/app/champions/[slug]/page.tsx");
  const at = page.indexOf("<RelatedGuides guides={guidesForChampion(champ)}");
  assert.ok(at > page.indexOf("<CardTile"), "after the champion's cards");
  assert.ok(at < page.indexOf("<EbayBuyCta"), "before the eBay search");
  assert.doesNotMatch(page, /on delivered cost/);
});

// ── Hubs ─────────────────────────────────────────────────────────────────────

test("each catalogue hub renders the guides for its own route, after its data", () => {
  const wiring: [string, string][] = [
    ["src/app/browse/page.tsx", "/browse"],
    ["src/app/sets/page.tsx", "/sets"],
    ["src/app/stores/page.tsx", "/stores"],
    ["src/app/stores/tracked/page.tsx", "/stores/tracked"],
    ["src/app/cards/page.tsx", "/cards"],
    ["src/app/cards/rarity/page.tsx", "/cards/rarity"],
    ["src/app/domains/page.tsx", "/domains"],
    ["src/app/domains/[slug]/page.tsx", "/domains"],
    ["src/app/champions/page.tsx", "/champions"],
    ["src/app/gallery/page.tsx", "/gallery"],
    ["src/app/singles/page.tsx", "/singles"],
  ];
  for (const [file, route] of wiring) {
    const src = code(file);
    const at = src.indexOf(`<RelatedGuides guides={guidesForTool("${route}")}`);
    assert.ok(at > 0, `${file} must render guidesForTool("${route}")`);
    assert.ok(at > src.indexOf("<h1"), `${file}: the guides follow the page's own heading and data`);
  }
  const browse = code("src/app/browse/page.tsx");
  const at = browse.indexOf('guidesForTool("/browse")');
  assert.ok(at > browse.indexOf("<Pagination") && at < browse.indexOf("<AdSlot"), "/browse: under the grid, ahead of the ad");
});

test("/browse explains its prices under the H1, without giving up its H1 or its default sort", () => {
  const src = code("src/app/browse/page.tsx");
  const head = src.slice(src.indexOf("<h1"), src.indexOf("<EbayPicks"));
  assert.match(head, /<h1[^>]*>Riftbound Card List<\/h1>/);
  for (const phrase of ["before postage", "two imports a day", "07:00 and 19:00 UTC", "cheapest first by item price", "Stocked elsewhere"]) {
    assert.ok(head.includes(phrase), `/browse's explanation must say "${phrase}"`);
  }
  assert.match(head, /country === "CA"[\s\S]{0,120}eBay US/, "Canada's converted eBay US rows are named, not denied");
  assert.match(head, /href="\/methodology#ordering"/);
  assert.match(head, /href="\/guides\/where-to-buy-riftbound-cards"/);
  assert.match(src, /const BROWSE_DEFAULT_SORT = "popular";/);
  // Both /browse and the card page deep-link the ordering section.
  assert.match(read("src/app/methodology/page.tsx"), /id="ordering"/);
});

test("the card page links how the comparison is ordered, without pushing it down on a phone", () => {
  const src = code("src/app/card/[id]/page.tsx");
  const comparison = src.indexOf("<CardPriceComparison");
  const desktop = src.lastIndexOf('href="/methodology#ordering"', comparison);
  const phone = src.indexOf('href="/methodology#ordering"', comparison);
  assert.ok(desktop > 0 && phone > comparison, "one copy beside the panel from sm, one after it below sm");
  assert.match(src.slice(src.lastIndexOf("<p", desktop), desktop), /\bhidden\b[^"]*\bsm:block\b/, "the copy above the panel is hidden on phones");
  assert.match(src.slice(src.lastIndexOf("<p", phone), phone), /\bsm:hidden\b/);
});

// ── Stores and /singles ──────────────────────────────────────────────────────

test("a store page answers 'is it the cheapest?' truthfully and points to its market's guide", () => {
  const src = code("src/app/stores/[slug]/page.tsx");
  const section = src.slice(src.indexOf("Is {store.name} the cheapest?"), src.indexOf("</section>", src.indexOf("Is {store.name} the cheapest?")));
  assert.match(section, /cheapest first by item price/);
  assert.doesNotMatch(section, /ranks? every store by|by delivered cost/);
  assert.match(section, /marketGuide/);
  assert.match(section, /whereToBuy/);
  assert.match(src, /COUNTRY_GUIDE_SLUGS\[country\]/);
  assert.match(src, /"where-to-buy-riftbound-cards"/);
});

test("every market has a published buying guide, and /singles links all of them", () => {
  for (const c of COUNTRY_LIST) {
    const a = published.get(COUNTRY_GUIDE_SLUGS[c.code]);
    assert.ok(a, `${c.code}: COUNTRY_GUIDE_SLUGS points at an unpublished article`);
    assert.ok(!redirectSources.has(articleHref(a!)), `${articleHref(a!)} is a redirect source`);
  }
  assert.ok(published.has("where-to-buy-riftbound-cards"));
  const src = code("src/app/singles/page.tsx");
  assert.match(src, /COUNTRY_LIST\.flatMap/, "the guide list follows the market list");
  assert.match(src, /COUNTRY_GUIDE_SLUGS\[c\.code\]/);
  assert.doesNotMatch(src, /buy before a spike|cheapest combined cart|tracked daily/i, "no prediction, and no claim /deck builds the cart");
});

// ── Machine-readable ─────────────────────────────────────────────────────────

test("llms.txt and the discovery manifests name six markets, the weekly Index and the real order", async () => {
  const llms = await llmsTxt().text();
  assert.match(llms, /Singapore and the EU/);
  assert.match(llms, /weekly market index/);
  assert.match(llms, /two imports a day/);
  assert.doesNotMatch(llms, /five markets|daily market index|delivered cost first|no hidden fees|including shipping|real time/i);

  const plugin = (await aiPlugin().json()) as { description_for_human: string; description_for_model: string };
  assert.match(plugin.description_for_human, /the EU/);
  assert.match(plugin.description_for_model, /cheapest first by item price/);
  assert.match(plugin.description_for_model, /weekly market index/);
  assert.doesNotMatch(`${plugin.description_for_human} ${plugin.description_for_model}`, /delivered cost|real shipping cost|daily market index/i);

  const mcp = (await mcpManifest().json()) as { servers: { description: string }[] };
  assert.doesNotMatch(mcp.servers[0].description, /delivered cost/i);
  assert.doesNotMatch(code("src/app/api/mcp/route.ts"), /total delivered cost/i);
});

// ── Market lists ─────────────────────────────────────────────────────────────

const CATALOGUE = [
  "src/app/browse", "src/app/cards", "src/app/domains", "src/app/champions", "src/app/sets", "src/app/gallery",
  "src/app/stores", "src/app/singles", "src/app/keywords", "src/app/card/[id]/page.tsx",
];
function files(p: string, out: string[] = []): string[] {
  const abs = join(ROOT, p);
  if (statSync(abs).isDirectory()) for (const f of readdirSync(abs)) files(join(p, f), out);
  else if (/\.tsx?$/.test(p)) out.push(p);
  return out;
}

test("catalogue copy never lists the markets without the EU, or says prices are never converted", () => {
  // Each of these shipped: market lists from before Canada (2026-08) and the EU
  // (2026-08-24), and a promise of no conversion that Canada's "eBay US" rows
  // (US listings converted at a reference rate) break.
  const STALE = [
    /\bAU, US, UK (&|and) SG\b/,
    /\bAU, US and UK\b/,
    /\bAU, US, UK,? (&|and) Singapore\b/,
    /\bSingapore (&|and) Canada stores\b/,
    /\bUS, UK, Australia, Canada and Singapore\b/,
    /never converted|rather than a converted estimate/i,
  ];
  const bad: string[] = [];
  for (const f of CATALOGUE.flatMap((p) => files(p))) {
    const src = code(f);
    for (const re of STALE) if (re.test(src)) bad.push(`${f}: ${re}`);
  }
  assert.deepEqual(bad, []);
});
