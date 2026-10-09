import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// ─────────────────────────────────────────────────────────────────────────────
// The public price history is day files in the repository since 2026-10-03
// (src/lib/price-history-store.ts, DECISIONS.md "Public price history moves out
// of Neon into the repository"). These tests drive the store itself against a
// scratch directory, and check the real published files hold nothing but
// public prices.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const scratch = mkdtempSync(join(tmpdir(), "rc-price-history-"));
process.env.PRICE_HISTORY_DIR = scratch;
test.after(() => rmSync(scratch, { recursive: true, force: true }));

type Store = typeof import("../src/lib/price-history-store");
let storePromise: Promise<Store> | null = null;
// Imported after PRICE_HISTORY_DIR is set: the store resolves it at load.
const store = () => (storePromise ??= import("../src/lib/price-history-store"));
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

test("points written for several days read back oldest first, filtered by card and by day", async () => {
  const s = await store();
  s.writeCardHistoryDay(day("2026-10-01"), [["b", 500], ["a", 1000]]);
  s.writeCardHistoryDay(day("2026-10-02"), [["a", 900]]);
  s.writeCardHistoryDay(day("2026-10-03"), [["a", 1100], ["b", 450]]);

  const all = s.cardHistoryRows();
  const byDayThenCard = (x: (string | number)[], y: (string | number)[]) =>
    String(x[1]).localeCompare(String(y[1])) || String(x[0]).localeCompare(String(y[0]));
  assert.deepEqual(
    all.map((r) => [r.cardId, r.day.toISOString().slice(0, 10), r.lowestPriceCents]).sort(byDayThenCard),
    [["a", "2026-10-01", 1000], ["b", "2026-10-01", 500], ["a", "2026-10-02", 900], ["a", "2026-10-03", 1100], ["b", "2026-10-03", 450]],
  );
  assert.ok(all.every((r, i) => i === 0 || all[i - 1].day <= r.day), "oldest first");
  assert.deepEqual(s.cardHistoryRows({ cardIds: ["b"] }).map((r) => r.lowestPriceCents), [500, 450]);
  assert.deepEqual(s.cardHistoryRows({ since: day("2026-10-02"), cardIds: ["a"] }).map((r) => r.lowestPriceCents), [900, 1100]);
  assert.equal(s.cardHistoryDayCount("a"), 3);
  assert.equal(s.cardHistoryDayCount("missing"), 0);
  assert.equal(s.cardHistoryLatestDay()?.toISOString().slice(0, 10), "2026-10-03");

  const a = s.cardHistorySummaries().find((x) => x.cardId === "a")!;
  assert.equal(a.maxCents, 1100);
  assert.equal(a.minCents, 900);
  assert.equal(a.days, 3);
  assert.equal(a.firstDay.toISOString().slice(0, 10), "2026-10-01");
  assert.equal(a.lastDay.toISOString().slice(0, 10), "2026-10-03");
  assert.deepEqual(s.cardHistoryStats(), { days: 3, cards: 2, points: 5, first: "2026-10-01", last: "2026-10-03" });
});

test("a same-day re-run replaces the day (the last import of the day wins) and changes the version", async () => {
  const s = await store();
  const before = s.cardHistoryVersion();
  s.writeCardHistoryDay(day("2026-10-03"), [["a", 1050], ["b", 450]]);
  assert.notEqual(s.cardHistoryVersion(), before, "a rewritten newest day must change every cache key built on it");
  assert.deepEqual(s.cardHistoryRows({ cardIds: ["a"], since: day("2026-10-03") }).map((r) => r.lowestPriceCents), [1050]);
  const again = s.cardHistoryVersion();
  assert.equal(s.cardHistoryVersion(), again, "stable while nothing changes");
});

test("a write with nothing valid keeps the day's previous file; invalid points are dropped, not the batch", async () => {
  const s = await store();
  assert.equal(s.writeCardHistoryDay(day("2026-10-03"), []), null);
  assert.equal(s.writeCardHistoryDay(day("2026-10-03"), [["a", 0], ["b", -5]]), null);
  assert.equal(s.cardHistoryRows({ since: day("2026-10-03") }).length, 2, "the previous file is untouched");

  const res = s.writeCardHistoryDay(day("2026-10-04"), [["a", 1200], ["b", 0], ["c", 3.5], ["", 100], ["d", 700]]);
  assert.equal(res?.count, 2);
  assert.deepEqual(s.cardHistoryRows({ since: day("2026-10-04") }).map((r) => r.cardId).sort(), ["a", "d"]);
});

test("the day file is deterministic JSON: sorted keys, USD, the basis, a trailing newline", async () => {
  const s = await store();
  s.writeCardHistoryDay(day("2026-10-05"), [["z", 1], ["m", 2], ["a", 3]]);
  const raw = readFileSync(join(scratch, "cards", "2026-10-05.json"), "utf8");
  assert.ok(raw.endsWith("}\n"));
  const file = JSON.parse(raw);
  assert.deepEqual(Object.keys(file), ["day", "currency", "basis", "prices"]);
  assert.equal(file.day, "2026-10-05");
  assert.equal(file.currency, "USD");
  assert.deepEqual(Object.keys(file.prices), ["a", "m", "z"], "sorted, so a day's diff is readable and stable");
  assert.ok(!readdirSync(join(scratch, "cards")).some((f) => f.endsWith(".tmp")), "the atomic write leaves no temp file");
});

test("the sealed series round-trips per group and market", async () => {
  const s = await store();
  assert.equal(s.writeSealedHistoryDay(day("2026-10-03"), []), null);
  s.writeSealedHistoryDay(day("2026-10-03"), [
    { groupKey: "ogn-booster-box", country: "AU", lowestPriceCents: 29900 },
    { groupKey: "ogn-booster-box", country: "US", lowestPriceCents: 14999 },
    { groupKey: "sfd|signature", country: "US", lowestPriceCents: 5000 },
  ]);
  const rows = s.sealedHistoryRows();
  assert.equal(rows.length, 3);
  assert.ok(rows.some((r) => r.groupKey === "sfd|signature" && r.country === "US" && r.lowestPriceCents === 5000), "a '|' in a groupKey survives");
  assert.equal(s.sealedHistoryLatestDay()?.toISOString().slice(0, 10), "2026-10-03");
});

// ── The real, published files ────────────────────────────────────────────────

test("every published day file holds public prices and nothing else", () => {
  // data/price-history ships with the source. A private field (a user, an
  // email, a click) written here by mistake would be published, so the shape
  // of every file is pinned: day, currency/basis, and integer cents keyed by a
  // card id or product group.
  const base = join(ROOT, "data", "price-history");
  const cardFiles = readdirSync(join(base, "cards")).filter((f) => f.endsWith(".json"));
  assert.ok(cardFiles.length >= 30, `expected the backfilled history, found ${cardFiles.length} day files`);
  for (const f of cardFiles) {
    const file = JSON.parse(readFileSync(join(base, "cards", f), "utf8"));
    assert.deepEqual(Object.keys(file), ["day", "currency", "basis", "prices"], f);
    assert.equal(`${file.day}.json`, f);
    assert.equal(file.currency, "USD");
    for (const [id, cents] of Object.entries(file.prices)) {
      assert.match(id, /^[a-z0-9-]+$/i, `${f}: ${id} is not a card id`);
      assert.ok(Number.isInteger(cents) && (cents as number) > 0, `${f}: ${id} has ${cents}`);
    }
  }
  for (const f of readdirSync(join(base, "sealed")).filter((x) => x.endsWith(".json"))) {
    const file = JSON.parse(readFileSync(join(base, "sealed", f), "utf8"));
    assert.deepEqual(Object.keys(file), ["day", "basis", "prices"], f);
    for (const byCountry of Object.values(file.prices) as Record<string, number>[]) {
      for (const [country, cents] of Object.entries(byCountry)) {
        assert.match(country, /^[A-Z]{2}$/, `${f}: ${country}`);
        assert.ok(Number.isInteger(cents) && cents > 0, `${f}: ${cents}`);
      }
    }
  }
});

test("the release bundles the files, and the import publishes them without a deploy", () => {
  // A runtime fs read is invisible to Next's file tracing: without this include
  // every deployed function would find no history at all.
  const config = require(join(ROOT, "next.config.js"));
  // Since 2026-10-09 the public data snapshot (data/public/) is bundled beside it.
  assert.deepEqual(config.experimental?.outputFileTracingIncludes?.["/**"], ["./data/price-history/**/*.json", "./data/public/**/*.json"]);

  const wf = read(".github/workflows/refresh-prices.yml");
  assert.match(wf, /\npermissions:\n  contents: write\n/);
  const publish = wf.indexOf("- name: Publish the day's price-history files");
  assert.ok(publish > wf.indexOf("- name: Import sealed products"), "after both writers");
  assert.ok(publish > wf.indexOf("- name: Revalidate site pages"), "after the revalidate step reads main's newest subject");
  assert.ok(publish < wf.indexOf("- name: Free price alerts"), "before the alert steps");
  assert.match(wf.slice(publish), /^- name: Publish the day's price-history files[\s\S]*?if: \$\{\{ !cancelled\(\) \}\}\n\s*run: bash scripts\/publish-price-history\.sh /);

  // The publish script refuses a deploy marker in the message it is handed.
  let refused = false;
  try {
    execFileSync("bash", [join(ROOT, "scripts/publish-price-history.sh"), "a run [Deploy]"], { cwd: scratch, stdio: "pipe" });
  } catch (e) {
    refused = /refusing to publish/.test(String((e as { stdout?: Buffer }).stdout ?? ""));
  }
  assert.ok(refused, "the publish script must refuse a [deploy] marker");
  assert.doesNotMatch(read("scripts/publish-price-history.sh"), /git push[^\n]*--force/, "never a force push to main");
});
