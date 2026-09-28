import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { movementFromRanks } from "../src/lib/demand-movement";
import { chartStory, generateRisingTitle, toSnapshotData, type RisingSnapshotData, type RisingSnapshotPick } from "../src/lib/rising-snapshot";
import { movementAgainst, PREVIOUS_CHART_MIN_AGE_DAYS } from "../src/lib/rising-movement";
import type { RiseAnalysis, RisePick } from "../src/lib/rise-predictor";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Rising Cards and the Hot 40 get Billboard-style movement (2026-09-28): each
// pick's place against LAST WEEK'S CHART, the most recent Hot 40 snapshot for
// the market at least six days old. Snapshots freeze it; the live pages
// compare today's ranking with the same chart. And a snapshot's generated
// title tells the chart story ("… remains at #1, … moves into the top 3").
// ─────────────────────────────────────────────────────────────────────────────

const AT = new Date("2026-09-28T03:00:00Z");
const pick = (id: string, name: string, over: Partial<RisingSnapshotPick> = {}): RisingSnapshotPick => ({
  id, slug: id, displayName: name, setCode: "OGN", collectorNumber: "001", imageThumbUrl: null, score: 90,
  priceCents: 1000, currency: "USD", trend7: 0, trend30: 0, posPct: 0.5, listings: 5, spark: [1, 2], confidence: "High",
  vsLastWeekPct: null, priceSignals: false, ...over,
});
function chart(names: string[], prev: string[] | null): RisingSnapshotData {
  const moves = prev ? movementFromRanks(names, new Map(prev.map((id, i) => [id, i + 1]))) : null;
  return {
    scope: "US", generatedAt: AT.toISOString(), universeSize: 300, qualifying: 0, minPointsRequired: 14, version: 2,
    picks: names.map((n) => pick(n, n, { move: moves ? moves.get(n) ?? null : null })),
    previousChart: prev ? { createdAt: "2026-09-21T03:00:00Z", count: prev.length } : null,
  };
}

test("movementFromRanks: 'new' means not on the previous chart", () => {
  const m = movementFromRanks(["a", "b", "c"], new Map([["b", 1], ["a", 5]]));
  assert.deepEqual(m.get("a"), { kind: "up", by: 4, prev: 5 });
  assert.deepEqual(m.get("b"), { kind: "down", by: 1, prev: 1 });
  assert.deepEqual(m.get("c"), { kind: "new" });
  assert.equal(movementAgainst(["a"], null), null, "no chart, no movement");
});

test("the title tells the chart story: #1 held, a card into the top 3", () => {
  const t = generateRisingTitle(chart(["Jinx", "Ahri", "Teemo", "Sett"], ["Jinx", "Sett", "Teemo", "Lux", "Vi", "Ahri"]), AT);
  assert.equal(t, "RiftCompare Hot 4: Jinx remains at #1, Ahri moves into the top 3 (US, 28 September 2026)");
});

test("each lead and each second clause", () => {
  const story = (names: string[], prev: string[]) => chartStory(chart(names, prev).picks);
  assert.equal(story(["Ahri", "Jinx"], ["Jinx", "Ahri"])?.lead, "Ahri climbs to #1 from #2");
  assert.equal(story(["Neeko", "Jinx"], ["Jinx"])?.lead, "Neeko debuts at #1");
  assert.equal(story(["Jinx", "Neeko"], ["Jinx"])?.second, "Neeko debuts at #2", "a debut inside the top 3 is the story");
  const ten = ["J", "b", "c", "d", "e", "f", "g", "h", "i", "k"];
  assert.equal(story(["J", "b", "c", "d", "k"], ten)?.second, "k climbs 5 places to #5");
  assert.equal(story(["J", "b", "c", "d", "Z"], ten)?.second, "Z is the highest new entry, at #5");
  assert.equal(story(["J", "b", "c", "e", "f", "g", "d"], ["J", "b", "c", "d", "e", "f", "g"])?.second, "d falls 3 places to #7");
  assert.equal(story(["J", "b"], ["J", "b"])?.second, null, "a quiet week says only what #1 did");
});

test("no previous chart: the older headline angles, untouched", () => {
  const t = generateRisingTitle(chart(["Jinx", "Ahri"], null), AT);
  assert.doesNotMatch(t, /remains|climbs|debuts|moves into/);
  assert.match(t, /^RiftCompare Hot 2: Jinx tops the US ranking/);
});

test("a long pair of names drops the second clause instead of overrunning", () => {
  const long = "Renata Glasc, Chem-Baroness of the Undercity Markets";
  const d = chart(["Kennen, Heart of the Tempest and Other Things", long, "c"], ["Kennen, Heart of the Tempest and Other Things", "c", "y", "z", long]);
  const t = generateRisingTitle(d, AT);
  assert.ok(t.length <= 150, `${t.length}: ${t}`);
  assert.match(t, /remains at #1 \(US, 28 September 2026\)$/);
  assert.doesNotMatch(t, /\b(will|guaranteed|profit|buy now|moon|surge|skyrocket|prediction|forecast)\b/i);
});

test("toSnapshotData freezes the movement, or null without a previous chart", () => {
  const rp = (id: string) => ({ ...pick(id, id), components: {}, basisMarket: "US", searchCount: 1, viewCount: 1, rangeWeeks: 0, volatilityPct: 0, searchPerDay: null, searchGrowthPct: null, searchGrowthDays: null, historyPoints: 0, reason: "r", overheated: false }) as unknown as RisePick;
  const analysis = { picks: [rp("a"), rp("b")], universeSize: 2, qualifying: 0, minPointsRequired: 14 } as unknown as RiseAnalysis;
  const withPrev = toSnapshotData(analysis, "US", AT, { createdAt: "2026-09-21T00:00:00.000Z", count: 2, ranks: [["b", 1], ["a", 2]] });
  assert.deepEqual(withPrev.picks.map((p) => p.move), [{ kind: "up", by: 1, prev: 2 }, { kind: "down", by: 1, prev: 1 }]);
  assert.deepEqual(withPrev.previousChart, { createdAt: "2026-09-21T00:00:00.000Z", count: 2 });
  const without = toSnapshotData(analysis, "US", AT, null);
  assert.deepEqual(without.picks.map((p) => p.move), [null, null]);
  assert.equal(without.previousChart, null);
});

test("minting never waits on the previous chart, and the live pages read it cached", () => {
  assert.equal(PREVIOUS_CHART_MIN_AGE_DAYS, 6);
  const lib = read("src/lib/rising-movement.ts");
  assert.match(lib, /isLegacySnapshot\(data\)/, "a legacy chart is never a place to move from");
  const route = read("src/app/api/admin/rising-snapshot/route.ts");
  assert.match(route, /loadPreviousChart\(scope, now\.getTime\(\)\)\.catch\(/, "a failed read mints without movement");
  assert.match(route, /toSnapshotData\(analysis, scope, now, previous, ebay\)/);
  for (const f of ["src/app/tools/rising/page.tsx", "src/app/admin/rising/page.tsx"]) {
    const src = read(f);
    assert.match(src, /Promise\.all\(\[getCachedRisingCards\(scope\), getPreviousRisingChart\(scope\)\]\)/, f);
    assert.match(src, /movementAgainst\(analysis\.picks\.map\(\(p\) => p\.id\), prevChart\)/, f);
    assert.match(src, /<MoveBadge /, f);
  }
  const snap = read("src/app/rising/[token]/page.tsx");
  assert.match(snap, /const showMove = !legacy && !!data\.previousChart;/);
  assert.match(read("src/app/tools/demand/page.tsx"), /<MoveBadge move=\{p\.move\}/);
});

// ── Cheapest on eBay on the Hot 40 (2026-09-28) ─────────────────────────────
// Owner: "for the snapshots we should also mark them with cheapest on ebay if
// they are cheapest on ebay with an affiliate link". The homepage row's rule,
// checked per pick in the market whose price the row shows, frozen at mint.

test("toSnapshotData freezes each pick's Cheapest on eBay verdict; every other pick is null", () => {
  const rp = (id: string) => ({ ...pick(id, id), components: {}, basisMarket: "US", searchCount: 1, viewCount: 1, rangeWeeks: 0, volatilityPct: 0, searchPerDay: null, searchGrowthPct: null, searchGrowthDays: null, historyPoints: 0, reason: "r", overheated: false }) as unknown as RisePick;
  const analysis = { picks: [rp("a"), rp("b")], universeSize: 2, qualifying: 0, minPointsRequired: 14 } as unknown as RiseAnalysis;
  const deal = { url: "https://www.ebay.com/itm/9", retailer: "ebay_us", market: "US" as const, cents: 850, currency: "USD", postageKnown: true, gapCents: 300 };
  const d = toSnapshotData(analysis, "US", AT, null, new Map([["b", deal]]));
  assert.deepEqual(d.picks.map((p) => p.ebay), [null, deal]);
  assert.deepEqual(toSnapshotData(analysis, "US", AT).picks.map((p) => p.ebay), [null, null], "no lookup, no marks");
});

test("the mint route checks each pick in its own basis market, through the self-cached lookup", () => {
  const route = read("src/app/api/admin/rising-snapshot/route.ts");
  assert.match(route, /byMarket\.set\(p\.basisMarket,/, "GLOBAL picks are checked where their shown price comes from");
  assert.match(route, /await getCheapestOnEbayFor\(market, ids\)/);
  assert.match(route, /currency: currencyOf\(market\)/);
  assert.doesNotMatch(route, /unstable_cache|cachedOrDirect/, "never wrapped (db.ts rule 6)");
  assert.match(route, /cheapestOnEbay: ebay\.size/);
});

test("the snapshot page links the listing through EPN, measured, with Paid link beside it and the disclosure above", async () => {
  const { affiliateUrl } = await import("../src/lib/affiliate");
  const u = new URL(affiliateUrl("https://www.ebay.com/itm/9", "ebay_us_cheapest", "/rising"));
  assert.equal(u.searchParams.get("campid"), "5339155912");
  assert.equal(u.searchParams.get("mkevt"), "1");
  assert.equal(u.searchParams.get("customid"), "rc-us-ebay_us_cheapest-rising-product", "its own sub-id, apart from the homepage row's");

  const page = read("src/app/rising/[token]/page.tsx");
  assert.match(page, /href=\{affiliateUrl\(e\.url, `\$\{e\.retailer\}_cheapest`, "\/rising"\)\}/);
  assert.match(page, /<OutboundLink[\s\S]*?surface="hot40_ebay"/, "a measured buy click");
  assert.match(page, /<PaidLinkTag \/>/, "Paid link beside every one");
  assert.match(page, /\{ebayCount > 0 && \([\s\S]*?<AffiliateDisclosure partner="ebay" tight \/>[\s\S]*?<table/, "the disclosure renders above the table, and only when a pick is marked");
  assert.match(page, /The listing may have sold since\./, "frozen, and says so");
  assert.match(read("src/components/OutboundLink.tsx"), /\| "hot40_ebay"/);
});
