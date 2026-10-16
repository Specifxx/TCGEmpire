import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DECOMMISSIONED_RETAILERS, RETAILERS, RETAILER_LIST, SINGLES_RETIRED_RETAILERS } from "../src/lib/retailers";
import { SEALED_ONLY_STORES } from "../src/lib/sealed-stores";

// ─────────────────────────────────────────────────────────────────────────────
// THE STORE AUDIT (2026-10-16, owner: "take a look at all the stores … any
// stores that are new and popular … get rid of the stores that … have been
// dead"). DECISIONS.md, "The store audit".
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const sealedKeys = new Set(SEALED_ONLY_STORES.map((s) => s.key));

test("a decommissioned store is in no registry, and no external source is ever purged", () => {
  assert.equal(new Set(DECOMMISSIONED_RETAILERS).size, DECOMMISSIONED_RETAILERS.length, "no duplicates");
  for (const k of DECOMMISSIONED_RETAILERS) {
    assert.ok(!RETAILERS[k], `${k} is decommissioned but still in RETAILERS: the purge would delete a live store's rows every run`);
    assert.ok(!sealedKeys.has(k), `${k} is decommissioned but still a sealed-only store`);
    assert.doesNotMatch(k, /^(ebay|tcgplayer|cardmarket|cardtrader)/, `${k}: reference sources keep their own cadence`);
  }
});

test("a store moved to sealed-only loses its card rows but keeps its sealed ones", () => {
  for (const k of SINGLES_RETIRED_RETAILERS) {
    assert.ok(!RETAILERS[k], `${k} is still a singles store`);
    assert.ok(sealedKeys.has(k), `${k} must be in lib/sealed-stores.ts, or its sealed prices stop too`);
    assert.ok(!DECOMMISSIONED_RETAILERS.includes(k), `${k}: DECOMMISSIONED would purge its sealed rows as well`);
  }
  const imp = read("src/lib/price-import.ts");
  const purge = imp.indexOf("prisma.retailerPrice.deleteMany({ where: { retailer: { in: [...SINGLES_RETIRED_RETAILERS] } } })");
  assert.ok(purge > 0, "the singles-only purge exists");
  assert.ok(purge < imp.indexOf("for (const store of RETAILER_LIST) {"), "and runs before the store loop");
  assert.doesNotMatch(imp.slice(purge - 400, purge + 400), /sealedListing\.deleteMany/, "it never touches sealed rows");
});

test("no store is in both registries, and every key is unique", () => {
  for (const r of RETAILER_LIST) assert.ok(!sealedKeys.has(r.key), `${r.key} is in RETAILERS and sealed-stores.ts`);
  assert.equal(new Set(RETAILER_LIST.map((r) => r.key)).size, RETAILER_LIST.length);
});

test("Chonky Collectibles and The CG Realm are the Ontario stores they are", () => {
  const c = RETAILERS.chonkycollectibles;
  assert.equal(c.country, "CA", "with ?country=SG every card reads sold out");
  assert.ok(c.collections.length >= 4);
  assert.equal(RETAILERS.cgrealm.country, "CA", "ships to Canada only: its US prices were a conversion no US buyer could order");
  assert.ok(!RETAILERS.columbuscardshop, "its online store is not taking orders");
  for (const k of ["prestigegames", "twinmoonstcg"]) assert.ok(!RETAILERS[k], `${k} is pickup only`);
});

test("the audit's additions are in the market they charge in", () => {
  const expect: Record<string, string> = {
    eternalmagic: "AU",
    blacklistcards: "AU",
    archerongames: "UK",
    dkscards: "US",
    onecollectiblestcg: "SG",
    fantasyforged: "CA",
    "3mana": "CA",
    fireanddice: "EU",
    cardsbeyond: "EU",
  };
  for (const [k, market] of Object.entries(expect)) {
    assert.ok(RETAILERS[k], `${k} is tracked`);
    assert.equal(RETAILERS[k].country ?? "AU", market, k);
    assert.ok(RETAILERS[k].collections.length > 0, `${k} names its singles collections`);
  }
});
