import { test } from "node:test";
import assert from "node:assert/strict";
import { clickGroup, clickKey, storeClickKey, sydneyDay, sydneyMonth } from "../src/lib/click-counter";
import { readFileSync } from "node:fs";

test("clickGroup sorts every retailer value into a network", () => {
  for (const r of ["ebay", "ebay_search", "pkmn_ebay_search", "ebay_graded", "ebay_basket"]) assert.equal(clickGroup(r), "ebay", r);
  for (const r of ["tcgplayer", "tcgplayer_banner"]) assert.equal(clickGroup(r), "tcgplayer", r);
  assert.equal(clickGroup("mysterymtg"), "store");
  assert.equal(clickGroup(""), null);
  assert.equal(clickGroup("x".repeat(65)), null);
});

test("click keys are per Sydney day", () => {
  // 14:00 UTC on 27 Oct is already 28 Oct in Sydney (UTC+11).
  assert.equal(sydneyDay(Date.parse("2026-10-27T14:00:00Z")), "2026-10-28");
  assert.equal(clickKey("2026-10-28", "tcgplayer"), "click:2026-10-28:tcgplayer");
});

test("store clicks are per store and Sydney month, known stores only", () => {
  assert.equal(sydneyMonth(Date.parse("2026-10-31T14:00:00Z")), "2026-11");
  assert.equal(storeClickKey("2026-11", "yardsgames"), "storeclick:2026-11:yardsgames");
  // Never collides with the daily range read by readClickCounts (click: .. click:9).
  assert.ok(!storeClickKey("2026-11", "x").startsWith("click:"));
  const route = readFileSync(new URL("../src/app/api/click/route.ts", import.meta.url), "utf8");
  assert.match(route, /hasOwnProperty\.call\(RETAILERS, retailer\)/);
});
