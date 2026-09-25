import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ARTICLES, type Article } from "../src/lib/articles";

// Card galleries where they earn clicks (2026-09-25): the spoiler tracker opens
// newest-first and collapsed, the leak roundup and its three guides carry
// self-filling Deploy/Showoff/Disarm galleries, and the Empower and Flow guides'
// galleries moved up the page and to 24 deep.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const bySlug = (slug: string): Article => {
  const a = ARTICLES.find((x) => x.slug === slug);
  assert.ok(a, slug);
  return a;
};
const markers = (body: string) => [...body.matchAll(/^\[\[embed:(\d+)\]\]$/gm)].map((m) => parseInt(m[1], 10));

test("the spoiler tracker opens newest-first, collapsed to 24 tiles", () => {
  const e = bySlug("riftbound-radiance-spoilers").embeds?.find((x) => x.setAll === "RAD");
  assert.ok(e, "tracker has its setAll RAD gallery");
  assert.equal(e.defaultSort, "recent");
  assert.equal(e.initialCount, 24);
  assert.equal(e.filterable, true);
  assert.ok((e.take ?? 0) >= 400, "the full set is still fetched");
});

test("FilterableCardGallery hides past initialCount, never slices the list", () => {
  const src = read("src/components/FilterableCardGallery.tsx");
  // Crawlers must still get every card link in the server HTML.
  assert.doesNotMatch(src, /\.slice\(/);
  assert.match(src, /useState<Sort>\(defaultSort \?\? "number"\)/);
  assert.match(src, /"hidden" : "contents"/);
  assert.match(src, /Show all/);
  // Collapse only the unfiltered view.
  assert.match(src, /activeCount === 0 && !q/);
  const view = read("src/components/ArticleView.tsx");
  assert.match(view, /defaultSort=\{embed\.defaultSort\} initialCount=\{embed\.initialCount\}/);
});

test("leak roundup and guides: RAD-scoped, bracketed-marker galleries, all positioned", () => {
  const cases: [string, string[]][] = [
    ["riftbound-radiance-leaked-mechanics", ["[Deploy", "[Showoff", "[Disarm"]],
    ["riftbound-deploy-explained", ["[Deploy"]],
    ["riftbound-showoff-explained", ["[Showoff"]],
    ["riftbound-disarm-explained", ["[Disarm"]],
  ];
  for (const [slug, want] of cases) {
    const a = bySlug(slug);
    const embeds = a.embeds ?? [];
    assert.deepEqual(embeds.map((e) => e.rulesContain), want, slug);
    for (const e of embeds) {
      assert.equal(e.rulesSet, "RAD", `${slug}: scoped to Radiance`);
      // Bracketed prefix only — plain "Disarm" is on an unrelated Kai'Sa text.
      assert.match(e.rulesContain ?? "", /^\[[A-Z][a-z]+$/, `${slug}: bracketed marker`);
      assert.ok(!e.setAll && !e.chaseSet, `${slug}: renders nothing until a card matches`);
    }
    assert.deepEqual(markers(a.body), want.map((_, i) => i), `${slug}: every gallery placed in the body`);
  }
  // Each roundup gallery sits under its own mechanic's section.
  const body = bySlug("riftbound-radiance-leaked-mechanics").body;
  const at = (s: string) => body.indexOf(s);
  assert.ok(at("## Deploy:") < at("[[embed:0]]") && at("[[embed:0]]") < at("## Showoff:"));
  assert.ok(at("## Showoff:") < at("[[embed:1]]") && at("[[embed:1]]") < at("## Disarm:"));
  assert.ok(at("## Disarm:") < at("[[embed:2]]") && at("[[embed:2]]") < at("## Deploy, Showoff and Disarm at a glance"));
});

test("Empower and Flow guides use positioned 24-deep galleries, not the legacy embed", () => {
  for (const [slug, marker, section] of [
    ["riftbound-empower-explained", "[Empower]", "## How the Empower mechanic works"],
    ["riftbound-flow-explained", "[Flow]", "## How the Flow mechanic works"],
  ] as const) {
    const a = bySlug(slug);
    assert.equal(a.embed, undefined, `${slug}: no legacy tail embed`);
    const e = a.embeds?.[0];
    assert.ok(e, slug);
    assert.equal(e.rulesContain, marker);
    assert.equal(e.rulesSet, "VEN");
    assert.equal(e.take, 24);
    const how = a.body.indexOf(section);
    const placed = a.body.indexOf("[[embed:0]]");
    assert.ok(how >= 0 && placed > how, `${slug}: gallery after the how-it-works section`);
    const nextH2 = a.body.indexOf("\n## ", how + 1);
    assert.ok(placed < nextH2, `${slug}: gallery at the end of that section`);
  }
});

test("the leaked-keyword count runs read-only after the set-pipeline import", () => {
  const wf = read(".github/workflows/maintenance.yml");
  const step = wf.slice(wf.indexOf("- name: Count leaked-keyword cards"));
  assert.ok(wf.indexOf("- name: Set pipeline (official gallery → import)") < wf.indexOf("- name: Count leaked-keyword cards"));
  assert.match(step.slice(0, 400), /continue-on-error: true/);
  assert.match(step.slice(0, 400), /scripts\/check-leaked-keywords\.ts/);
  const script = read("scripts/check-leaked-keywords.ts");
  assert.match(script, /GITHUB_STEP_SUMMARY/);
  assert.doesNotMatch(script, /\.(create|update|upsert|delete)(Many)?\(/, "never writes");
});
