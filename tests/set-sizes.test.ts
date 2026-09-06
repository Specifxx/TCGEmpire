import test from "node:test";
import assert from "node:assert/strict";
import { ARTICLES } from "../src/lib/articles";

// Set sizes are stated across several articles, and they drifted: the sets-in-
// order guide claimed Spirit Forged had 222 base cards and Unleashed 225, while
// the Unleashed guide said 219 — a straight contradiction between two live pages.
//
// The tiebreaker is not our database, it is the card itself. Every Riftbound
// collector number is written "N/TOTAL", so TOTAL is the set's own printed size
// and a reader can check it on any single card. Verified against production for
// each set below: every card URL for a set carries one and only one denominator
// (1,070 card URLs sampled across the sitemap, zero exceptions).
//
// Printings ABOVE the total — Signatures, over-numbered chase cards, promos —
// are real cards but are not part of the base run. Counting them is what
// produced the wrong 222/225 figures in the first place.
const PRINTED_SET_TOTALS: Record<string, number> = {
  OGN: 298,
  SFD: 221,
  UNL: 219,
  VEN: 166,
};

// Sizes of sets that are ANNOUNCED but not yet printed — Radiance (~180, ships
// 23 Oct 2026) and Legacy (~346). These are real, citable figures that quite
// legitimately appear in prose right next to a shipped set's name ("a step up
// from Vendetta", "roughly double Radiance"), and the matcher below reads a
// number's nearest set name as its subject. Without this list an announced size
// beside a shipped set's name is reported as a claim about that shipped set.
//
// They are skipped rather than checked, deliberately: this test's stated
// tiebreaker is the denominator printed on a card, and an unreleased set has no
// card to read. Move an entry into PRINTED_SET_TOTALS above — and delete it from
// here — the moment its cards ship and that denominator becomes verifiable.
// Matched against the surrounding window, NOT applied as a blanket number skip:
// a bare `has(180)` would also excuse a genuine "Vendetta has 180 cards" error,
// which is exactly the class of mistake this file exists to catch.
const ANNOUNCED_UNPRINTED: { size: number; name: RegExp }[] = [
  { size: 180, name: /radiance/i },
  { size: 346, name: /legacy/i },
];

// Numbers that legitimately appear in prose and are NOT a base-set size: the
// Showcase runs quoted alongside each set, and totals-with-Showcase.
const NOT_A_SET_SIZE = new Set([54, 61, 66, 24, 352]);

test("no article states a base-set size that contradicts the printed total", () => {
  // Matches "a 219-card set", "219 base cards", "166 cards" etc. next to a set
  // name, which is the shape the contradiction took.
  const problems: string[] = [];
  const setNames: Record<string, RegExp> = {
    OGN: /origins/i,
    SFD: /spirit ?forged/i,
    UNL: /unleashed/i,
    VEN: /vendetta/i,
  };

  for (const a of ARTICLES) {
    const text = `${a.title}\n${a.excerpt}\n${(a.summary ?? []).join("\n")}\n${a.body}`;
    for (const [code, nameRe] of Object.entries(setNames)) {
      const expected = PRINTED_SET_TOTALS[code];
      // Look for "<number> base card" / "<number>-card" within a window that also
      // names this set, so we only judge claims actually about it.
      for (const m of text.matchAll(/(\d{2,4})[\s-]*(?:base )?cards?\b/gi)) {
        const n = Number(m[1]);
        if (NOT_A_SET_SIZE.has(n)) continue;
        // Only consider numbers that look like a set size at all.
        if (!Object.values(PRINTED_SET_TOTALS).includes(n) && n < 150) continue;
        const start = Math.max(0, m.index! - 90);
        const window = text.slice(start, m.index! + 40);
        // An announced-but-unprinted set's size, sitting next to a shipped set's
        // name because the sentence compares the two. Belongs to the announced
        // set, not to `code`.
        if (ANNOUNCED_UNPRINTED.some((s) => s.size === n && s.name.test(window))) continue;
        if (!nameRe.test(window)) continue;
        // This claim is about `code`. It must equal the printed total.
        if (n !== expected && Object.values(PRINTED_SET_TOTALS).includes(n)) {
          // The number is another set's size mentioned near this one — ambiguous, skip.
          continue;
        }
        if (n !== expected) {
          problems.push(`${a.slug}: "${m[0].trim()}" near "${code}" — printed total is ${expected}`);
        }
      }
    }
  }

  assert.deepEqual(problems, [], `set-size claims contradict the printed collector-number total:\n${problems.join("\n")}`);
});

test("the sets-in-order table uses the printed totals", () => {
  const a = ARTICLES.find((x) => x.slug === "riftbound-sets-in-order");
  assert.ok(a, "riftbound-sets-in-order must exist");
  // Table rows look like: | 3 | **Spirit Forged** | SFD | 221 (+66 Showcase) | — |
  for (const [code, total] of Object.entries(PRINTED_SET_TOTALS)) {
    const row = new RegExp(`\\|\\s*${code}\\s*\\|\\s*(\\d+)`).exec(a!.body);
    assert.ok(row, `no table row found for ${code}`);
    assert.equal(
      Number(row![1]),
      total,
      `${code} row says ${row![1]} but every ${code} card is numbered out of /${total}`,
    );
  }
});
