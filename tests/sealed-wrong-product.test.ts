import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifySealed } from "../src/lib/sealed-import";
import { isForeignLanguageTitle } from "../src/lib/scrape-http";
import { buildCardmarketSealedRows } from "../src/lib/cardmarket";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Three wrong-price reports against SEALED products, all open in the inbox on
// 2026-09-20, all confirmed against the real stored listing titles with
// scripts/diagnose-sealed.ts. Every title below is verbatim from the database,
// and every price is the one that was actually published.
//
// What they have in common is the failure mode: none of them is a missing
// listing or a broken fetch. In each case the pipeline found a REAL listing,
// passed it through every guard, and published it as a product it is not — at a
// price that looked like a bargain precisely because it was a different thing.
// ─────────────────────────────────────────────────────────────────────────────

test("a Chinese-market box does not get published as the English one", () => {
  // eBay AU, A$156.00, filed as the cheapest UNL Booster Box against a genuine
  // AU market of A$199-280. Reported: "Unleashed Slim Booster Box (CHN)".
  //
  // Every guard was innocent: no CJK in an all-English title, an AU-located
  // seller, and A$156 clears both the flat floor and half the trusted reference.
  // FOREIGN_LANG already listed `cn` — but "CHN" is a different word and
  // \bcn\b does not match it.
  assert.ok(
    isForeignLanguageTitle("Riftbound League of Legends TCG: Unleashed Slim Booster Box (CHN)"),
    "the reported listing must now read as a foreign printing",
  );
  // The pattern is shared by every price source, so this closes the same hole
  // for singles, TCGplayer and ~100 store feeds at once — which is the whole
  // reason it lives in one file.
  for (const t of ["CHN Riftbound Spiritforged Booster Box", "Riftbound Origins CHN Booster Box"]) {
    assert.ok(isForeignLanguageTitle(t), t);
  }
  // …without catching English listings, including ones that say "English".
  for (const t of [
    "Riftbound: League of Legends TCG - Unleashed Booster Box",
    "League of Legends Riftbound TCG: Origins Booster Case English Sealed",
    "Riftbound: Vendetta Set 4  Booster Box x6 Sealed Case",
  ]) {
    assert.ok(!isForeignLanguageTitle(t), t);
  }
});

test("a Jumbo or Slim box is not the box we price, whatever language it is in", () => {
  // eBay AU, A$123.56, filed as the cheapest SFD Booster Box against a genuine
  // AU market of A$215-320. Reported as "Chinese version"; the title says
  // nothing about language at all:
  //   "Riftbound League Of Legends Spiritforged Jumbo Booster Box Factory Sealed"
  //
  // So the claim made in code is the one the title actually supports: a Jumbo
  // (or Slim) box is a DIFFERENT SKU from the Booster Box this site tracks.
  const src = read("src/lib/ebay.ts");
  const at = src.indexOf("const SEALED_EXCLUDE_EBAY_BASE");
  assert.ok(at > 0, "could not locate the sealed exclusion list");
  const pattern = src.slice(at, src.indexOf(";", at));
  assert.match(pattern, /\\bjumbo\\b/, "a Jumbo box must be excluded");
  assert.match(pattern, /\\bslim\\b/, "a Slim box must be excluded");
});

test("classifySealed knows the plainest way to write 'Booster Case'", () => {
  // Three stored case listings typed as something else, found by running the
  // classifier back over every title in the database. The alternation required
  // "display case" / "booster box case" / "sealed case" and had no rule for the
  // bare phrase, so the most natural wording fell through.
  for (const t of [
    "League of Legends Riftbound TCG: Origins Booster Case English Sealed",
    "Riftbound: League of Legends TCG Radiance Booster Case (PREORDER-OCTOBER)",
    "Riftbound LoL TCG Spiritforged Sealed Booster Case 6x Booster Box ENG",
    "Vendetta - Booster Display Case",
    "Riftbound Vendetta Booster Box Case (6 Booster Box)",
  ]) {
    assert.equal(classifySealed(t), "Booster Case", t);
  }
  // The OTHER half of how a case is written, where "case" is not next to
  // "booster" and a COUNT of boxes carries the meaning instead. Adjacency alone
  // typed the first of these as a Booster Box — it says "Booster Boxes" and
  // nothing else matched — and the new eBay veto then dropped a genuine AU case
  // listing for disagreeing with its own group. Caught by that veto's log line
  // in the first forced import after it shipped.
  for (const t of [
    "Riftbound: League of Legends TCG Unleashed Case (6x Booster Boxes)",
    "RIFTBOUND LEAGUE OF LEGENDS TCG UNLEASHED SEALED CASE 6x BOOSTER BOX ENGLISH ENG",
    "RIFTBOUND VENDETTA LEAGUE OF LEGENDS - FACTORY SEALED CASE OF 6 BOOSTER BOX ENG",
    "Riftbound: League of Legends TCG - Set 04 - Vendetta - Display Case (6x Booster Boxes)",
    "Riftbound TCG - League of Legends Vendetta Boosterbox Case (6x)",
  ]) {
    assert.equal(classifySealed(t), "Booster Case", t);
  }

  // …and the COUNT is what keeps that safe. This is ONE BOX whose title happens
  // to end "FROM A CASE": no multiplier beside "booster box", so it must keep
  // typing as a Booster Box. A bare /\bcase\b/ would retype it and reintroduce
  // the very defect that was reported.
  assert.equal(
    classifySealed("x1 Riftbound: Origins Booster Box New & Sealed English FRESHLY FROM A CASE"),
    "Booster Box",
  );
  for (const t of [
    "Unleashed - Booster Display",
    "Riftbound Unleashed Booster Box - One Per Customer",
    "Riftbound: Unleashed Set 3 Booster Box Sealed",
  ]) {
    assert.equal(classifySealed(t), "Booster Box", t);
  }
});

test("a single box cannot be sold to us as a case", () => {
  // eBay US, US$469.07, filed as the cheapest OGN Booster Case against a real
  // case at ~US$1,095. Reported: "Its actually just a single box, not a case".
  //
  // SEALED_TYPE_KW["Booster Case"] was a bare /\bcase\b/i, so "FRESHLY FROM A
  // CASE" satisfied it. The word now has to describe the product.
  const src = read("src/lib/ebay.ts");
  const at = src.indexOf('"Booster Case":');
  assert.ok(at > 0);
  const line = src.slice(at, src.indexOf("\n", at));
  assert.doesNotMatch(line, /^\s*"Booster Case": \/\\bcase\\b\/i,$/, "the bare keyword must be gone");
  assert.match(line, /booster\\s\*case/, "a case must call itself a case");

  // The second half of the fix, and the one that generalises: the importer no
  // longer stamps the group's productType onto whatever came back.
  const imp = read("src/lib/sealed-import.ts");
  assert.match(
    imp,
    /if \(SELF_TYPED\.has\(g\.productType\) && classifySealed\(r\.title\) !== g\.productType\)/,
    "the listing's own title must be able to veto the group it was searched for",
  );
  assert.match(
    imp,
    /const SELF_TYPED = new Set\(\["Booster Box", "Booster Case", "Booster Pack", "Sleeved Booster"\]\);/,
    "scoped to the four confusable types — a blanket check would empty the others",
  );
});

test("every sealed product type has a title keyword", () => {
  // `!kw || kw.test(…)` means a type MISSING from the table is searched with no
  // title filter at all and takes eBay's cheapest result for a bare
  // "Riftbound <name>" query. The table's own comment records this trap for two
  // Radiance SKUs; the same omission was still live for the sleeved types, and
  // it is how an "Origins Booster Pack" listing ended up in OGN|Sleeved Booster.
  const src = read("src/lib/ebay.ts");
  const at = src.indexOf("const SEALED_TYPE_KW");
  const table = src.slice(at, src.indexOf("};", at));
  for (const type of ["Booster Box", "Booster Case", "Booster Pack", "Sleeved Booster", "Sleeved Booster (Art Set)", "Vault", "Bundle", "Tin"]) {
    assert.ok(table.includes(`"${type}":`) || table.includes(`${type}:`), `no keyword for ${type}`);
  }
});

test("Cardmarket's sealed feed does not publish a Chinese box as the English one", () => {
  // Found while verifying a DIFFERENT fix, by reading the table rather than the
  // page: VEN|Booster Box carried "Vendetta Booster Box (Chinese, Slim)" at
  // €42.99 and "(Chinese, Jumbo)" at €65.90 — the cheaper one being the EU
  // market's headline price for a product that really trades at €143-180.
  //
  // Two separate gaps met here. The Cardmarket SEALED path had no language
  // check at all (the singles matcher and the eBay sealed search each have
  // one), and FOREIGN_LANG — the pattern it would reach for — covered only the
  // SHORT codes, because eBay's sealed search kept the full words in a list of
  // its own. Each half was complete for its own caller and neither was complete
  // alone.
  for (const t of [
    "Vendetta Booster Box (Chinese, Slim)",
    "Vendetta Booster Box (Chinese, Jumbo)",
    "Riftbound Japanese Booster Box",
    "Riftbound Korean Booster Display",
  ]) {
    assert.ok(isForeignLanguageTitle(t), t);
  }
  // English listings, including ones that say the word "English", are untouched.
  for (const t of [
    "Riftbound: League of Legends TCG - Vendetta Booster Box",
    "League of Legends Riftbound TCG: Origins Booster Case English Sealed",
    "Vendetta - Booster Display",
  ]) {
    assert.ok(!isForeignLanguageTitle(t), t);
  }

  // …and the builder actually drops them, rather than the pattern merely being
  // capable of it.
  const products = [
    { idProduct: 1, name: "Vendetta Booster Box", idCategory: 1657, categoryName: "Riftbound Display", idExpansion: 9, idMetacard: 1, dateAdded: "2026-01-01" },
    { idProduct: 2, name: "Vendetta Booster Box (Chinese, Slim)", idCategory: 1657, categoryName: "Riftbound Display", idExpansion: 9, idMetacard: 2, dateAdded: "2026-01-01" },
  ];
  const prices = [
    { idProduct: 1, idCategory: 1657, low: 143, avg: null, trend: null },
    { idProduct: 2, idCategory: 1657, low: 42.99, avg: null, trend: null },
  ];
  // (cardsForMapping, singleProducts, sealedProducts, prices) — the expansion→set
  // inference needs neither here: with no singles to learn from, setCode comes
  // back null and the groupKey falls back to a slug. What is under test is which
  // ROWS survive, which that does not affect.
  const { rows } = buildCardmarketSealedRows([], [], products, prices);
  assert.equal(rows.length, 1, "only the English box may be published");
  assert.equal(rows[0].title, "Vendetta Booster Box");
  assert.ok(
    !rows.some((r) => /chinese/i.test(String(r.title))),
    "no Chinese SKU may reach SealedListing",
  );
});
