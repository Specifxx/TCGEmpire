import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { LANGUAGE_SIGNAL } from "../src/lib/ebay";

// ─────────────────────────────────────────────────────────────────────────────
// The T1 2025 Worlds Champion Signature Edition ships in three languages
// (English/Chinese/Korean), sold only via a Riot Merch Store drawing — no store
// or TCGplayer will ever list it, so eBay resale is the ONLY price these three
// groups can ever have.
//
// The trap: every OTHER sealed eBay search deliberately excludes Chinese/
// Japanese/Korean listings (SEALED_EXCLUDE_EBAY's language words, isForeignListing's
// CJK/CN-location check) — correct everywhere else, but exactly backwards for the
// CN/KR editions of THIS product, where that is the listing being searched for.
// searchEbaySealed's `language` param swaps that guard from EXCLUDE to REQUIRE;
// these tests pin the swap itself and the seed/image wiring around it, since a
// silent regression here reads as "no results" forever, never as an error.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("LANGUAGE_SIGNAL matches realistic CN/KR listing titles, English or native script", () => {
  const cnTitles = [
    "Riftbound T1 2025 World Champion Signature Edition Chinese Version Sealed NEW",
    "T1 冠军签名版礼盒 Riftbound Sealed",
    "Riftbound x T1 Worlds Signature Set (Simplified Chinese) SEALED",
  ];
  for (const t of cnTitles) assert.ok(LANGUAGE_SIGNAL.CN.test(t), `CN should match: ${t}`);

  const krTitles = [
    "Riftbound T1 Worlds Signature Edition Korean Ver Sealed",
    "T1 시그니처 에디션 한국어판 미개봉",
    "Riftbound x T1 2025 Worlds Champion (Korean Version) NEW",
  ];
  for (const t of krTitles) assert.ok(LANGUAGE_SIGNAL.KR.test(t), `KR should match: ${t}`);
});

test("LANGUAGE_SIGNAL does not fire on a plain English listing", () => {
  const enTitles = [
    "Riftbound T1 2025 Worlds Champion Signature Edition NEW SEALED",
    "T1 Signature Edition Box English Ships Fast",
  ];
  for (const t of enTitles) {
    assert.equal(LANGUAGE_SIGNAL.CN.test(t), false, `CN should not match: ${t}`);
    assert.equal(LANGUAGE_SIGNAL.KR.test(t), false, `KR should not match: ${t}`);
  }
});

test("CN and KR signals don't cross-match each other's language", () => {
  assert.equal(LANGUAGE_SIGNAL.CN.test("T1 시그니처 에디션 한국어판"), false);
  assert.equal(LANGUAGE_SIGNAL.KR.test("T1 冠军签名版礼盒"), false);
});

test("searchEbaySealed actually consults `language` for both swapped filters", () => {
  // A source-grep, not a network test: searchEbaySealed calls the real eBay API,
  // which is unreachable in this suite (isEbayEnabled() is false with no creds
  // configured). The wiring itself is what regresses silently, so pin that
  // instead — the same style tests/sealed-images.test.ts and ebay-value-floor.test.ts
  // already use for this file's other private filter internals.
  const src = read("src/lib/ebay.ts");
  assert.match(
    src,
    /\(language \? SEALED_EXCLUDE_EBAY_BASE : SEALED_EXCLUDE_EBAY\)\.test/,
    "the exclude-word filter must skip the language-word branch when `language` is set",
  );
  assert.match(
    src,
    /language \? LANGUAGE_SIGNAL\[language\]\.test\(it\.title/,
    "a language search must REQUIRE the signal, not just skip isForeignListing",
  );
  // The two lists must still cover the exact same ground for every OTHER search
  // (language undefined) — i.e. the split didn't quietly drop a word.
  assert.match(src, /SEALED_EXCLUDE_EBAY = new RegExp\(\s*`\$\{SEALED_EXCLUDE_EBAY_BASE\.source\}\|\$\{SEALED_EXCLUDE_LANGUAGE_WORDS\.source\}`/);
  assert.match(src, /SEALED_EXCLUDE_LANGUAGE_WORDS = \/chinese\|japanese\|korean\/i/);
});

test("T1_SEEDS defines exactly the three language groups, CN/KR (and only those) flagged", () => {
  const src = read("src/lib/sealed-import.ts");
  const start = src.indexOf("const T1_SEEDS");
  const end = src.indexOf("const haveKeys");
  assert.ok(start > 0 && end > start, "could not bound T1_SEEDS");
  const block = src.slice(start, end);

  for (const key of ["T1S|T1 Signature Edition|EN", "T1S|T1 Signature Edition|CN", "T1S|T1 Signature Edition|KR"]) {
    assert.ok(block.includes(key), `T1_SEEDS must define ${key}`);
  }
  assert.match(block, /groupKey: "T1S\|T1 Signature Edition\|CN"[\s\S]{0,250}?language: "CN"/);
  assert.match(block, /groupKey: "T1S\|T1 Signature Edition\|KR"[\s\S]{0,250}?language: "KR"/);
  // EN must NOT carry a language override — it keeps the default
  // "reject anything foreign-looking" behaviour every other search has.
  const enEntry = block.slice(block.indexOf('"T1S|T1 Signature Edition|EN"'), block.indexOf('"T1S|T1 Signature Edition|CN"'));
  assert.doesNotMatch(enEntry, /language:/);

  // setCode must be null for all three — see the comment above T1_SEEDS: a real
  // "T1S" setCode would arm searchEbaySealed's setName filter and demand a
  // listing literally say "T1S", which no seller ever writes.
  assert.equal((block.match(/setCode: null/g) ?? []).length, 3, "all three T1 seeds must pass setCode: null");
});

test("T1_SEEDS are wired into the search list and passed to searchEbaySealed", () => {
  const src = read("src/lib/sealed-import.ts");
  assert.match(src, /\.\.\.T1_SEEDS\.filter\(\(s\) => !haveKeys\.has\(s\.groupKey\)\)/);
  assert.match(src, /searchEbaySealed\(g\.name, g\.productType, g\.setCode, g\.referenceCents, mkt\.marketplace, g\.language\)/);
});

test("every T1 group has a curated image AND a clean display name, keyed identically", () => {
  const src = read("src/lib/sealed-import.ts");
  const imgStart = src.indexOf("const T1_GROUP_IMAGE");
  const nameEnd = src.indexOf("const T1_GROUP_NAME") + src.slice(src.indexOf("const T1_GROUP_NAME")).indexOf("};") + 2;
  const block = src.slice(imgStart, nameEnd);
  const keys = ["T1S|T1 Signature Edition|EN", "T1S|T1 Signature Edition|CN", "T1S|T1 Signature Edition|KR"];
  for (const key of keys) {
    const count = block.split(`"${key}"`).length - 1;
    assert.equal(count, 2, `${key} must appear once in T1_GROUP_IMAGE and once in T1_GROUP_NAME`);
  }
  // The override loop must apply BOTH maps, and must win unconditionally (rank 0)
  // rather than only filling in a missing image — this is what makes it stronger
  // than the ordinary "missing image" fallback the type-correct graphics use.
  assert.match(src, /const img = T1_GROUP_IMAGE\[g\.groupKey\]/);
  assert.match(src, /const name = T1_GROUP_NAME\[g\.groupKey\]/);
});

test("every curated T1 image file actually exists on disk", () => {
  const src = read("src/lib/sealed-import.ts");
  const paths = Array.from(src.matchAll(/"\/t1-worlds-cards\/t1-signature-edition-box-(?:en|cn|kr)\.jpg"/g)).map((m) => m[0].slice(1, -1));
  assert.equal(paths.length, 3, "expected exactly 3 references (T1_GROUP_IMAGE's 3 entries)");
  for (const p of paths) {
    assert.ok(existsSync(join(process.cwd(), "public", p)), `missing file for ${p}`);
  }
});
