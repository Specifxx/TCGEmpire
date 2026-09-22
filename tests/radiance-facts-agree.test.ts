import test from "node:test";
import assert from "node:assert/strict";
import { ARTICLES } from "../src/lib/articles";
import {
  RADIANCE_LEGENDS_TOTAL,
  RADIANCE_LEGENDS_CONFIRMED,
  RADIANCE_LEGENDS_UNREVEALED,
} from "../src/lib/sets/radiance";

// ─────────────────────────────────────────────────────────────────────────────
// NO RADIANCE ARTICLE MAY CONTRADICT src/lib/sets/radiance.ts.
// ─────────────────────────────────────────────────────────────────────────────
// Added 2026-09-22, after writing the teaser post turned up two prose numbers
// that disagreed with the file whose own header calls itself "the single source
// of truth" for this set:
//
//   - riftbound-heartsteel-cards said Radiance carries TEN Legends. It carries
//     nine, and the tracker and what-we-know both said so.
//   - riftbound-radiance-what-we-know still said "five named, four not" — the
//     split from Riot's ORIGINAL Set 5 announcement. Orianna was confirmed later
//     at a PAX West livestream, which radiance.ts records explicitly as the
//     reason it carries six rather than five.
//
// Neither was caught by anything, because radiance.ts feeds /sets/radiance's
// modules and its FAQPage JSON-LD but nothing reads it back out of the prose.
// A hand-typed number in an article body is exactly where a set fact rots: the
// constant gets updated when a reveal lands and the sentence that quotes it does
// not.
//
// WORDS AS WELL AS DIGITS, because "nine" and "ten" are how the articles
// actually write these, and a digit-only check would have caught neither bug.
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const radianceArticles = () =>
  ARTICLES.filter((a) => /radiance/i.test(a.slug) || /Radiance/.test(a.body));

const asCount = (raw: string) => NUMBER_WORDS[raw.toLowerCase()] ?? Number(raw);

test("radiance.ts stays internally consistent", () => {
  assert.equal(
    RADIANCE_LEGENDS_CONFIRMED.length + RADIANCE_LEGENDS_UNREVEALED,
    RADIANCE_LEGENDS_TOTAL,
    "confirmed + unrevealed must equal the total",
  );
  // Named twice in the same file is how the 5-vs-6 drift started; a duplicate
  // name would silently inflate the confirmed count.
  const names = RADIANCE_LEGENDS_CONFIRMED.map((l) => l.name);
  assert.equal(new Set(names).size, names.length, `duplicate confirmed Legend: ${names.join(", ")}`);
});

test("no article states a Radiance Legend count that radiance.ts disagrees with", () => {
  // "N champion Legends" means one of two different numbers depending on the
  // words in front of it: the SET's total, or how many are confirmed so far.
  // "Riot has confirmed six new champion Legends" and "it brings nine new
  // champion Legends" are both correct and differ by three.
  //
  // The number is taken as the LAST one before the phrase, not the first in a
  // window. A first-match scan read "a confirmed 180 cards (66 Showcase) and
  // five new champion Legends" as claiming 66, which is neither number and hid
  // the real error sitting two words later.
  const NUM = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\b/gi;
  const CONFIRMED_CUE = /\bconfirmed\s+(?:\w+\s+){0,3}$|\bnamed\b|\brevealed\b|\bso far\b/i;

  for (const a of radianceArticles()) {
    for (const m of a.body.matchAll(/champion Legends/g)) {
      // The claim has to be ABOUT Radiance. Filtering articles by "mentions
      // Radiance somewhere" pulled in the Legacy spoilers post, whose "call it
      // twelve champion Legends" is a correct statement about Set 6.
      const sentence = a.body.slice(Math.max(0, m.index! - 220), m.index! + 60).split(/(?<=[.|\n])/).slice(-3).join("");
      if (!/Radiance/i.test(sentence)) continue;
      const before = a.body.slice(Math.max(0, m.index! - 60), m.index!);
      // Stop at a sentence or table-cell boundary so we never read a number
      // that belongs to a different clause.
      const clause = before.split(/[.|\n]/).pop() ?? "";
      const nums = [...clause.matchAll(NUM)];
      if (nums.length === 0) continue;
      const n = asCount(nums[nums.length - 1][1]);
      if (!Number.isFinite(n)) continue;
      // Cut the trailing look-ahead at the sentence end too. Reading 40 raw
      // characters past the phrase let "nine champion Legends. Six are
      // confirmed" be scored as a confirmed-count claim by the NEXT sentence.
      const after = (a.body.slice(m.index! + m[0].length, m.index! + m[0].length + 40).split(/[.|\n]/)[0] ?? "");
      const isConfirmed = CONFIRMED_CUE.test(clause) || /\bnamed so far\b|\bconfirmed\b/i.test(after);
      const expected = isConfirmed ? RADIANCE_LEGENDS_CONFIRMED.length : RADIANCE_LEGENDS_TOTAL;
      assert.equal(
        n,
        expected,
        `${a.slug}: "...${clause.trim()} champion Legends..." reads as the ${isConfirmed ? "confirmed" : "total"} count, but radiance.ts says ${expected}`,
      );
    }
  }
});

test("no article states a stale confirmed/unrevealed split", () => {
  const confirmed = RADIANCE_LEGENDS_CONFIRMED.length;
  const unrevealed = RADIANCE_LEGENDS_UNREVEALED;
  // The shape both bugs took: "(five named, four not)" and "and 4 unrevealed".
  const namedSplit = /\(\s*(five|six|seven|eight|nine|\d+)\s+named,\s*(five|four|three|two|one|\d+)\s+not\s*\)/gi;
  const unrevealedCount = /\b(five|four|three|two|one|\d+)\s+unrevealed\b/gi;

  for (const a of radianceArticles()) {
    for (const m of a.body.matchAll(namedSplit)) {
      assert.equal(asCount(m[1]), confirmed, `${a.slug}: "${m[0]}" — confirmed is ${confirmed}`);
      assert.equal(asCount(m[2]), unrevealed, `${a.slug}: "${m[0]}" — unrevealed is ${unrevealed}`);
    }
    for (const m of a.body.matchAll(unrevealedCount)) {
      assert.equal(
        asCount(m[1]),
        unrevealed,
        `${a.slug} says "${m[0]}" but radiance.ts says ${unrevealed} unrevealed`,
      );
    }
  }
});

test("every Legend radiance.ts confirms is spelled the same way in the articles", () => {
  // LINE-BASED, and only for lines that are actually enumerating. A sliding
  // character window produced both false positives ("Seraphine and Evelynn
  // headline the Showdown Deck" is prose, not a list) and false negatives (a
  // window that ended two words before Orianna). A line carrying four or more
  // of the six is unambiguously a list, and a list is allowed to be missing
  // none of them.
  const names = RADIANCE_LEGENDS_CONFIRMED.map((l) => l.name);
  let checked = 0;

  for (const a of ARTICLES) {
    for (const line of a.body.split("\n")) {
      const present = names.filter((n) => line.includes(n));
      if (present.length < 4) continue;
      checked++;
      const missing = names.filter((n) => !line.includes(n));
      assert.deepEqual(
        missing,
        [],
        `${a.slug} enumerates ${present.length} of the ${names.length} confirmed Radiance Legends and omits ${missing.join(", ")}: "${line.trim().slice(0, 170)}…"`,
      );
    }
  }
  assert.ok(checked > 0, "expected at least one article to enumerate the confirmed Legends");
});
