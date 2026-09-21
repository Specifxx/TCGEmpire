import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RELEASES } from "../src/lib/release-calendar";
import { ARTICLES } from "../src/lib/articles";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Riot's own product/set rundown (playriftbound.com/en-us/news/announcements/
// products-and-sets-into-2027, checked 1 Sep 2026) states Radiance's card count
// flatly — "Cards: 180 (66 Showcase)" — with no "approximately" and no "subject
// to change", corroborated by independent secondary coverage ("180 cards,
// including 66 Showcase cards"). The site had been carrying it as
// approxCards: true since before that confirmation, which rendered "~180
// cards" / "around 180 cards" everywhere the figure appeared — out of date by
// 1 Sep 2026. This file pins the correction so a future edit doesn't quietly
// reintroduce the hedge.
//
// SUPERSEDED IN PART, 2026-09-19 — the hedge ban stands, the NUMBER moved. The
// first real Radiance card surfaced (Neeko, Blending In; see
// prisma/manual-cards.json) and it is printed "RAD - 167/167 - EN". A
// denominator printed on a card outranks a figure in an announcement, so
// RELEASES.cards and SETS.totalCards are both 167 now — the base numbered run,
// which is what those fields mean for every other set in the list (Vendetta's
// 166 is the number printed on its cards).
//
// The two figures are NOT reconciled, and this comment is the honest record of
// that: Riot said "180 (66 Showcase)" and read inclusively that implies a
// 114-card base, which is exactly the guess lib/price-import.ts's setFromTotal()
// carried and which the printed card disproves. 167 + 13 = 180 is arithmetic,
// not an explanation. What is certain is the printed 167; what is unresolved is
// what Riot's 180 was counting. Prose therefore reports BOTH — the announcement
// and the printed number — instead of picking one and calling it confirmed.
//
// Legacy and The Reckoning are deliberately NOT touched here, even though
// Riot's same rundown states their counts just as flatly ("346 (93 Showcase)",
// "264 (67 Showcase)") — they're far enough out (Jan/Apr 2027) that
// re-verifying them wasn't in scope for this fix. Their continued
// approxCards: true is not itself a bug this file is asserting against.
// ─────────────────────────────────────────────────────────────────────────────

test("Radiance's card count is confirmed, not approximate, and the note carries the Showcase detail", () => {
  const radiance = RELEASES.find((r) => r.code === "RAD");
  assert.ok(radiance, "expected a Radiance entry in RELEASES");
  assert.ok(
    !radiance!.approxCards,
    "the count is a real published/printed figure, not an estimate — approxCards must be false/absent",
  );
  // 167, from the card itself. Was 180 (Riot's announcement) until 2026-09-19.
  assert.equal(radiance!.cards, 167);
  assert.match(
    radiance!.note,
    /66/,
    "the note should still carry the Showcase-card detail Riot published alongside its own total",
  );
  // Both numbers survive in the note, because they genuinely disagree and the
  // reader is better served by the disagreement than by a confident wrong one.
  assert.match(radiance!.note, /180/, "the note must still report Riot's announced total");
  assert.match(radiance!.note, /167\/167/, "…and the number actually printed on a card");
});

test("the printed denominator routes to RAD in BOTH setFromTotal copies, and the disproved guesses are gone", () => {
  // This is the half with teeth. setFromTotal maps a bare "042/167" listing to a
  // set; with no entry, resolveCardId falls through to its OGN default and prices
  // a Radiance card as an ORIGINS one. Both copies are checked because the twin
  // switches have drifted before (tests/set-launch-readiness.test.ts guards the
  // pair generally; this guards the specific number).
  for (const f of ["src/lib/price-import.ts", "src/lib/tcgplayer.ts"]) {
    const src = read(f);
    assert.match(src, /case 167: return "RAD";/, `${f} must route the printed Radiance denominator`);
    assert.doesNotMatch(src, /case 114:/, `${f} still carries the disproved 114 guess`);
    assert.doesNotMatch(src, /case 180: return "RAD"/, `${f} still carries the disproved 180 guess`);
  }
});

test("no article hedges Radiance's card count with '~180' / 'around 180' / 'roughly 180' anymore", () => {
  const problems: string[] = [];
  for (const a of ARTICLES) {
    const text = `${a.excerpt}\n${(a.summary ?? []).join("\n")}\n${a.body}\n${(a.faq ?? [])
      .map((f) => `${f.q}\n${f.a}`)
      .join("\n")}`;
    for (const m of text.matchAll(/(~|around|roughly)\s*180\b/gi)) {
      const start = Math.max(0, m.index! - 60);
      const window = text.slice(start, m.index! + 60);
      // Scope to windows actually about Radiance — a bare "180" hedge elsewhere
      // (there isn't one today) shouldn't be conflated with this specific fix.
      if (/radiance/i.test(window)) {
        problems.push(`${a.slug}: "${m[0]}" — …${window.replace(/\s+/g, " ").trim()}…`);
      }
    }
  }
  assert.deepEqual(problems, [], `Radiance's card count is confirmed — these still hedge it:\n${problems.join("\n")}`);
});

test("the release-dates FAQ template makes no claim about where Showcase sits in the numbering", () => {
  // Origins/Spirit Forged/Unleashed: Showcase is a genuinely ADDITIONAL alt-art
  // printing of a card that already exists in the base numbering. This claim was
  // dropped from the shared template when Riot's "180 (66 Showcase)" looked
  // INCLUSIVE, which would have made Radiance the exception.
  //
  // 2026-09-19: the printed 167/167 suggests Radiance is not an exception after
  // all — a 167 base with Showcase numbered above it is the older sets' shape.
  // The assertion still stands anyway, and deliberately: one generic sentence
  // also has to describe Legacy and The Reckoning, whose splits are still only
  // announcement figures, and re-adding a numbering claim on the strength of one
  // card would be trading a known-safe silence for an inference.
  const src = read("src/app/release-dates/page.tsx");
  assert.doesNotMatch(src, /cards in the base set/);
  assert.doesNotMatch(src, /on top of the base numbering/);
});
