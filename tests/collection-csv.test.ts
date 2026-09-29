import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CSV_LINE_CAP, matchCsvRows, numberKey, parseCollectionCsv, resolveSetCode, splitCells } from "../src/lib/collection-csv";

// ─────────────────────────────────────────────────────────────────────────────
// The printing-aware binder import (2026-09-29, DECISIONS.md, "Set tracker"):
// set code + collector number (+ finish, condition, quantity) per line, every
// skipped line reported with its reason, free for everyone.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("a collector number is reduced to the printing inside its set", () => {
  assert.equal(numberKey("001/298"), "1");
  assert.equal(numberKey("1"), "1");
  assert.equal(numberKey("OGN-001"), "1");
  assert.equal(numberKey("ogn 039a"), "39a");
  assert.equal(numberKey("112A/298"), "112a");
  assert.equal(numberKey("223*/221"), "223*");
  assert.equal(numberKey("OGN-301*"), "301*");
  assert.equal(numberKey(" 010 "), "10");
});

test("cells split on the delimiter, honouring quotes and doubled quotes", () => {
  assert.deepEqual(splitCells('a,"b, c","say ""hi""",e', ","), ["a", "b, c", 'say "hi"', "e"]);
  assert.deepEqual(splitCells("a\tb\t", "\t"), ["a", "b", ""]);
});

test("our own export round-trips, and its TOTAL row is not a skipped line", () => {
  const text = [
    "name,set,number,condition,foil,quantity,unit_usd,value_usd",
    '"Jinx, Loose Cannon",OGN,001/298,NM,no,3,1.20,3.60',
    "Poppy,UNL,178a/219,LP,yes,1,9.00,7.65",
    "TOTAL,,,,,,,11.25",
  ].join("\n");
  const r = parseCollectionCsv(text)!;
  assert.ok(r);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(
    r.rows.map((x) => [x.setCode, x.key, x.qty, x.isFoil, x.condition]),
    [["OGN", "1", 3, false, "NM"], ["UNL", "178a", 1, true, "LP"]],
  );
});

test("header words are recognised in any case and order, and tab or semicolon files work", () => {
  const tsv = "Qty\tSet Code\tCollector Number\tFinish\n2\tsfd\t101\tFoil\n1\tSFD\t101/221\tNormal";
  const r = parseCollectionCsv(tsv)!;
  assert.deepEqual(r.rows.map((x) => [x.setCode, x.key, x.qty, x.isFoil]), [["SFD", "101", 2, true], ["SFD", "101", 1, false]]);
  const semi = parseCollectionCsv("set;number;quantity\nOGN;5;4")!;
  assert.deepEqual(semi.rows.map((x) => [x.setCode, x.key, x.qty]), [["OGN", "5", 4]]);
});

test("set names and slugs resolve as well as codes; an unknown set is a skipped line", () => {
  assert.equal(resolveSetCode("OGN"), "OGN");
  assert.equal(resolveSetCode("Origins"), "OGN");
  assert.equal(resolveSetCode("spiritforged"), "SFD");
  assert.equal(resolveSetCode("Unleashed"), "UNL");
  assert.equal(resolveSetCode("Nope"), null);
  const r = parseCollectionCsv("set,number\nZZZ,1")!;
  assert.equal(r.rows.length, 0);
  assert.match(r.skipped[0].reason, /set "ZZZ" is not one we track/);
  assert.equal(r.skipped[0].line, 2);
});

test("finish: foil and normal words; anything else is skipped with a reason, never guessed", () => {
  const r = parseCollectionCsv("set,number,finish\nOGN,1,foil\nOGN,2,Non-Foil\nOGN,3,\nOGN,4,rainbow")!;
  assert.deepEqual(r.rows.map((x) => x.isFoil), [true, false, false]);
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0].reason, /finish "rainbow" not understood/);
});

test("quantity: blank is one, bad values are skipped, 999 is the ceiling", () => {
  const r = parseCollectionCsv("set,number,quantity\nOGN,1,\nOGN,2,0\nOGN,3,-1\nOGN,4,1.5\nOGN,5,abc\nOGN,6,5000")!;
  assert.deepEqual(r.rows.map((x) => [x.key, x.qty]), [["1", 1], ["6", 999]]);
  assert.equal(r.skipped.length, 4);
  assert.ok(r.skipped.every((s) => /quantity/.test(s.reason)));
});

test("condition maps to our five grades; blank is Near Mint quietly, an unreadable one is Near Mint and counted", () => {
  const r = parseCollectionCsv("set,number,condition\nOGN,1,Lightly Played\nOGN,2,MP\nOGN,3,\nOGN,4,Pristine")!;
  assert.deepEqual(r.rows.map((x) => x.condition), ["LP", "MP", "NM", "NM"]);
  assert.equal(r.conditionDefaulted, 1, "only the unreadable one, not the blank cell");
});

test("the same printing, finish and condition on two lines is one entry; a different finish is its own", () => {
  const r = parseCollectionCsv("set,number,foil,qty\nOGN,001/298,no,1\nOGN,1,no,2\nOGN,1,yes,1")!;
  assert.deepEqual(r.rows.map((x) => [x.key, x.isFoil, x.qty]), [["1", false, 3], ["1", true, 1]]);
});

test("missing set or number, and unreadable numbers, are skipped with the line number", () => {
  const r = parseCollectionCsv("set,number\n,5\nOGN,\nOGN,abc\nOGN,7")!;
  assert.deepEqual(r.rows.map((x) => x.key), ["7"]);
  assert.deepEqual(r.skipped.map((s) => [s.line, s.reason.split(" ")[0]]), [[2, "no"], [3, "no"], [4, "collector"]]);
});

test("a file is only a printing CSV when its header names a set and a number; a name list is not", () => {
  assert.equal(parseCollectionCsv("3 Jinx, Loose Cannon\n2 Vayne, Hunter"), null);
  assert.equal(parseCollectionCsv("name,quantity\nJinx,3"), null, "no set or number: the name path handles it");
  assert.equal(parseCollectionCsv("set,quantity\nOGN,3"), null, "a set alone does not name a printing");
  assert.equal(parseCollectionCsv(""), null);
  assert.equal(parseCollectionCsv("\n\n"), null);
});

test("nothing is dropped silently past the line limit: the rest are reported", () => {
  const body = Array.from({ length: CSV_LINE_CAP + 3 }, (_, i) => `OGN,${i + 1}`).join("\n");
  const r = parseCollectionCsv(`set,number\n${body}`)!;
  assert.equal(r.rows.length, CSV_LINE_CAP);
  assert.equal(r.skipped.length, 3);
  assert.match(r.skipped[0].reason, /limit for one import/);
});

test("a BOM and CRLF line endings are tolerated", () => {
  const r = parseCollectionCsv("﻿set,number,qty\r\nOGN,1,2\r\n")!;
  assert.deepEqual(r.rows.map((x) => [x.key, x.qty]), [["1", 2]]);
});

// ── Matching to the catalogue ───────────────────────────────────────────────

const cat = [
  { id: "base", setCode: "OGN", collectorNumber: "193/298", isPromo: false },
  { id: "alt", setCode: "OGN", collectorNumber: "193a/298", isPromo: false },
  { id: "promo", setCode: "OGN", collectorNumber: "193/298", isPromo: true },
  { id: "sig", setCode: "OGN", collectorNumber: "301*/298", isPromo: false },
  { id: "sfd", setCode: "SFD", collectorNumber: "193/221", isPromo: false },
];

test("each line lands on the printing it names: base, alt-art and Signature are three different cards", () => {
  const r = parseCollectionCsv("set,number\nOGN,193\nOGN,193a\nOGN,301*\nSFD,193\nOGN,999")!;
  const m = matchCsvRows(r.rows, cat);
  assert.deepEqual(m.matched.map((x) => x.card.id), ["base", "alt", "sig", "sfd"], "never the promo, never a different set's card");
  assert.equal(m.unmatched.length, 1);
  assert.match(m.unmatched[0].reason, /OGN 999 is not a printing we track/);
});

test("a promo is never the target even when it is listed first", () => {
  const m = matchCsvRows(parseCollectionCsv("set,number\nOGN,193")!.rows, [cat[2], cat[0]]);
  assert.equal(m.matched[0].card.id, "base");
});

// ── The route ───────────────────────────────────────────────────────────────

test("the import route takes the CSV path before the name path, and keeps the free limit and the guarded writes", () => {
  const c = code("src/app/api/collection/import/route.ts");
  assert.ok(c.indexOf("parseCollectionCsv(text)") < c.indexOf("parseDeckList(text)"), "a printing CSV never falls into the name matcher");
  const path = c.slice(c.indexOf("async function importPrintings"));
  assert.match(path, /matchCsvRows\(csv\.rows, catalogue\)/);
  assert.ok(path.indexOf("portfolioAllowance(") < path.indexOf("addCopies("), "the free limit is applied before any write");
  assert.match(path, /isPromo: false/, "promos are not import targets");
  assert.match(path, /collectionRowStore\(prisma, key\)/);
  assert.match(path, /condition: m\.copy\.condition, isFoil: m\.copy\.isFoil/, "finish and condition are kept, not forced to NM non-foil");
  assert.match(path, /skippedCount/);
  assert.match(path, /skipped: \[\.\.\.csv\.skipped, \.\.\.unmatched\]\s*\.sort/, "every skipped line is reported, in file order");
  // Free for everyone: no tier gate anywhere in the route.
  assert.doesNotMatch(c, /isPremium\(|premiumTier|402/);
});

test("the import UI says what a CSV needs and lists what was skipped", () => {
  const c = read("src/components/MyCollection.tsx");
  assert.match(c, /set, collector number, finish and quantity/);
  assert.match(c, /Skipped \{result\.skippedCount/);
  assert.match(c, /had a condition we could not read and went in as Near Mint/);
});

// ── Review fixes (2026-09-29) ────────────────────────────────────────────────

test("Vendetta's Crystal Roses (SP1 to SP6) import: the number is understood in every spelling and matches the catalogue", () => {
  assert.equal(numberKey("SP1"), "sp1");
  assert.equal(numberKey("sp01"), "sp1");
  assert.equal(numberKey("SP1/6"), "sp1");
  assert.equal(numberKey("VEN-SP1"), "sp1");
  assert.equal(numberKey("ven sp6"), "sp6");
  assert.equal(numberKey("OGN-001"), "1", "the prefix strip still works for plain numbers");
  const r = parseCollectionCsv("set,number,quantity\nVEN,SP1,1\nVEN,VEN-SP2,2\nVEN,SPX,1")!;
  assert.deepEqual(r.rows.map((x) => [x.setCode, x.key, x.qty]), [["VEN", "sp1", 1], ["VEN", "sp2", 2]]);
  assert.equal(r.skippedCount, 1, "a number that is not a printing is still reported");
  assert.match(r.skipped[0].reason, /not understood/);
  const m = matchCsvRows(r.rows, [
    { id: "rose1", setCode: "VEN", collectorNumber: "SP1" },
    { id: "rose2", setCode: "VEN", collectorNumber: "SP2/6" },
    { id: "base1", setCode: "VEN", collectorNumber: "001/200" },
  ]);
  assert.deepEqual(m.matched.map((x) => x.card.id), ["rose1", "rose2"]);
  assert.equal(m.unmatched.length, 0);
});

test("a huge file allocates only a bounded skip list, and still counts every skipped line", () => {
  const body = Array.from({ length: CSV_LINE_CAP + 5000 }, (_, i) => `OGN,${i + 1}`).join("\n");
  const r = parseCollectionCsv(`set,number\n${body}`)!;
  assert.equal(r.rows.length, CSV_LINE_CAP);
  assert.equal(r.skippedCount, 5000, "every line past the cap is counted");
  assert.ok(r.skipped.length <= 500, "but only a bounded number is stored");
  assert.match(r.skipped[0].reason, /limit for one import/);
});

test("the import route bounds its input and its run: a size ceiling, a function budget, bounded writes, and a report of what was not reached", () => {
  const c = code("src/app/api/collection/import/route.ts");
  assert.match(c, /export const maxDuration = 60;/);
  assert.match(c, /MAX_TEXT_CHARS = 500_000/);
  assert.match(c, /text\.length > MAX_TEXT_CHARS[\s\S]*status: 413/);
  assert.ok(c.indexOf("text.length > MAX_TEXT_CHARS") < c.indexOf("parseCollectionCsv(text)"), "the size check runs before any parsing");
  const path = c.slice(c.indexOf("async function importPrintings"));
  assert.match(c, /WRITE_CONCURRENCY = 8/);
  assert.match(path, /Promise\.all\(/);
  assert.match(path, /Date\.now\(\) > deadline[\s\S]*failed\.push\(labelOf\(m\)\)/, "out of time: the lines not reached are reported, not written and not lost");
  assert.match(path, /failedCount: failed\.length/);
  assert.match(path, /skippedCount: csv\.skippedCount \+ unmatched\.length/);
  const ui = read("src/components/MyCollection.tsx");
  assert.match(ui, /failedCount/);
  assert.match(ui, /f\.size <= 500_000/, "the client picker holds the same 500 KB line");
});
