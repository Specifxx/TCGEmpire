import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_PULL_LINES,
  decodePulls,
  encodePulls,
  parsePaid,
  parseShareCode,
  pullKey,
  pullsCsv,
  shareCode,
  summarisePulls,
} from "../src/lib/pull-tracker";
import { parseCollectionCsv } from "../src/lib/collection-csv";
import { SIGNUP_SOURCES } from "../src/lib/signup-source-shared";

// ─────────────────────────────────────────────────────────────────────────────
// THE PULL TRACKER (2026-10-16 growth pass; DECISIONS.md, "Growth: meet
// readers where they are"): log a box, see its worth, save it, share it.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("a pull is keyed by its collector number, and the share format round-trips", () => {
  assert.equal(pullKey("174*/167"), "174*");
  assert.equal(pullKey("065a/167"), "065a");
  assert.equal(encodePulls([{ num: "174*", qty: 1 }, { num: "174*", qty: 2 }, { num: "065a", qty: 1 }]), "174*:3,065a:1", "duplicates merge");
  assert.deepEqual(decodePulls("174*:3,065a:1"), [{ num: "174*", qty: 3 }, { num: "065a", qty: 1 }]);
  const code = shareCode([{ num: "169*", qty: 2 }], 14230, "CA");
  assert.match(code, /^[A-Za-z0-9_-]+$/, "one URL-safe path segment");
  assert.deepEqual(parseShareCode(code), { lines: [{ num: "169*", qty: 2 }], paidCents: 14230, country: "CA" });
});

test("a link is untrusted: junk is dropped, sizes are capped, nothing throws", () => {
  assert.deepEqual(decodePulls("<script>:1,174*:-4,ok:x,R02:1000"), [{ num: "R02", qty: 99 }]);
  assert.equal(decodePulls(Array.from({ length: 200 }, (_, i) => `${i}:1`).join(",")).length, MAX_PULL_LINES);
  assert.equal(parseShareCode("not base64!"), null);
  assert.equal(parseShareCode("x".repeat(5000)), null);
  assert.equal(parseShareCode(Buffer.from("p=&m=US").toString("base64url")), null, "no pulls, no page");
  assert.equal(parseShareCode(Buffer.from("p=001:1&m=XX").toString("base64url"))?.country, "US", "an unknown market falls back");
  assert.equal(parsePaid("abc"), null);
  assert.equal(parsePaid("-3"), null);
  assert.equal(parsePaid("142.3"), 14230);
});

test("the total counts priced cards, says how many are unpriced, and compares with what was paid", () => {
  const s = summarisePulls(
    [
      { num: "1", qty: 2, eachCents: 500 },
      { num: "2", qty: 1, eachCents: null },
      { num: "3", qty: 1, eachCents: 12000 },
    ],
    10000,
  );
  assert.equal(s.totalCents, 13000);
  assert.equal(s.unpricedLines, 1);
  assert.equal(s.copies, 4);
  assert.equal(s.diffCents, 3000);
  assert.equal(s.best?.num, "3");
  assert.equal(summarisePulls([], null).diffCents, null);
});

test("'Save to my binder' sends a CSV the collection import's printing-aware path reads", () => {
  const csv = pullsCsv("RAD", [
    { num: "174*", qty: 1, name: "Seraphine, Starry-Eyed Songstress" },
    { num: "065a", qty: 2, name: 'A "quoted" name' },
  ]);
  const parsed = parseCollectionCsv(csv);
  assert.ok(parsed, "recognised as a set + number CSV");
  assert.equal(parsed!.skippedCount, 0, "no line is skipped, the quoted name included");
  assert.deepEqual(parsed!.rows.map((c) => [c.setCode, c.number, c.qty]), [["RAD", "174*", 1], ["RAD", "065a", 2]]);
});

test("pages: cached six hours, shares kept out of the index, and the tracker is reachable and attributed", () => {
  assert.ok(SIGNUP_SOURCES.has("pull_tracker"));
  const page = read("src/app/tools/pull-tracker/[set]/page.tsx");
  assert.match(page, /export const revalidate = 21600;/);
  assert.doesNotMatch(page, /generateStaticParams/, "no static prewarming of a database-backed route");
  const share = read("src/app/tools/pull-tracker/[set]/s/[code]/page.tsx");
  assert.match(share, /^export const dynamic = "force-dynamic";$/m); // CDN-cached share page (tests/card-cdn.test.ts)
  assert.match(share, /robots: \{ index: false, follow: true \}/);
  assert.match(read("src/lib/pull-tracker-server.ts"), /\{ revalidate: 21600, tags: \[CONTENT_TAG\] \}/, "no loader cache under its pages' TTL");
  assert.match(read("src/components/nav-groups.ts"), /href: "\/tools\/pull-tracker\/radiance"/);
  assert.match(read("src/lib/sitemap-sections.ts"), /\/tools\/pull-tracker\/\$\{s\}/);
  assert.match(read("src/components/PullTracker.tsx"), /markSignupSource\(PULL_TRACKER_SOURCE\)/);
});
