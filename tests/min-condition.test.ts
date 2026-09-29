import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_MIN_CONDITION,
  initialMinCondition,
  meetsMinCondition,
  parseBasketPrefs,
  parseMinCondition,
  playedCopiesNote,
  playedCopyCount,
  storedMinCondition,
  toStoredMinCondition,
} from "../src/lib/basket-condition";
import { loadBasketPrefs, loadStoreListings, saveMinConditionPref, type StoreListingsDb } from "../src/lib/basket-server";
import { parseBasketRequest } from "../src/lib/basket-request";
import { basketPreview, optimizeBasket, type BasketCard } from "../src/lib/basket";
import { basketStoresFor, postageOptionsFrom } from "../src/lib/shipping";
import { createDeckWatch, priceDeckList, updateDeckWatch, type DeckWatchRouteDb } from "../src/lib/deck-watch";
import { buildDeckWatchEmail } from "../src/lib/watch-emails";
import { NOW, deckHarness, deckRow, premium, plus } from "./helpers/watch-harness";

// ─────────────────────────────────────────────────────────────────────────────
// MINIMUM CONDITION (2026-09-29, lib/basket-condition.ts). Best Basket, Buy this
// list and the deck price watch price only listings at or above the member's
// floor, filtered INSIDE loadStoreListings before the per-(card, store)
// reduction. null / "any" is what every existing caller and watch means.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

type Row = { cardId: string; retailer: string; priceCents: number; url: string; condition: string | null };
const row = (cardId: string, retailer: string, priceCents: number, condition: string | null): Row => ({ cardId, retailer, priceCents, url: `https://x/${cardId}`, condition });
function listingsDb(rows: Row[]): { db: StoreListingsDb; queries: unknown[] } {
  const queries: unknown[] = [];
  return {
    queries,
    db: {
      retailerPrice: {
        findMany: (async (args: unknown) => {
          queries.push(args);
          return rows;
        }) as unknown as StoreListingsDb["retailerPrice"]["findMany"],
      },
    },
  };
}
const STORES = ["mythicstore", "cherry"];

test("grades: NM/Mint and an unstated condition are Near Mint; LP passes 'LP or better' but not 'NM only'; MP and worse pass neither", () => {
  for (const c of ["Near Mint", "NM", "Mint", null, undefined, "", "Default Title"]) {
    assert.equal(meetsMinCondition(c, "nm"), true, `${c} reads as NM`);
    assert.equal(meetsMinCondition(c, "lp"), true);
  }
  assert.equal(meetsMinCondition("Lightly Played", "nm"), false);
  assert.equal(meetsMinCondition("LP", "lp"), true, "the LP boundary is inside 'LP or better'");
  assert.equal(meetsMinCondition("Slightly Played", "nm"), false);
  assert.equal(meetsMinCondition("Moderately Played", "lp"), false, "the MP boundary is outside it");
  assert.equal(meetsMinCondition("MP", "lp"), false);
  assert.equal(meetsMinCondition("Heavily Played", "lp"), false);
  assert.equal(meetsMinCondition("Damaged", "lp"), false);
  for (const c of ["Damaged", "Heavily Played", "Moderately Played", "Lightly Played", "Near Mint", null]) assert.equal(meetsMinCondition(c, "any"), true, `${c}: no floor`);
});

test("a cheaper Heavily Played row never displaces a store's dearer Near Mint row: the filter runs BEFORE the per-store reduction", async () => {
  const { db } = listingsDb([
    row("alpha", "mythicstore", 500, "Heavily Played"),
    row("alpha", "mythicstore", 1000, "Near Mint"),
    row("alpha", "cherry", 700, "Lightly Played"),
  ]);
  const at = async (floor: "any" | "lp" | "nm") => (await loadStoreListings(["alpha"], "US", STORES, db, floor)).get("alpha") ?? [];
  const any = await at("any");
  assert.deepEqual(any.map((l) => [l.retailer, l.priceCents]).sort(), [["cherry", 700], ["mythicstore", 500]], "no floor: the cheapest row per store, as before");
  const lp = await at("lp");
  assert.deepEqual(lp.map((l) => [l.retailer, l.priceCents, l.condition]).sort(), [["cherry", 700, "Lightly Played"], ["mythicstore", 1000, "Near Mint"]], "the store stays, on its NM row");
  const nm = await at("nm");
  assert.deepEqual(nm.map((l) => [l.retailer, l.priceCents]), [["mythicstore", 1000]], "cherry has only LP, so it leaves at NM only");
  // The default is the old behaviour.
  const dflt = (await loadStoreListings(["alpha"], "US", STORES, db)).get("alpha") ?? [];
  assert.deepEqual(dflt, any);
});

test("a card with nothing at the floor is not covered: no listing, never a played copy in its place", async () => {
  const { db } = listingsDb([row("beta", "mythicstore", 300, "Heavily Played"), row("beta", "cherry", 400, "Moderately Played")]);
  const map = await loadStoreListings(["beta"], "US", STORES, db, "lp");
  assert.equal(map.has("beta"), false);
  const stores = basketStoresFor("US", postageOptionsFrom("US", null, null));
  const card: BasketCard = { cardId: "beta", name: "Beta", slug: "beta", qty: 2, listings: map.get("beta") ?? [] };
  const plan = optimizeBasket([card], stores);
  assert.equal(plan.coveredCopies, 0);
  assert.deepEqual(plan.unbuyable, [{ name: "Beta", qty: 2 }]);
  const anyMap = await loadStoreListings(["beta"], "US", STORES, db, "any");
  assert.equal(anyMap.get("beta")?.length, 2, "…while 'Anything' still finds them");
});

test("the floor adds no reads: one RetailerPrice query with the same narrow select, whatever the floor", async () => {
  const { db, queries } = listingsDb([row("alpha", "mythicstore", 1000, "Near Mint")]);
  await loadStoreListings(["alpha"], "US", STORES, db, "nm");
  await loadStoreListings(["alpha"], "US", STORES, db, "any");
  assert.equal(queries.length, 2);
  const [a, b] = queries as { where: Record<string, unknown>; select: Record<string, boolean>; take?: number }[];
  assert.deepEqual(a, b, "identical query for every floor: condition is filtered in memory, not in SQL");
  assert.deepEqual(Object.keys(a.select).sort(), ["cardId", "condition", "priceCents", "retailer", "url"]);
  const src = read("src/lib/basket-server.ts").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(src, /unstable_cache/, "nothing here is cached");
});

test("the request: the floor defaults to 'any' so every existing caller is unchanged; junk is 'any'", () => {
  assert.equal(parseBasketRequest({ source: "deck", text: "3 Alpha" }).minCondition, "any");
  assert.equal(parseBasketRequest(null).minCondition, "any");
  assert.equal(parseBasketRequest({ minCondition: "lp" }).minCondition, "lp");
  assert.equal(parseBasketRequest({ minCondition: "nm" }).minCondition, "nm");
  assert.equal(parseBasketRequest({ minCondition: "mint" }).minCondition, "any");
  assert.equal(parseBasketRequest({ minCondition: 1 }).minCondition, "any");
  assert.equal(parseBasketRequest({}).saveMinCondition, false);
  assert.equal(parseBasketRequest({ saveMinCondition: true }).saveMinCondition, true);
  assert.equal(parseMinCondition(undefined, DEFAULT_MIN_CONDITION), "lp");
});

test("the floor is Premium's: the route prices a non-Premium request at 'any' and only echoes/remembers it for Premium", () => {
  const route = read("src/app/api/basket/route.ts");
  assert.match(route, /buildBasket\(user\.id, full, request, full \? request\.minCondition : "any"/);
  assert.match(route, /if \(full && request\.saveMinCondition/);
  assert.match(route, /loadStoreListings\(\[\.\.\.wanted\.keys\(\)\], country, Object\.keys\(stores\), prisma, minCondition\)/);
  // The free preview is built from a plan priced at 'any' and never carries the floor.
  const preview = route.slice(route.indexOf("const preview = basketPreview("), route.indexOf("const { plan, alternatives }"));
  assert.ok(preview.length > 20, "found the free branch");
  assert.doesNotMatch(preview, /minCondition/);
});

test("the free total says how many played copies it includes, from the plan's lines only (a count, no store)", async () => {
  const { db } = listingsDb([
    row("alpha", "mythicstore", 500, "Heavily Played"),
    row("beta", "mythicstore", 800, "Lightly Played"),
    row("gamma", "mythicstore", 900, "Near Mint"),
  ]);
  const listings = await loadStoreListings(["alpha", "beta", "gamma"], "US", STORES, db);
  const cards: BasketCard[] = [
    { cardId: "alpha", name: "Alpha", slug: "alpha", qty: 3, listings: listings.get("alpha") ?? [] },
    { cardId: "beta", name: "Beta", slug: "beta", qty: 1, listings: listings.get("beta") ?? [] },
    { cardId: "gamma", name: "Gamma", slug: "gamma", qty: 1, listings: listings.get("gamma") ?? [] },
  ];
  const plan = optimizeBasket(cards, basketStoresFor("US", postageOptionsFrom("US", null, null)));
  const preview = basketPreview(plan);
  assert.equal(preview.playedCopies, 3, "only the three HP copies are below LP; the LP copy is not counted");
  assert.equal(playedCopiesNote(3), "Includes 3 played copies (below Lightly Played)");
  assert.equal(playedCopiesNote(1), "Includes 1 played copy (below Lightly Played)");
  assert.doesNotMatch(JSON.stringify(preview), /mythic|https?:/i, "still no store name or link in the preview");
  assert.equal(playedCopyCount([{ qty: 2, condition: null }, { qty: 1, condition: "Lightly Played" }]), 0);
  // At the default floor the same list has none.
  const lpListings = await loadStoreListings(["alpha", "beta", "gamma"], "US", STORES, db, "lp");
  const lpPlan = optimizeBasket(
    cards.map((c) => ({ ...c, listings: lpListings.get(c.cardId) ?? [] })),
    basketStoresFor("US", postageOptionsFrom("US", null, null)),
  );
  assert.equal(basketPreview(lpPlan).playedCopies, 0);
  assert.deepEqual(lpPlan.unbuyable, [{ name: "Alpha", qty: 3 }], "and the HP-only card is not covered");
});

// ── The deck price watch ─────────────────────────────────────────────────────

// Alpha: an HP copy at $5 and an NM copy at $10 at one store; Beta: NM $20.
const LISTINGS = [
  { cardId: "alpha", retailer: "mythicstore", priceCents: 500, condition: "Heavily Played" },
  { cardId: "alpha", retailer: "mythicstore", priceCents: 1000, condition: "Near Mint" },
  { cardId: "beta", retailer: "mythicstore", priceCents: 2000, condition: "Near Mint" },
];

test("the page and the watch agree: the same list at the same floor is the same delivered total, and a null floor changes nothing", async () => {
  const h = deckHarness([], { listings: LISTINGS });
  const stores = basketStoresFor("US", postageOptionsFrom("US", null, null));
  for (const floor of ["any", "lp", "nm"] as const) {
    const watch = await priceDeckList(h.db, { listText: "3 Alpha\n1 Beta", market: "US", region: null, trackedOnly: null, minCondition: floor });
    assert.ok(watch, floor);
    // Best Basket's own path: the same listing read, the same optimiser.
    const listings = await loadStoreListings(["alpha", "beta"], "US", Object.keys(stores), h.db, floor);
    const page = optimizeBasket(
      [
        { cardId: "alpha", name: "Alpha", slug: "alpha", qty: 3, listings: listings.get("alpha") ?? [] },
        { cardId: "beta", name: "Beta", slug: "beta", qty: 1, listings: listings.get("beta") ?? [] },
      ],
      stores,
    );
    assert.equal(watch.plan.totalCents, page.totalCents, `floor ${floor}: page and watch totals equal`);
  }
  const noFloor = await priceDeckList(h.db, { listText: "3 Alpha\n1 Beta", market: "US", region: null, trackedOnly: null });
  const any = await priceDeckList(h.db, { listText: "3 Alpha\n1 Beta", market: "US", region: null, trackedOnly: null, minCondition: "any" });
  const lp = await priceDeckList(h.db, { listText: "3 Alpha\n1 Beta", market: "US", region: null, trackedOnly: null, minCondition: "lp" });
  assert.equal(noFloor!.plan.itemsCents, any!.plan.itemsCents, "no floor is 'any'");
  assert.equal(any!.plan.itemsCents, 3 * 500 + 2000, "any: the HP copies");
  assert.equal(lp!.plan.itemsCents, 3 * 1000 + 2000, "LP or better: the NM copies at the same store");
  assert.equal(lp!.complete, true);
});

test("the run: a watch with a null floor prices exactly as it always did; an 'lp' watch prices its NM copies and its email says so", async () => {
  const probe = deckHarness([], { listings: LISTINGS });
  const lpTotal = (await priceDeckList(probe.db, { listText: "3 Alpha\n1 Beta", market: "US", region: null, trackedOnly: null, minCondition: "lp" }))!.plan.totalCents;
  const anyTotal = (await priceDeckList(probe.db, { listText: "3 Alpha\n1 Beta", market: "US", region: null, trackedOnly: null }))!.plan.totalCents;
  assert.ok(lpTotal > anyTotal);
  const rows = [
    deckRow("old", premium, { targetCents: anyTotal }), // saved before the floor existed: minCondition null
    deckRow("lp", premium, { targetCents: anyTotal, minCondition: "lp" }), // priced at NM copies, over its target
    deckRow("lp2", premium, { targetCents: lpTotal, minCondition: "lp" }),
  ];
  const h = deckHarness(rows, { listings: LISTINGS });
  const s = await h.run();
  assert.equal(s.emails, 2);
  assert.equal(h.writeFor("old")!.lastTotalCents, anyTotal, "the null-floor watch keeps its old figure");
  assert.equal(h.writeFor("lp")!.lastTotalCents, lpTotal);
  const sent = (id: string) => h.sent.find((x) => x.to === `${id}@example.com`);
  assert.equal(sent("old")!.item.totalCents, anyTotal);
  assert.equal(sent("old")!.item.minCondition, "any");
  assert.equal(sent("lp")?.item, undefined, "an lp watch whose target sits under its NM total is not emailed from the cheaper played copies");
  assert.equal(sent("lp2")!.item.totalCents, lpTotal);
  assert.equal(sent("lp2")!.item.minCondition, "lp");
  const mail = buildDeckWatchEmail(sent("lp2")!.item);
  assert.match(mail.text, /Priced at Lightly Played or better/);
  assert.doesNotMatch(buildDeckWatchEmail(sent("old")!.item).text, /Priced at/, "an any-condition email prints no floor");
});

test("a floor that leaves a card uncovered keeps the watch quiet (it never names a total that leaves a card out), and the total is still recorded", async () => {
  const listings = [
    { cardId: "alpha", retailer: "mythicstore", priceCents: 500, condition: "Heavily Played" },
    { cardId: "beta", retailer: "mythicstore", priceCents: 2000, condition: "Near Mint" },
  ];
  const h = deckHarness([deckRow("w", premium, { minCondition: "lp", lastTotalCents: 99_999, targetCents: 99_999 })], { listings });
  const s = await h.run();
  assert.equal(s.incomplete, 1);
  assert.equal(s.emails, 0);
  assert.ok(h.writeFor("w")!.lastTotalCents != null);
});

function routeDb(seed: Record<string, unknown>[] = []) {
  const rows = seed.map((r) => ({ ...r }));
  const db = {
    deckWatch: {
      count: async () => rows.length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const r = { id: `d${rows.length + 1}`, lastTotalCents: null, lastCheckedAt: null, lastEmailedCents: null, lastNotifiedAt: null, snoozedUntil: null, createdAt: NOW, ...data };
        rows.push(r);
        return r;
      },
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null,
      findMany: async () => rows,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
      deleteMany: async () => ({ count: 0 }),
    },
  };
  return { db: db as unknown as DeckWatchRouteDb, rows };
}
const me = (id: string, tier: typeof premium) => ({ ...tier, id, email: `${id}@example.com` });

test("a NEW deck watch starts on 'LP or better'; 'anything' is stored as null; a bad value is a 400; existing rows are untouched", async () => {
  const { db, rows } = routeDb();
  const dflt = await createDeckWatch(db, me("o", premium), { listText: "3 Alpha" }, "US");
  assert.equal(dflt.status, 201);
  assert.equal(rows[0]!.minCondition, "lp", "the new-watch default");
  const nm = await createDeckWatch(db, me("o", premium), { listText: "3 Alpha", minCondition: "nm" }, "US");
  assert.equal(nm.status, 201);
  assert.equal(rows[1]!.minCondition, "nm");
  const any = await createDeckWatch(db, me("o", premium), { listText: "3 Alpha", minCondition: "any" }, "US");
  assert.equal(any.status, 201);
  assert.equal(rows[2]!.minCondition, null, "'any' is null, the same as every old row");
  const nul = await createDeckWatch(db, me("o", premium), { listText: "3 Alpha", minCondition: null }, "US");
  assert.equal(rows[3]!.minCondition, null);
  assert.equal(nul.status, 201);
  assert.equal((await createDeckWatch(db, me("o", premium), { listText: "3 Alpha", minCondition: "pristine" }, "US")).status, 400);
  assert.equal(storedMinCondition(null), "any");
  assert.equal(storedMinCondition(undefined), "any");
  assert.equal(toStoredMinCondition("any"), null);
});

test("changing a watch's floor re-baselines it and never emails a false drop; an unchanged floor does not touch the baseline", async () => {
  const { db, rows } = routeDb([
    { id: "d1", userId: "o", market: "US", name: "Deck", listText: "3 Alpha\n1 Beta", minCondition: "lp", targetCents: null, lastTotalCents: 10_000, lastEmailedCents: 9_800, lastNotifiedAt: NOW, snoozedUntil: null },
  ]);
  const same = await updateDeckWatch(db, me("o", premium), "d1", { minCondition: "lp" }, NOW);
  assert.equal(same.status, 200);
  assert.equal(rows[0]!.lastTotalCents, 10_000, "the same floor keeps its baseline");
  assert.equal((await updateDeckWatch(db, me("o", plus), "d1", { minCondition: "nm" }, NOW)).status, 402, "editing the floor is Premium's");
  assert.equal((await updateDeckWatch(db, me("o", premium), "d1", { minCondition: "shiny" }, NOW)).status, 400);
  const res = await updateDeckWatch(db, me("o", premium), "d1", { minCondition: "any" }, NOW);
  assert.equal(res.status, 200);
  assert.equal(rows[0]!.minCondition, null);
  assert.equal(rows[0]!.lastTotalCents, null, "re-baselined");
  assert.equal(rows[0]!.lastEmailedCents, null);
  // Loosening the floor lowers the total (the HP copies now count). With no
  // target that must not read as a drop from the old floor's total.
  const h = deckHarness([deckRow("d1", premium, { minCondition: null, targetCents: null, lastTotalCents: null, lastEmailedCents: null })], { listings: LISTINGS });
  const s = await h.run();
  assert.equal(s.emails, 0, "no false drop email");
  assert.equal(s.drops, 0);
  assert.ok(h.writeFor("d1")!.lastTotalCents != null, "the new floor's total is the new baseline");
  // …and from that baseline a genuine drop still fires.
  const base = h.writeFor("d1")!.lastTotalCents as number;
  const h2 = deckHarness([deckRow("d1", premium, { minCondition: null, targetCents: null, lastTotalCents: base + 2_000 })], { listings: LISTINGS });
  assert.equal((await h2.run()).drops, 1);
});

// ── What Best Basket remembers ───────────────────────────────────────────────

test("the member's last choice is remembered (User.basketPrefs), a new session starts on LP or better, and a failed read is 'no prefs'", async () => {
  assert.equal(initialMinCondition(null), "lp");
  assert.equal(initialMinCondition({}), "lp");
  assert.equal(initialMinCondition({ minCondition: "any" }), "any");
  assert.deepEqual(parseBasketPrefs({ minCondition: "nm", other: 1 }), { minCondition: "nm" });
  assert.deepEqual(parseBasketPrefs("garbage"), {});
  assert.deepEqual(parseBasketPrefs({ minCondition: "pristine" }), {});
  let stored: unknown = null;
  const writes: unknown[] = [];
  const db = {
    user: {
      findUnique: async () => ({ basketPrefs: stored }),
      update: async ({ data }: { data: { basketPrefs: unknown } }) => {
        writes.push(data.basketPrefs);
        stored = data.basketPrefs;
        return {};
      },
    },
  } as unknown as Parameters<typeof saveMinConditionPref>[2];
  await saveMinConditionPref("u", "nm", db);
  assert.deepEqual(stored, { minCondition: "nm" });
  await saveMinConditionPref("u", "nm", db);
  assert.equal(writes.length, 1, "no write when it is already what is stored");
  stored = { minCondition: "nm", later: "kept" };
  await saveMinConditionPref("u", "any", db);
  assert.deepEqual(stored, { minCondition: "any", later: "kept" }, "read-merge keeps other keys");
  assert.deepEqual(await loadBasketPrefs("u", db as unknown as Parameters<typeof loadBasketPrefs>[1]), { minCondition: "any" });
  const broken = { user: { findUnique: async () => { throw new Error("db down"); } } } as unknown as Parameters<typeof loadBasketPrefs>[1];
  assert.deepEqual(await loadBasketPrefs("u", broken), {});
});

test("the schema change is additive and nullable, and the page code stays client-safe", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /minCondition\s+String\?/);
  assert.match(schema, /basketPrefs\s+Json\?/);
  const pure = read("src/lib/basket-condition.ts");
  const imports = [...pure.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ["./condition"], "the client-safe module imports only the pure condition grades");
  const best = read("src/components/BestBasket.tsx");
  assert.doesNotMatch(best, /from "@\/lib\/basket-server"/);
  // Replacement cost (the free portfolio total) keeps reading every condition.
  assert.doesNotMatch(read("src/app/api/portfolio/replacement/route.ts"), /minCondition/);
});
