import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALL_CREATORS, CREATORS, featuredCreators, isListedCreator } from "../src/lib/content/creators";

// A pending creator (offered a listing, not yet replied) appears nowhere on the site
// (owner, 2026-10-30: "Only render him once status is confirmed").
test("a pending creator is held back from CREATORS and the rotation", () => {
  const pending = ALL_CREATORS.filter((c) => c.status === "pending");
  for (const c of pending) {
    assert.ok(!CREATORS.some((x) => x.slug === c.slug), `${c.slug} is pending but listed`);
    assert.ok(!featuredCreators().some((x) => x.slug === c.slug), `${c.slug} is pending but in the rotation`);
  }
  assert.equal(CREATORS.length, ALL_CREATORS.filter(isListedCreator).length);
});

test("Runeterra Bound waits as pending with only the facts we have", () => {
  const c = ALL_CREATORS.find((x) => x.slug === "runeterrabound");
  assert.ok(c);
  assert.equal(c.status, "pending");
  assert.equal(c.name, "Runeterra Bound");
  assert.deepEqual(c.links, [{ platform: "Instagram", url: "https://www.instagram.com/runeterrabound/", handle: "@runeterrabound" }]);
  assert.equal(c.blurb, "", "no invented bio");
  assert.equal(c.avatar, undefined, "no avatar until he sends one");
  assert.equal(c.code, undefined, "his code comes from /admin/affiliates");
});

test("a confirmed creator has a blurb, unique slug and their own links", () => {
  const slugs = new Set<string>();
  for (const c of CREATORS) {
    assert.ok(c.blurb.trim(), `${c.slug} is confirmed without a blurb`);
    assert.ok(!slugs.has(c.slug), `duplicate slug ${c.slug}`);
    slugs.add(c.slug);
    assert.ok(c.links.length > 0, `${c.slug} has no links`);
  }
});

// Nothing outside creators.ts and this test reads ALL_CREATORS: pages and routes read CREATORS.
test("only creators.ts reads ALL_CREATORS", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  const root = join(__dirname, "../src");
  const offenders = walk(root).filter((f) => !f.endsWith(join("content", "creators.ts")) && readFileSync(f, "utf8").includes("ALL_CREATORS"));
  assert.deepEqual(offenders, []);
});
