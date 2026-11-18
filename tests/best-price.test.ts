// "Best price" row treatment (owner, 2026-11-18): the cheapest row is loud (green edge, green chip) only when it is a paid row;
// a plain non-affiliate store gets a small neutral tag and a note that names only the marketplace rows that exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BEST_TAG_CLASS, bestPriceHint, bestTreatment, isAffiliateRow } from "../src/lib/best-price";
import { BestPriceNote, BestPriceTag } from "../src/components/BestPriceTag";

(globalThis as { React?: unknown }).React = React; // the components use the classic JSX runtime

test("a non-affiliate cheapest row is plain; paid cheapest rows stay loud", () => {
  assert.equal(bestTreatment(true, { source: "somestore" }), "plain");
  assert.equal(bestTreatment(true, { source: "ebay-us", ebay: true }), "loud");
  assert.equal(bestTreatment(true, { source: "tcgplayer" }), "loud");
  assert.equal(bestTreatment(true, { source: "tcgplayer-us" }), "loud");
  assert.equal(bestTreatment(true, { source: "partner", paid: true }), "loud");
  assert.equal(bestTreatment(false, { source: "somestore" }), null);
  assert.equal(isAffiliateRow({ source: "somestore" }), false);
});

test("the plain tag has no green and no fill; the loud class keeps its green", () => {
  const html = renderToStaticMarkup(React.createElement(BestPriceTag));
  assert.match(html, /Best price/);
  assert.doesNotMatch(html, /emerald|green|bg-|shadow/);
  assert.doesNotMatch(BEST_TAG_CLASS.plain, /emerald|green|bg-|shadow/);
  assert.match(BEST_TAG_CLASS.loud, /emerald/);
});

test("the hint appears only when an eBay and/or TCGplayer row exists, and names only those", () => {
  assert.equal(bestPriceHint({ ebay: false, tcgplayer: false }), null);
  assert.equal(bestPriceHint({ ebay: true, tcgplayer: false }), "Prices and stock change: also check eBay");
  assert.equal(bestPriceHint({ ebay: false, tcgplayer: true }), "Prices and stock change: also check TCGplayer");
  assert.equal(bestPriceHint({ ebay: true, tcgplayer: true }), "Prices and stock change: also check eBay and TCGplayer");
  assert.equal(renderToStaticMarkup(React.createElement(BestPriceNote, { has: { ebay: false, tcgplayer: false } })), "");
  assert.match(renderToStaticMarkup(React.createElement(BestPriceNote, { has: { ebay: true, tcgplayer: true } })), /also check eBay and TCGplayer/);
  assert.doesNotMatch(bestPriceHint({ ebay: true, tcgplayer: true }) ?? "", /cheaper/i);
});

test("every surface goes through bestTreatment, and the green edge is only worn by a loud row", () => {
  for (const f of ["CardMarketSection", "QuickView", "SealedQuickView", "CardMobileBuy", "pokemon/PokemonBoardView"]) {
    const src = fs.readFileSync(`src/components/${f}.tsx`, "utf8");
    assert.match(src, /bestTreatment\(/, f);
  }
  const board = fs.readFileSync("src/components/CardMarketSection.tsx", "utf8");
  assert.match(board, /cheapest: best === "loud"/);
  const sealed = fs.readFileSync("src/components/SealedQuickView.tsx", "utf8");
  assert.match(sealed, /cheapest: bt === "loud" && listings\.length > 1/);
});
