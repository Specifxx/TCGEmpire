import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  unwrapD,
  parseDotNetDate,
  normalizePath,
  templateOf,
  rollupByTemplate,
  pick,
  pickString,
} from "../scripts/bing-coverage";

// THE BING SIDE WAS COMPLETELY UNMEASURED, AND THAT IS WHY THIS FILE EXISTS.
//
// Google has two monitoring workflows and months of recorded numbers. Bing had
// no key, no workflow, no script, and two figures asserted from code comments
// with no source anywhere in DECISIONS.md or docs/ ("~45% of search referrals",
// "397 Title too long warnings"). The script these tests cover is what makes
// claims like those checkable.
//
// THERE IS NO BING KEY IN THIS SANDBOX, so the network half cannot be exercised
// at all. What CAN be wrong by construction is the parsing: Bing wraps payloads
// in a `d` property and returns .NET `/Date(…)/` strings, and getting either
// wrong produces a confident, wrong report rather than an error. So every pure
// helper is pinned here, including the shapes that are not the happy path.

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// Comments out, code in — line comments FIRST (see tests/card-type-seo.test.ts
// for the 58KB-swallowing reason), and the `[^:]` guard keeps "https://" intact.
const codeOnly = (src: string) =>
  src.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ── 1. The `d` envelope ────────────────────────────────────────────────────

test("the d envelope is unwrapped, and a bare payload still works", () => {
  assert.deepEqual(unwrapD({ d: [1, 2, 3] }), [1, 2, 3]);
  assert.deepEqual(unwrapD({ d: { DailyQuota: 10 } }), { DailyQuota: 10 });
  // Tolerance is deliberate: a working response must not be discarded because
  // the wrapper changed.
  assert.deepEqual(unwrapD([1, 2]), [1, 2]);
  assert.equal(unwrapD(null), null);
  assert.equal(unwrapD({ d: null }), null);
});

// ── 2. .NET dates ──────────────────────────────────────────────────────────

test("/Date(ms)/ parses, with or without an offset suffix", () => {
  assert.equal(parseDotNetDate("/Date(1758067200000)/"), "2025-09-17");
  assert.equal(parseDotNetDate("/Date(1758067200000-0700)/"), "2025-09-17");
  assert.equal(parseDotNetDate("/Date(1758067200000+1000)/"), "2025-09-17");
});

test("an ISO date passes through rather than being rejected", () => {
  assert.equal(parseDotNetDate("2026-09-17T00:00:00Z"), "2026-09-17");
  assert.equal(parseDotNetDate("2026-09-17"), "2026-09-17");
});

test("junk returns null, never the string 'Invalid Date'", () => {
  // The failure this prevents: `new Date(NaN).toISOString()` throws, and a
  // `String(new Date(NaN))` would have put "Invalid Date" straight into the
  // report as if it were a day.
  for (const bad of ["", "not a date", "/Date()/", "/Date(abc)/", null, undefined, 42, {}]) {
    assert.equal(parseDotNetDate(bad), null, `${JSON.stringify(bad)} must be null`);
  }
});

// ── 3. Path normalisation must MATCH the Google report ──────────────────────

test("normalizePath drops query, fragment and trailing slash", () => {
  assert.equal(normalizePath("https://riftcompare.com/browse?page=2"), "/browse");
  assert.equal(normalizePath("https://riftcompare.com/cards/all#set-ogn"), "/cards/all");
  assert.equal(normalizePath("https://riftcompare.com/sets/origins/"), "/sets/origins");
  assert.equal(normalizePath("https://riftcompare.com/"), "/");
  assert.equal(normalizePath("https://riftcompare.com"), "/");
  // A bare path (Bing has returned both) must behave identically.
  assert.equal(normalizePath("/card/ahri-ogn-255-298"), "/card/ahri-ogn-255-298");
});

test("templateOf matches gsc-coverage.yml's tpl(), which is the whole point", () => {
  // If these two disagree, the /card row in this report is not comparable to
  // the /card row in the Google one, and comparing them is why this exists.
  assert.equal(templateOf("/"), "home");
  assert.equal(templateOf("https://riftcompare.com/"), "home");
  assert.equal(templateOf("/card/ahri-ogn-255-298"), "/card");
  assert.equal(templateOf("/sets/origins/gallery"), "/sets");
  assert.equal(templateOf("/blog/riftbound-radiance-what-we-know"), "/blog");
});

// ── 4. The rollup ──────────────────────────────────────────────────────────

test("pages are de-duplicated by normalised path before the page count", () => {
  // Without this, `?utm=` variants inflate `pages` and the /card row stops
  // matching Google's — a wrong comparison is worse than no comparison.
  const roll = rollupByTemplate([
    { url: "https://riftcompare.com/card/a", impressions: 10, clicks: 1 },
    { url: "https://riftcompare.com/card/a?utm_source=x", impressions: 5, clicks: 0 },
    { url: "https://riftcompare.com/card/b", impressions: 3, clicks: 0 },
  ]);
  assert.equal(roll.length, 1);
  assert.equal(roll[0].template, "/card");
  assert.equal(roll[0].pages, 2, "two distinct cards, not three rows");
  assert.equal(roll[0].impressions, 18);
  assert.equal(roll[0].clicks, 1);
});

test("the rollup is sorted busiest first", () => {
  const roll = rollupByTemplate([
    { url: "/blog/x", impressions: 5, clicks: 0 },
    { url: "/card/a", impressions: 50, clicks: 2 },
    { url: "/sets/origins", impressions: 20, clicks: 1 },
  ]);
  assert.deepEqual(roll.map((r) => r.template), ["/card", "/sets", "/blog"]);
});

test("an empty result is an empty rollup, not a crash", () => {
  assert.deepEqual(rollupByTemplate([]), []);
});

// ── 5. Field-name drift degrades to zero, never to a crash ─────────────────

test("pick reads the first present numeric key and falls back", () => {
  assert.equal(pick({ Impressions: 12 }, ["Impressions", "ImpressionCount"]), 12);
  assert.equal(pick({ ImpressionCount: 7 }, ["Impressions", "ImpressionCount"]), 7);
  assert.equal(pick({ Other: 1 }, ["Impressions"]), 0);
  assert.equal(pick({ Impressions: "12" }, ["Impressions"]), 0, "a string is not a count");
  assert.equal(pick({ Impressions: NaN }, ["Impressions"]), 0);
  assert.equal(pick(null, ["Impressions"]), 0);
  assert.equal(pick(undefined, ["Impressions"], -1), -1);
});

test("pickString is equally tolerant", () => {
  assert.equal(pickString({ Url: "/a" }, ["Url", "Page"]), "/a");
  assert.equal(pickString({ Page: "/b" }, ["Url", "Page"]), "/b");
  assert.equal(pickString({ Url: "" }, ["Url", "Page"]), "");
  assert.equal(pickString(null, ["Url"]), "");
});

// ── 6. Contract with the workflow, and with the no-key path ────────────────

test("the script is read-only — it never submits a URL to Bing", () => {
  const code = codeOnly(read("scripts/bing-coverage.ts"));
  assert.doesNotMatch(code, /SubmitUrl/i, "submission is a human decision, not a daily cron");
  assert.doesNotMatch(code, /method:\s*"POST"/, "every call is a GET");
  // And it must not reach either database.
  assert.doesNotMatch(code, /from "\.\.\/src\/lib\/db"/);
  assert.doesNotMatch(code, /prisma/i);
});

test("main() runs only when invoked as a script, never on import", () => {
  // This file imports the module, and an UNGUARDED main() made that import run
  // the whole report: `npm test` left a docs/bing-coverage.json behind (it was
  // committed once before this was caught), and with BING_API_KEY set in the
  // environment it would have fired six live API calls from the test run. The
  // import is not optional — the parsing above is exactly what has to be
  // unit-tested — so the guard is what keeps both true.
  const code = codeOnly(read("scripts/bing-coverage.ts"));
  assert.match(code, /const invokedDirectly =/);
  assert.match(code, /import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href/);
  assert.match(code, /if \(invokedDirectly\) \{\s*main\(\)/);
  // A bare top-level call must not come back.
  assert.doesNotMatch(code, /^main\(\)/m, "main() must not be called at the top level");
});

test("a missing key explains itself and exits 0, like gsc-coverage does", () => {
  const code = codeOnly(read("scripts/bing-coverage.ts"));
  assert.match(code, /if \(!key\)/);
  // No process.exit(1) anywhere: a monitor must not page anyone about Bing's API.
  assert.doesNotMatch(code, /process\.exit\(1\)/);
});

test("the workflow no-ops without the secret rather than failing red", () => {
  const wf = read(".github/workflows/bing-coverage.yml");
  assert.match(wf, /BING_API_KEY: \$\{\{ secrets\.BING_API_KEY \}\}/);
  assert.match(wf, /npx tsx scripts\/bing-coverage\.ts/);
  // Scheduled AFTER gsc-coverage.yml's 07:20 so one morning's two reports agree
  // about which morning they describe.
  assert.match(wf, /cron: "35 7 \* \* \*"/);
  const gsc = read(".github/workflows/gsc-coverage.yml");
  assert.match(gsc, /cron: "20 7 \* \* \*"/, "if the Google run moves, move this one too");
});
