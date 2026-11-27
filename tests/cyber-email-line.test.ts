import { test } from "node:test";
import assert from "node:assert/strict";
import { tcgplayerSaleLine } from "../src/lib/sister-alerts/email";
import { tcgplayerSaleFooterLine } from "../src/lib/email";

// TCGplayer's Cyber Weekend sale (owner, 2026-11-27): a labelled line inside the alert and weekly emails, only while it is on.
const on = new Date("2026-11-28T12:00:00Z");

test("on during the sale, for the sites TCGplayer sells, labelled Ad and tagged", () => {
  const l = tcgplayerSaleLine("mtg", on)!;
  assert.match(l.html, /^<span[^>]*>Ad ·<\/span> <a href="https:\/\/partner\.tcgplayer\.com\/c\/7385758\/1780961\/21018\?u=[^"]*sharedid=email-mtg-cyber" rel="sponsored"/);
  assert.ok(tcgplayerSaleFooterLine(on)!.html.startsWith("Ad · "));
});

test("off before 9AM New York on 27 Nov and from 11PM on 30 Nov", () => {
  assert.equal(tcgplayerSaleLine("dex", new Date("2026-11-27T13:59:00Z")), null);
  assert.equal(tcgplayerSaleLine("dex", new Date("2026-12-01T04:00:00Z")), null);
  assert.equal(tcgplayerSaleFooterLine(new Date("2026-12-01T04:00:00Z")), null);
});

test("never in a wargame, sports, figure, scent or K-beauty email", () => {
  for (const k of ["wargame", "wax", "figure", "scent", "kaeyoung"]) assert.equal(tcgplayerSaleLine(k, on), null, k);
});
