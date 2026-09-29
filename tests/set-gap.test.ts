import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NOT_STOCKED_LIST_CAP,
  SET_GAP_CHUNK,
  SET_GAP_MAX_OFFSET,
  nextChunkLabel,
  normalizeOffset,
  planSetGap,
  preReleaseGapMessage,
  revealedWithoutListing,
  setGapFields,
  setGapNote,
} from "../src/lib/set-gap";
import { loadSetGapLines, type SetGapDeps } from "../src/lib/basket-server";
import { parseBasketRequest } from "../src/lib/basket-request";
import { TIER_COMPARISON } from "../src/components/TierComparisonTable";
import { DECK_LINE_CAP } from "../src/lib/deck";
import { RETAILERS } from "../src/lib/retailers";
import type { ChecklistCard } from "../src/lib/set-scope";

// ─────────────────────────────────────────────────────────────────────────────
// FINISH THIS SET (2026-09-29, DECISIONS.md, "Finish this set"): Best Basket's
// fourth source, the cards a member is MISSING from one set, planned in chunks
// no bigger than the tool's 200-line cap.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let n = 0;
function card(extra: Partial<ChecklistCard> = {}): ChecklistCard {
  n++;
  const num = String(n).padStart(3, "0");
  return {
    id: `c${num}`, slug: `card-${num}`, name: `Card ${num}`, collectorNumber: `${num}/9999`, rarity: "Common",
    variant: null, isPromo: false, isOvernumbered: false, setCode: "OGN",
    minCents: 100 + n, stores: 2, otherSource: false, ...extra,
  };
}
/** A card with an in-stock real-store listing at this price. */
const priced = (minCents: number, extra: Partial<ChecklistCard> = {}) => card({ minCents, ...extra });
const ebayOnly = (extra: Partial<ChecklistCard> = {}) => card({ minCents: null, stores: 0, otherSource: true, ...extra });
const nothing = (extra: Partial<ChecklistCard> = {}) => card({ minCents: null, stores: 0, otherSource: false, ...extra });

test("the gap is the set in scope minus what the account owns: any finish or condition, promos and tokens never", () => {
  const a = priced(300);
  const b = priced(200);
  const c = priced(500);
  const altArt = priced(900, { variant: "a", collectorNumber: "010a/298" });
  const promo = priced(50, { isPromo: true });
  const token = priced(50, { collectorNumber: "t03/000" });
  const cards = [a, b, c, altArt, promo, token];
  const base = planSetGap("OGN", cards, { [b.id]: 2 }, { scope: "base" });
  assert.deepEqual(base.chunk.map((x) => x.id), [a.id, c.id], "the base set minus the owned card, cheapest first");
  assert.equal(base.summary.ownedInScope, 1);
  assert.equal(base.summary.gapTotal, 2);
  const all = planSetGap("OGN", cards, { [b.id]: 1 }, { scope: "all" });
  assert.deepEqual(all.chunk.map((x) => x.id), [a.id, c.id, altArt.id], "every printing adds the alt-art, still never the promo or the token");
});

test("a rarity filter narrows both what is owned and what is missing", () => {
  const cards = [priced(100, { rarity: "Rare" }), priced(200, { rarity: "Rare" }), priced(50, { rarity: "Common" })];
  const p = planSetGap("OGN", cards, { [cards[0].id]: 1 }, { scope: "base", rarity: "Rare" });
  assert.deepEqual(p.chunk.map((x) => x.id), [cards[1].id]);
  assert.equal(p.summary.ownedInScope, 1);
  assert.equal(p.summary.gapTotal, 1);
});

test("a card no real store has is reported as not stocked, never dropped and never priced", () => {
  const stocked = priced(300);
  const e = ebayOnly();
  const z = nothing();
  const p = planSetGap("OGN", [stocked, e, z], {}, { scope: "base" });
  assert.deepEqual(p.chunk.map((x) => x.id), [stocked.id]);
  assert.deepEqual(p.notStocked.map((x) => x.id).sort(), [e.id, z.id].sort(), "eBay-only and nothing-anywhere are both listed apart");
  assert.equal(p.summary.notStockedCount, 2);
  assert.equal(p.summary.gapTotal, 3, "every missing card is in the count");
  assert.equal(p.summary.stocked + p.summary.notStockedCount, p.summary.gapTotal);
  // An owned unstocked card is not missing, so it is not reported.
  assert.equal(planSetGap("OGN", [stocked, e], { [e.id]: 1 }, { scope: "base" }).summary.notStockedCount, 0);
});

test("a gap over 200 is a ranked chunk: 200 cheapest, the rest counted, a step to the next, nothing lost or repeated", () => {
  assert.equal(SET_GAP_CHUNK, DECK_LINE_CAP, "the chunk is Best Basket's own line cap");
  const cards = Array.from({ length: 450 }, (_, i) => priced(100 + ((i * 7) % 90)));
  const first = planSetGap("OGN", cards, {}, { scope: "base" });
  assert.equal(first.chunk.length, 200);
  assert.equal(first.summary.moreAfter, 250);
  assert.equal(first.summary.nextOffset, 200);
  assert.equal(setGapNote(first.summary), "Your 200 cheapest missing cards. 250 more not included.");
  assert.equal(nextChunkLabel(first.summary), "Plan the next 200");

  const second = planSetGap("OGN", cards, {}, { scope: "base", offset: 200 });
  assert.equal(second.chunk.length, 200);
  assert.equal(second.summary.moreAfter, 50);
  assert.equal(setGapNote(second.summary), "Missing cards 201 to 400, cheapest first. 50 more not included.");

  const third = planSetGap("OGN", cards, {}, { scope: "base", offset: 400 });
  assert.equal(third.chunk.length, 50);
  assert.equal(third.summary.moreAfter, 0);
  assert.equal(third.summary.nextOffset, null);
  assert.equal(setGapNote(third.summary), "Missing cards 401 to 450, cheapest first. That is all of the rest.");

  const ids = [...first.chunk, ...second.chunk, ...third.chunk].map((c) => c.id);
  assert.equal(new Set(ids).size, 450, "no card twice, none missing");
  const prices = [...first.chunk, ...second.chunk, ...third.chunk].map((c) => c.minCents ?? 0);
  assert.deepEqual(prices, [...prices].sort((x, y) => x - y), "dearer cards only ever come later");
});

test("a gap that fits in one plan carries no chunk note", () => {
  const p = planSetGap("OGN", [priced(100), priced(200)], {}, { scope: "base" });
  assert.equal(setGapNote(p.summary), null);
  assert.equal(p.summary.nextOffset, null);
  assert.equal(planSetGap("OGN", Array.from({ length: 200 }, () => priced(100)), {}, { scope: "base" }).summary.moreAfter, 0, "exactly 200 fits");
  assert.equal(planSetGap("OGN", Array.from({ length: 201 }, () => priced(100)), {}, { scope: "base" }).summary.moreAfter, 1, "201 is a chunk and one more");
});

test("the ranking is stable: equal prices break by collector number, whatever order the catalogue arrives in", () => {
  const cards = Array.from({ length: 260 }, () => priced(250));
  const shuffled = [...cards].sort((a, b) => (a.id < b.id ? 1 : -1));
  const one = planSetGap("OGN", cards, {}, { scope: "base" });
  const two = planSetGap("OGN", shuffled, {}, { scope: "base" });
  assert.deepEqual(one.chunk.map((c) => c.id), two.chunk.map((c) => c.id));
  const nums = one.chunk.map((c) => parseInt(c.collectorNumber, 10));
  assert.deepEqual(nums, [...nums].sort((x, y) => x - y), "ties fall in card-number order");
});

test("a per-card ceiling leaves out the dearer cards, and says how many", () => {
  const cards = [priced(100), priced(400), priced(900), ebayOnly()];
  const p = planSetGap("OGN", cards, {}, { scope: "base", maxPriceCents: 500 });
  assert.deepEqual(p.chunk.map((c) => c.minCents), [100, 400]);
  assert.equal(p.summary.overCeiling, 1);
  assert.equal(p.summary.stocked, 3);
  assert.equal(p.summary.candidates, 2);
  assert.equal(p.summary.maxPriceCents, 500);
  assert.equal(p.summary.notStockedCount, 1, "an unpriced card is unaffected by a price ceiling");
  assert.equal(planSetGap("OGN", cards, {}, { scope: "base", maxPriceCents: null }).summary.overCeiling, 0);
});

test("an offset is a whole number of chunks and never past the catalogue", () => {
  assert.equal(normalizeOffset(undefined), 0);
  assert.equal(normalizeOffset("200"), 0, "a string is not a number");
  assert.equal(normalizeOffset(-5), 0);
  assert.equal(normalizeOffset(NaN), 0);
  assert.equal(normalizeOffset(199), 0);
  assert.equal(normalizeOffset(200), 200);
  assert.equal(normalizeOffset(399), 200);
  assert.equal(normalizeOffset(1e9), SET_GAP_MAX_OFFSET);
  // A plan asked to start past its ranked cards is empty, with the counts intact.
  const p = planSetGap("OGN", [priced(100), priced(200)], {}, { scope: "base", offset: 200 });
  assert.equal(p.chunk.length, 0);
  assert.equal(p.summary.moreAfter, 0);
  assert.equal(setGapNote(p.summary), null);
});

test("the request: skip-owned is locked ON for a set, and the set inputs are read for that source only", () => {
  const r = parseBasketRequest({ source: "set", skipOwned: false, set: "ogn", scope: "all", rarity: "Rare", maxPriceCents: 1250.7, offset: 400 });
  assert.equal(r.source, "set");
  assert.equal(r.skipOwned, true, "a set prices only what is missing: not switchable off");
  assert.equal(r.setCode, "OGN");
  assert.equal(r.scope, "all");
  assert.equal(r.rarity, "Rare");
  assert.equal(r.maxPriceCents, 1250);
  assert.equal(r.offset, 400);
  // Junk is dropped, not trusted.
  const j = parseBasketRequest({ source: "set", set: "not a set!", scope: "weird", rarity: "Mythic", maxPriceCents: -3, offset: "x" });
  assert.deepEqual([j.setCode, j.scope, j.rarity, j.maxPriceCents, j.offset], ["", "base", null, null, 0]);
  // Every other source ignores them: the binder, the deck and the watchlist are unchanged.
  for (const source of ["deck", "watchlist", "binder"] as const) {
    const o = parseBasketRequest({ source, set: "OGN", rarity: "Rare", maxPriceCents: 500, offset: 200, skipOwned: true });
    assert.deepEqual([o.setCode, o.rarity, o.maxPriceCents, o.offset], ["", null, null, 0], source);
  }
  assert.equal(parseBasketRequest({ source: "binder", skipOwned: true }).skipOwned, false, "the binder source is unchanged");
  assert.equal(parseBasketRequest({ source: "watchlist", skipOwned: true }).skipOwned, true);
  assert.equal(parseBasketRequest({ source: "deck" }).skipOwned, false);
});

// ── loadSetGapLines: the database half, against stubs ────────────────────────

function deps(cards: ChecklistCard[], owned: Record<string, number> = {}) {
  const calls = { checklist: [] as unknown[][], owned: [] as unknown[][] };
  const d: SetGapDeps = {
    checklist: async (...a) => (calls.checklist.push(a), cards),
    owned: async (...a) => (calls.owned.push(a), owned),
  };
  return { d, calls };
}

test("loadSetGapLines reads the cached catalogue once and the caller's own owned map once, scoped to that set", async () => {
  const a = priced(100);
  const b = priced(200);
  const { d, calls } = deps([a, b], { [a.id]: 1 });
  const res = await loadSetGapLines("user-1", "OGN", "base", "US", {}, d);
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.deepEqual(res.plan.chunk.map((c) => c.id), [b.id]);
  assert.deepEqual(calls.checklist, [["OGN", "US"]]);
  assert.deepEqual(calls.owned, [["user-1", "OGN"]], "one user-scoped read for THIS set");
});

test("an unknown set is refused before any read", async () => {
  const { d, calls } = deps([]);
  const res = await loadSetGapLines("u", "ZZZ", "base", "US", {}, d);
  assert.equal(res.ok, false);
  assert.equal(calls.checklist.length + calls.owned.length, 0);
});

test("Radiance is refused until it releases, with how many revealed cards have no listing yet and no denominator", async () => {
  const revealed = [priced(100), ebayOnly(), nothing(), priced(300, { isPromo: true })];
  const { d, calls } = deps(revealed);
  const res = await loadSetGapLines("u", "RAD", "base", "US", {}, d);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.reason, "preorder");
  assert.equal(res.message, preReleaseGapMessage("Radiance", 2));
  assert.match(res.message, /2 revealed cards have no store listing yet/);
  assert.doesNotMatch(res.message, /\b\d+\s*(of|\/)\s*\d+\b|%/, "no fraction and no percentage");
  assert.equal(calls.owned.length, 0, "no owned read for a set that is not out");
  assert.equal(revealedWithoutListing(revealed), 2, "a promo is not a revealed card of the set");
});

test("ownership comes from the tracker's reader, not loadOwnedQty's 400-row read", () => {
  const src = code("src/lib/basket-server.ts");
  const fn = src.slice(src.indexOf("export async function loadSetGapLines"));
  assert.doesNotMatch(fn, /loadOwnedQty/, "a full set would be truncated at 400 rows and call an owned card missing");
  assert.match(src, /owned: \(userId, setCode\) => ownedBySet\(prisma, userId, setCode\)/);
  assert.match(fn, /deps\.checklist\(/, "the set checklist loader is called directly");
  assert.doesNotMatch(src, /unstable_cache/, "and never wrapped in another cache");
});

// ── The answer, by tier ──────────────────────────────────────────────────────

test("a non-Premium answer carries counts only: no store name, line, url or card name", () => {
  const cards = [priced(100, { name: "Jinx, Loose Cannon" }), ebayOnly({ name: "Vayne, Hunter" })];
  const p = planSetGap("OGN", cards, {}, { scope: "base" });
  const answer = { summary: p.summary, setName: "Origins", notStocked: p.notStocked.map((c) => ({ name: c.name, setCode: c.setCode, collectorNumber: c.collectorNumber })) };
  const free = setGapFields(false, answer);
  assert.deepEqual(Object.keys(free), ["setGap"]);
  const json = JSON.stringify(free);
  for (const r of Object.values(RETAILERS)) {
    const name = (r as { name?: string }).name;
    if (name) assert.ok(!json.includes(name), `the free payload names a store: ${name}`);
  }
  assert.doesNotMatch(json, /https?:|url|Vayne|Jinx/i, "no link and no card names");
  const full = setGapFields(true, answer) as Record<string, unknown>;
  assert.deepEqual(Object.keys(full).sort(), ["notStocked", "setGap", "setName"]);
  assert.match(JSON.stringify(full.notStocked), /Vayne/, "Premium names the cards no store has");
  assert.ok(NOT_STOCKED_LIST_CAP >= 1);
});

test("the route: the free branch answers the preview plus the set counts, and a set is never priced as a plain list", () => {
  const route = code("src/app/api/basket/route.ts");
  // Free: exactly the preview, the shipping context and the tier-safe set fields.
  assert.match(route, /\{ \.\.\.preview, shipping, \.\.\.\(setGap \? setGapFields\(false, setGap\) : \{\}\) \}/);
  assert.match(route, /\.\.\.\(setGap \? setGapFields\(true, setGap\) : \{\}\)/);
  const freeBranch = route.slice(route.indexOf("if (!full) {\n      const preview"), route.indexOf("const { plan, alternatives } = planBasket"));
  assert.doesNotMatch(freeBranch, /notStocked|setName/, "the free branch never touches the named list");
  // The set source, in order: the gap is read, the listing read is the same
  // loadStoreListings for at most a chunk of ids, and the generic skip-owned step does not run.
  assert.match(route, /source === "set"[\s\S]*loadSetGapLines\(userId, setCode, scope, country, \{ rarity, maxPriceCents, offset \}\)/);
  assert.match(route, /if \(skipOwned && source !== "set" && wanted\.size\)/);
  assert.match(route, /loadStoreListings\(\[\.\.\.wanted\.keys\(\)\], country, Object\.keys\(stores\), prisma, minCondition\)/);
  // A refused run (Radiance, unknown set, nothing to price) hands the free slot back: it is a 400 via fail().
  assert.match(route, /if \(!gap\.ok\) return fail\(gap\.message, 400\)/);
  // The set's chunk is what is priced: wanted holds one copy of each chunk card, so it can never exceed the line cap.
  assert.match(route, /for \(const c of plan\.chunk\) \{\s*wanted\.set\(c\.id, 1\)/);
});

test("the binder source is unchanged: replacement, quantities as held, skip-owned ignored", () => {
  const route = code("src/app/api/basket/route.ts");
  const binder = route.slice(route.indexOf('} else if (source === "binder") {'), route.indexOf("skippedHoldings = binder.skipped"));
  assert.match(binder, /loadBinderHoldings\(userId, country\)/);
  assert.match(binder, /wanted\.set\(h\.cardId, h\.qty\)/);
  assert.doesNotMatch(binder, /loadSetGapLines|planSetGap/);
  assert.equal(parseBasketRequest({ source: "binder", skipOwned: true }).skipOwned, false);
});

test("the stale 'no notion of missing cards' comment is gone", () => {
  for (const f of ["src/lib/basket-server.ts", "src/app/api/basket/route.ts"]) {
    assert.doesNotMatch(read(f), /no notion of (?:"missing"|missing) cards/i, f);
  }
  assert.match(read("src/lib/basket-server.ts"), /never asks what the binder LACKS/);
});

// ── The table, the button and the copy ───────────────────────────────────────

test("the tier table row: totals below Premium, the store-by-store plan for Premium, the 200 from the constant", () => {
  const row = TIER_COMPARISON.find((r) => r.feature.startsWith("Finish this set"));
  assert.ok(row, "the row exists");
  assert.equal(row!.account, "Total and saving preview");
  assert.equal(row!.plus, row!.account, "Plus sees what a free account sees");
  assert.equal(row!.premium, `Store-by-store plan, up to ${SET_GAP_CHUNK} cards`);
  assert.doesNotMatch(code("src/components/TierComparisonTable.tsx"), /up to 200 cards/, "the chunk is the constant, not typed");
  assert.match(read("src/components/PremiumSlideIn.tsx"), /\{ label: "Finish this set" \}/);
});

test("'Plan the purchase' sits under the missing list, hands over set, scope and rarity, and is off for Radiance", () => {
  const ui = read("src/components/SetTracker.tsx");
  assert.match(ui, /Plan the purchase/);
  assert.match(ui, /source: "set", set: setSlug, scope: scope \?\? "base"/);
  assert.match(ui, /show === "missing" && missingNow\.length > 0/);
  // The pre-release branch renders the disabled form with the count of revealed cards without a listing.
  const pre = ui.slice(ui.indexOf("if (preRelease)"), ui.indexOf("const scopeInfo"));
  assert.match(pre, /disabledReason=\{preReleasePlanLine\(setName, releasedLabel, revealedWithoutListing\(cards\)\)\}/);
  assert.match(ui, /<button type="button" disabled/);
});

test("Best Basket's page starts the set source only for a known, released set; the tab and its copy are honest", () => {
  const page = read("src/app/tools/best-basket/page.tsx");
  assert.match(page, /searchParams\.source === "set" && startSet && !isPreorderSetCode\(startSet\.code\)/);
  const ui = read("src/components/BestBasket.tsx");
  assert.match(ui, /\{ key: "set", label: "Finish a set" \}/);
  assert.match(ui, /Non-foil listings/);
  assert.match(ui, /disabled=\{!x\.released\}/, "an unreleased set is a disabled option");
  assert.match(ui, /disabled=\{tab === "binder" \|\| tab === "set"\}/, "skip-owned is locked on for a set");
  assert.match(ui, /nextChunkLabel\(gap\)/);
  // No flipper, investing, prediction, urgency or worth language, and no P&L, in the new copy.
  const copy = [read("src/lib/set-gap.ts"), ui.slice(ui.indexOf("function SetSourcePanel"), ui.indexOf("function plural"))].join("\n");
  assert.doesNotMatch(copy, /\b(flip|flipper|invest|investing|profit|worth|predict|before it (sells|goes)|hurry|don't miss|last chance|limited time)\b/i);
});

test("nothing new is cached and no route is prewarmed", () => {
  for (const f of ["src/lib/set-gap.ts", "src/lib/basket-server.ts", "src/app/api/basket/route.ts"]) {
    assert.doesNotMatch(code(f), /unstable_cache|generateStaticParams|export const revalidate/, f);
  }
});
