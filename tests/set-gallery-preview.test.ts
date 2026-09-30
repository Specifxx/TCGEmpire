import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SETS } from "../src/lib/constants";
import { NAV_GROUPS } from "../src/components/nav-groups";

// ─────────────────────────────────────────────────────────────────────────────
// /sets/<set>/gallery through a set's preview season (2026-09-30, "Radiance's
// card gallery, indexable before release" in DECISIONS.md). The live page was
// titled "Riftbound Radiance Card Gallery — 167 Cards" while 84 were shown, and
// promised live prices for a set nobody can buy yet. The preview branch counts
// what is there, dates the prices, and keeps to the gallery's own query:
// docs/seo-keyword-map.md gives "spoilers"/"revealed" to the tracker and
// "card list" to /sets/<slug>.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const GALLERY = read("src/app/sets/[set]/gallery/page.tsx");

// Evaluates the preview title candidates exactly as written in the page.
function previewTitles(name: string, total: number): string[] {
  const m = /const previewTitles = \[([\s\S]*?)\];/.exec(GALLERY);
  assert.ok(m, "the page must define previewTitles");
  return new Function("set", "total", `return [${m![1]}];`)({ name }, total) as string[];
}

// The preview description ladder: every template literal in the `preview ? [...]`
// arm, in order, plus its fallback.
function previewDescriptions(name: string, total: number, announced: number, releaseLabel: string): string[] {
  const start = GALLERY.indexOf("const description = preview");
  const end = GALLERY.indexOf(": `Browse every Riftbound", start);
  const block = GALLERY.slice(start, end);
  const literals = block.match(/`Every Riftbound[^`]*`/g) ?? [];
  assert.ok(literals.length >= 3, "expected the long, short and fallback preview descriptions");
  return literals.map((l) => new Function("set", "total", "announced", "releaseLabel", `return ${l};`)({ name }, total, announced, releaseLabel) as string);
}

test("the preview title fits, counts what is shown, and stays on the gallery query", () => {
  for (const s of SETS) {
    for (const total of [1, 84, 180, 999]) {
      const candidates = previewTitles(s.name, total);
      const title = candidates.find((t) => `${t} | RiftCompare`.length <= 60);
      assert.ok(title, `no preview title fits for ${s.name} at ${total}`);
      assert.match(title!, /Card Gallery/);
      for (const t of candidates) {
        assert.doesNotMatch(t, /spoiler|reveal|card list/i, `"${t}" competes with the tracker or the set page`);
        assert.doesNotMatch(t, /\ball\b/i, `"${t}" claims a complete set before release`);
      }
    }
  }
  assert.equal(previewTitles("Radiance", 84)[0], "Riftbound Radiance Card Gallery (84 So Far)");
});

test("some preview description fits in 155 characters for every set name", () => {
  for (const s of SETS) {
    for (const total of [1, 84, 999]) {
      const ladder = previewDescriptions(s.name, total, 180, "October 23");
      const fit = ladder.find((d) => d.length <= 155);
      assert.ok(fit, `no preview description fits for ${s.name}`);
      assert.doesNotMatch(fit!, /live prices/i, "a set with no singles on sale has no live prices");
    }
  }
});

test("the preview branch keys off the pre-order window and a real count", () => {
  // Both halves: generateMetadata and the page body. `total > 0` keeps a set
  // with nothing imported on the noindexed empty branch.
  const gates = GALLERY.match(/const preview = isPreorderSetCode\(set\.code\) && total > 0;/g) ?? [];
  assert.equal(gates.length, 2, "metadata and page must share the same preview gate");
});

test("the FAQ is one array, rendered on the page and marked up as FAQPage", () => {
  assert.ok(GALLERY.includes('"@type": "FAQPage"'), "gallery must emit FAQPage JSON-LD");
  assert.ok(GALLERY.includes("mainEntity: faq.map("), "the JSON-LD must be built from the faq array");
  assert.ok(GALLERY.includes("{faq.map((f) =>"), "the same array must be rendered visibly");
  assert.ok(GALLERY.includes("{total > 0 && <script"), "no FAQPage on an empty, noindexed gallery");
});

test("the gallery links out as text a crawler can follow: Legends and domains", () => {
  assert.match(GALLERY, /href=\{`\/card\/\$\{c\.slug \?\? c\.id\}`\}/, "Legend chips link to their card pages");
  assert.match(GALLERY, /href=\{`\/domains\/\$\{d\.domain\.toLowerCase\(\)\}`\}/, "domain chips link to /domains/<slug>");
  assert.ok(GALLERY.includes("spoilersHrefForSet(set.code)"), "a set in its run-up links its spoiler tracker");
});

test("a set in its preview season is reachable: nav, the gallery hub and every other set's gallery", () => {
  // Derived from SETS, so this holds for whichever set is in its preview season.
  for (const s of SETS.filter((x) => x.comingSoon && x.hubReady)) {
    const nav = NAV_GROUPS.flatMap((g) => g.links).find((l) => l.href === `/sets/${s.slug}/gallery`);
    assert.ok(nav, `the ${s.name} gallery must be in the nav (and so the footer)`);
    assert.equal(nav!.label, `${s.name} card gallery`);
  }

  const hub = read("src/app/gallery/page.tsx");
  assert.ok(hub.includes("upcoming: withCounts.filter((s) => s.comingSoon && hasSetHub(s))"), "/gallery must list a hub-ready upcoming set");
  // Its partial count must not inflate the hub's "all N cards, every set" title.
  assert.ok(hub.includes("const { released } = await getSetCounts();"), "the hub title counts released sets only");

  assert.ok(GALLERY.includes("SETS.filter((s) => s.slug !== set.slug && hasSetHub(s))"), "each gallery links the other set galleries, upcoming included");

  // The homepage's "By set" grid: the preview set's "Coming soon" tile links to
  // its gallery instead of rendering disabled (owner, 2026-09-30).
  const home = read("src/components/home/HomeSections.tsx");
  assert.match(home, /hasSetHub\(s\) \? \(\s*<Link[\s\S]{0,120}href=\{`\/sets\/\$\{s\.slug\}\/gallery`\}/, "the Coming soon tile links to the gallery");
});

test("Vendetta no longer carries the homepage's New badge", () => {
  const ven = SETS.find((s) => s.code === "VEN");
  assert.ok(ven && !ven.recentlyReleased, "Vendetta went on sale 31 Jul 2026; the New badge has run its course");
});
