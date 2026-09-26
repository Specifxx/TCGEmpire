import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getArticles } from "../src/lib/articles";
import { TOOL_GUIDES, TOOL_ROUTES, guidesForTool, toolsForArticle, articleHref } from "../src/lib/content/tool-guides";
import { plainIntroText } from "../src/components/HubIntro";

// Tool ↔ guide links (DECISIONS.md, "Blog and tools, joined up", 2026-09-26):
// one map read both ways, so a tool page links the guides that explain it and
// each of those guides links the tool back.

const ROOT = process.cwd();
const published = new Map(getArticles().map((a) => [a.slug, a]));
const redirectSources = new Set(
  [...readFileSync(join(ROOT, "next.config.js"), "utf8").matchAll(/source:\s*"(\/[^"]*)"/g)].map((m) => m[1]),
);

test("every route in the map is a real page", () => {
  for (const route of TOOL_ROUTES) {
    assert.ok(existsSync(join(ROOT, "src/app", route, "page.tsx")), `${route} has no page.tsx`);
  }
});

test("every guide in the map is published, reachable (no redirect shadows it) and at most three per tool", () => {
  for (const route of TOOL_ROUTES) {
    const guides = TOOL_GUIDES[route].guides;
    assert.ok(guides.length >= 1 && guides.length <= 3, `${route}: 1-3 guides`);
    assert.equal(new Set(guides.map((g) => g.slug)).size, guides.length, `${route}: a guide listed twice`);
    for (const g of guides) {
      const a = published.get(g.slug);
      assert.ok(a, `${route} → ${g.slug} is not a published article`);
      assert.ok(!redirectSources.has(articleHref(a)), `${articleHref(a)} is shadowed by a next.config.js redirect`);
    }
    assert.equal(guidesForTool(route).length, guides.length, `${route}: every listed guide resolves`);
  }
});

test("reasons describe the guide, with no invest/flip framing and no retired tool", () => {
  for (const route of TOOL_ROUTES) {
    for (const g of TOOL_GUIDES[route].guides) {
      assert.ok(g.reason.length >= 20 && g.reason.length <= 110, `${route} → ${g.slug}: reason length`);
      assert.doesNotMatch(g.reason, /\b(invest|flip|scalp|profit|predict|will rise|ahead of the market)/i, `${route} → ${g.slug}`);
      assert.doesNotMatch(g.reason, /value finder|rising sealed|condition calculator|bulk pricer/i, `${route} → ${g.slug}`);
    }
  }
});

test("toolsForArticle is the inverse of the map, minus the excluded link, capped at three", () => {
  for (const route of TOOL_ROUTES) {
    for (const g of TOOL_GUIDES[route].guides) {
      const tools = toolsForArticle(g.slug, undefined, 99).map((t) => t.href);
      assert.ok(tools.includes(route), `${g.slug} should link back to ${route}`);
    }
  }
  const slug = "why-riftbound-card-prices-change";
  assert.ok(toolsForArticle(slug, undefined, 99).length > 3, "fixture: a guide several tools share");
  assert.equal(toolsForArticle(slug).length, 3);
  assert.ok(!toolsForArticle(slug, "/movers", 99).some((t) => t.href === "/movers"));
});

test("hub intro links stay on-site: only a single-slash path becomes a link", () => {
  const src = readFileSync(join(ROOT, "src/components/HubIntro.tsx"), "utf8");
  const re = new RegExp(src.match(/const INLINE_LINK = \/(.+)\/g;/)![1], "g");
  assert.deepEqual([..."[a](/tools) [b](//evil.example) [c](https://x.example)".matchAll(re)].map((m) => m[2]), ["/tools"]);
  assert.equal(plainIntroText("See [the guide](/guides/x) first."), "See the guide first.");
});
