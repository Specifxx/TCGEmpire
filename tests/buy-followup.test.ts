import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

test("a buy click names its card to the page, and the card page follows up inline (2026-11-22)", () => {
  assert.match(read("src/components/OutboundLink.tsx"), /announceBuyClick\(cardId\);/);
  const page = read("src/app/card/[id]/page.tsx");
  assert.match(page, /<BuyFollowUp cardId=\{card\.id\} cardName=\{displayName\} \/>/);
  const c = read("src/components/BuyFollowUp.tsx");
  assert.match(c, /^"use client";/);
  assert.match(c, /if \(d\?\.cardId !== cardId\) return;/, "only this card's click");
  assert.match(c, /sessionStorage\.setItem\(key, "1"\)/, "once per card per tab");
  assert.match(c, /onClick=\{\(\) => setShown\(false\)\}/, "dismissible");
  // In the page flow: never fixed, never an overlay or a dialog.
  assert.doesNotMatch(c, /\bfixed\b|<dialog|z-\[?\d|position:\s*fixed|window\.open/);
  assert.match(c, /fetch\("\/api\/collection"/);
});
