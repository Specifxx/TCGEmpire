import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { movementFromRanks } from "../src/lib/demand-movement";
import { chartStory, generateRisingTitle, toSnapshotData, type RisingSnapshotData, type RisingSnapshotPick } from "../src/lib/rising-snapshot";
import { movementAgainst, weekAgoLabel } from "../src/lib/rising-movement";
import { assembleRisingCards, weekAgoRanks, WEEK_AGO_DAYS, type RiseAnalysis, type RiseInputs, type RisePick } from "../src/lib/rise-predictor";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Rising Cards and the Hot 40 get Billboard-style movement (2026-09-28): each
// pick's place against THE SAME RANKING 7 DAYS AGO, rebuilt from that day's
// demand snapshots and price history (owner: "literally just use the data
// from a week ago, it doesn't need to be dependant on the snapshot"). Snapshots
// freeze it; the live pages compute it. And a snapshot's generated title tells
// the chart story ("… remains at #1, … moves into the top 3").
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
    weekAgo: prev ? { asOf: "2026-09-21" } : null,
  };
}

test("movementFromRanks: 'new' means not ranked then", () => {
  const m = movementFromRanks(["a", "b", "c"], new Map([["b", 1], ["a", 5]]));
  assert.deepEqual(m.get("a"), { kind: "up", by: 4, prev: 5 });
  assert.deepEqual(m.get("b"), { kind: "down", by: 1, prev: 1 });
  assert.deepEqual(m.get("c"), { kind: "new" });
  assert.equal(movementAgainst(["a"], null), null, "nothing to compare with, no movement");
  assert.deepEqual(movementAgainst(["a", "b"], { asOf: "2026-09-21", ranks: [["a", 2], ["b", 1]] })?.get("a"), { kind: "up", by: 1, prev: 2 });
  assert.equal(weekAgoLabel({ asOf: "2026-09-21" }), "21 September");
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

test("no movement: the older headline angles, untouched", () => {
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

test("toSnapshotData freezes the movement against the week-ago ranking, or null without one", () => {
  const rp = (id: string) => ({ ...pick(id, id), components: {}, basisMarket: "US", searchCount: 1, viewCount: 1, rangeWeeks: 0, volatilityPct: 0, searchPerDay: null, searchGrowthPct: null, searchGrowthDays: null, historyPoints: 0, reason: "r", overheated: false }) as unknown as RisePick;
  const analysis = { picks: [rp("a"), rp("b")], universeSize: 2, qualifying: 0, minPointsRequired: 14 } as unknown as RiseAnalysis;
  const withPrev = toSnapshotData(analysis, "US", AT, { asOf: "2026-09-21", ranks: [["b", 1], ["a", 2]] });
  assert.deepEqual(withPrev.picks.map((p) => p.move), [{ kind: "up", by: 1, prev: 2 }, { kind: "down", by: 1, prev: 1 }]);
  assert.deepEqual(withPrev.weekAgo, { asOf: "2026-09-21" });
  assert.equal(withPrev.previousChart, undefined, "no longer written");
  const without = toSnapshotData(analysis, "US", AT, null);
  assert.deepEqual(without.picks.map((p) => p.move), [null, null]);
  assert.equal(without.weekAgo, null);
});

// ── The week-ago ranking itself ─────────────────────────────────────────────
const DAY = 86400_000;
type Card = RiseInputs["universe"][number];
const card = (id: string, searchCount: number, over: Partial<Card> = {}): Card => ({
  id, slug: id, name: `Card ${id}`, setCode: "OGN", collectorNumber: "001", variant: null, isPromo: false,
  rarity: "Rare", imageThumbUrl: null, searchCount, viewCount: 1,
  lowestPriceCents: null, lowestPriceCentsUs: 500, lowestPriceCentsUk: null,
  lowestPriceCentsSg: null, lowestPriceCentsCa: null, lowestPriceCentsEu: null,
  ...over,
});

test("weekAgoRanks re-ranks on that day's demand, drops cards not searched by then, and ranks the whole field", () => {
  const now = Date.parse("2026-09-28T03:00:00Z");
  const today: RiseInputs = {
    universe: [card("rocket", 5000), card("steady", 900), card("fresh", 800), ...Array.from({ length: 50 }, (_, i) => card(`f${i}`, 100 + i))],
    supply: {}, velocity: {}, snapshotDays: 40,
  };
  const past = {
    asOf: "2026-09-21",
    cards: {
      rocket: { searchCount: 20, viewCount: 1, velocity: null }, // barely searched a week ago
      steady: { searchCount: 880, viewCount: 1, velocity: null },
      // "fresh" had no snapshot: not searched by then
      ...Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}`, { searchCount: 90 + i, viewCount: 1, velocity: null }])),
    },
  };
  const r = weekAgoRanks("US", today, { series: {} }, past, now);
  assert.ok(r);
  assert.equal(r.asOf, "2026-09-21");
  const rank = new Map(r.ranks);
  assert.equal(rank.get("steady"), 1, "the most-searched card a week ago led then");
  assert.equal(rank.has("fresh"), false, "no searches by then: not ranked, so NEW today");
  assert.equal(r.ranks.length, 52, "every card with demand then is ranked, not just 40");
  assert.ok(rank.get("rocket")! > 40, "rocket ranked outside the top 40 a week ago");
  const m = movementAgainst(["rocket", "steady", "fresh"], r)!;
  assert.equal(m.get("rocket")?.kind, "up");
  assert.deepEqual(m.get("steady"), { kind: "down", by: 1, prev: 1 });
  assert.deepEqual(m.get("fresh"), { kind: "new" });
  assert.equal(weekAgoRanks("US", today, { series: {} }, { asOf: "2026-09-21", cards: {} }, now), null, "no demand then, no ranking");
});

test("weekAgoRanks reads prices only up to that day, never today's live price", () => {
  const now = Date.parse("2026-09-28T03:00:00Z");
  const eday = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
  const weeks = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"];
  const upto = (vals: number[]) => weeks.map((d, i) => [eday(d), vals[i]] as [number, number]);
  // Three cards with equal demand; "spiker" jumps 5× AFTER the 21st.
  const before = {
    spiker: upto([1000, 1010, 990, 1000, 1005, 995, 1000, 1000]),
    dipper: upto([1000, 980, 1000, 990, 1000, 900, 800, 700]),
    riser: upto([700, 720, 750, 780, 800, 850, 900, 950]),
  };
  const after = { ...before, spiker: [...before.spiker, [eday("2026-09-28"), 5000] as [number, number]] };
  const universe = (live: boolean) => ["spiker", "dipper", "riser"].map((id) => card(id, 100, { lowestPriceCentsUs: live ? (id === "spiker" ? 5000 : 900) : null }));
  const past = { asOf: "2026-09-21", cards: Object.fromEntries(["spiker", "dipper", "riser"].map((id) => [id, { searchCount: 100, viewCount: 1, velocity: null }])) };
  const inputs = (live: boolean): RiseInputs => ({ universe: universe(live), supply: {}, velocity: {}, snapshotDays: 40 });

  const withLater = weekAgoRanks("US", inputs(true), { series: after }, past, now)!;
  const without = weekAgoRanks("US", inputs(false), { series: before }, past, now)!;
  assert.deepEqual(withLater, without, "a later price point and today's live price change nothing a week back");

  const today = assembleRisingCards("US", inputs(true), { series: after }, now).picks.map((p) => p.id);
  assert.notDeepEqual(today, withLater.ranks.map(([id]) => id), "while today's ranking does move on them");
  assert.equal(WEEK_AGO_DAYS, 7);
});

test("minting and the live pages use the rebuilt week-ago ranking, never a snapshot", () => {
  const lib = read("src/lib/rise-predictor.ts");
  assert.match(lib, /export async function getRisingWeekAgo\(scope: RiseScope\)/);
  assert.match(lib, /Promise\.all\(\[getRiseHistory\(\), getRiseInputs\(scope\), getDemandWeekAgo\(\)\]\)/, "its inputs are the cached loaders");
  assert.match(lib, /\["rc-rise-demand-week-ago-v1", sydneyDayKey\(\)\]/, "one demand read per day for every market");
  assert.doesNotMatch(read("src/lib/rising-movement.ts"), /risingSnapshot|prisma/, "movement reads no snapshot");
  const demand = read("src/lib/demand-snapshot.ts");
  assert.match(demand, /GROUP BY "cardId"/, "aggregated in the database: one row per card");
  assert.match(demand, /const v = velocityBetween\(pts\[0\], pts\[pts\.length - 1\], pts\.length\);/, "today's velocity uses the same arithmetic");
  const route = read("src/app/api/admin/rising-snapshot/route.ts");
  assert.match(route, /Promise\.all\(\[getRisingWeekAgo\(scope\), cheapestOnEbayByPick\(analysis\.picks\)\]\)/);
  assert.match(route, /toSnapshotData\(analysis, scope, now, weekAgo, ebay\)/);
  for (const f of ["src/app/tools/rising/page.tsx", "src/app/admin/rising/page.tsx"]) {
    const src = read(f);
    assert.match(src, /Promise\.all\(\[getCachedRisingCards\(scope\), getRisingWeekAgo\(scope\)\]\)/, f);
    assert.match(src, /movementAgainst\(analysis\.picks\.map\(\(p\) => p\.id\), weekAgo\)/, f);
    assert.match(src, /<MoveBadge /, f);
    assert.match(src, /newTitle="Not ranked 7 days ago"/, f);
  }
  const snap = read("src/app/rising/[token]/page.tsx");
  assert.match(snap, /const showMove = !legacy && \(!!data\.weekAgo \|\| !!data\.previousChart\);/, "the morning's snapshots keep the chart they froze");
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

// ── Deleting a snapshot (2026-09-28) ─────────────────────────────────────────
// Owner: "have an option to delete snapshots too".

test("DELETE is admin-gated like mint and list, deletes one snapshot by id, and 404s a missing one", () => {
  const route = read("src/app/api/admin/rising-snapshot/route.ts");
  const del = route.slice(route.indexOf("export async function DELETE"));
  assert.match(del, /if \(!authed\(user, body\?\.key\)\) return NextResponse\.json\(\{ error: "Admin only" \}, \{ status: 403 \}\);/);
  assert.match(del, /prisma\.risingSnapshot\.deleteMany\(\{ where: \{ id: parsed\.data\.id \} \}\)/, "exactly one row, by id");
  assert.match(del, /count === 0\) return NextResponse\.json\(\{ error: "No such snapshot" \}, \{ status: 404 \}\)/);
  assert.match(route, /const deleteSchema = z\.object\(\{ id: z\.string\(\)\.min\(1\)/, "an id is required: never a bulk delete");
});

test("the panel confirms before deleting, names the snapshot, and drops it from the list", () => {
  const panel = read("src/components/admin/RisingSnapshotPanel.tsx");
  assert.match(panel, /window\.confirm\(\s*`Delete this snapshot\?\\n\\n\$\{s\.title\}/, "names what is being deleted");
  assert.match(panel, /This can't be undone\./);
  assert.match(panel, /method: "DELETE",[\s\S]{0,160}body: JSON\.stringify\(\{ id: s\.id, key: adminKey \}\)/);
  assert.match(panel, /setList\(\(cur\) => \(cur \?\? \[\]\)\.filter\(\(x\) => x\.id !== s\.id\)\)/);
  assert.match(panel, /onClick=\{\(\) => remove\(s\)\}/);
});
