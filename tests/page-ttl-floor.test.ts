import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// NO CACHED PAGE REFRESHES MORE OFTEN THAN EVERY SIX HOURS (owner, 2026-10-14:
// "refresh cached pages less often (prices probably only need refreshing every
// 6 to 24 hours)"). DECISIONS.md, "Cached pages refresh every 6 to 24 hours".
//
// Prices reach the pages through the import's purge (/api/revalidate and
// CONTENT_TAG) and the daily release, so a page's TTL is only the fallback for
// a missed purge. 21600 for what buyers act on, 86400 for slow content.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const FLOOR = 21600;

// The one exception, and why: /auctions reads searchParams, so it is dynamic and
// its export is not a page cache; getLiveAuctions' 30-minute data cache is the
// board's cadence against a sweep every four hours, and tests/ebay-auctions
// requires that loader to be at least the page's export.
const EXCEPTIONS: Record<string, number> = { "src/app/auctions/page.tsx": 1800 };

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

test("every export const revalidate under src/app is at least six hours", () => {
  const low: string[] = [];
  let seen = 0;
  for (const file of walk(join(ROOT, "src/app"))) {
    const rel = relative(ROOT, file);
    const m = /^export const revalidate\s*=\s*(\d[\d_]*)/m.exec(readFileSync(file, "utf8"));
    if (!m) continue;
    seen++;
    const ttl = Number(m[1].replace(/_/g, ""));
    if (ttl >= FLOOR || EXCEPTIONS[rel] === ttl) continue;
    low.push(`${rel}: revalidate = ${ttl}`);
  }
  assert.ok(seen >= 60, `expected to find the route exports, found ${seen}`);
  assert.deepEqual(low, [], `under the six-hour floor:\n${low.join("\n")}`);
});

test("a route handler's CDN header is its cache, so it is at least six hours too", () => {
  // Handlers that read request.url, or have a dynamic segment with no
  // generateStaticParams, are plain functions on Vercel: `revalidate` caches
  // nothing there. Short answers are allowed only for the fallbacks that ask
  // for a quick retry (a 404 or warming state: one to five minutes).
  const low: string[] = [];
  for (const file of walk(join(ROOT, "src/app"))) {
    if (!/route\.tsx?$/.test(file)) continue;
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/s-maxage=(\d+)/g)) {
      const s = Number(m[1]);
      if (s >= FLOOR || s <= 300) continue;
      low.push(`${relative(ROOT, file)}: s-maxage=${s}`);
    }
  }
  assert.deepEqual(low, [], low.join("\n"));
});

test("the homes' stats cache is not shorter than the homes (egress rule 5), and their age line is recomputed", () => {
  const home = Number(/^export const revalidate = (\d+);/m.exec(readFileSync(join(ROOT, "src/app/page.tsx"), "utf8"))?.[1]);
  const stats = readFileSync(join(ROOT, "src/lib/home-stats.ts"), "utf8");
  const inner = Number(/getHomeStats = unstable_cache\(computeHomeStats, \["home-stats-v1"\], \{\s*revalidate: (\d+),/.exec(stats)?.[1]);
  assert.ok(home >= FLOOR, `"/" revalidates every ${home}s`);
  assert.ok(inner >= home, `getHomeStats caches for ${inner}s under a ${home}s page: the page would refresh at ${inner}s`);
  // "Prices updated 5h ago" is computed at render; frozen in a six-hour page it
  // would understate the age, so both places that print it recompute after mount.
  assert.match(stats, /freshnessAt: lastPriceRefresh\._max\.lastSeen \? lastPriceRefresh\._max\.lastSeen\.toISOString\(\) : null/);
  for (const f of ["src/components/home/HeroStats.tsx", "src/components/home/EditorialHub.tsx"]) {
    assert.match(readFileSync(join(ROOT, f), "utf8"), /<UpdatedAgo iso=\{freshnessAt\} fallback=\{freshness\} \/>/, f);
  }
  const ago = readFileSync(join(ROOT, "src/components/home/UpdatedAgo.tsx"), "utf8");
  assert.match(ago, /^"use client";/);
  assert.match(ago, /useState\(fallback\)/, "the first render is the server's string, so hydration matches");
  assert.match(ago, /useEffect\(\(\) => \{\s*if \(iso\) setText\(timeAgo\(iso\)\);/);
});
