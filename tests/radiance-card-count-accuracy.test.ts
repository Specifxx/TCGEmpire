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
    "Riot published 180 (66 Showcase) as a final figure, not an estimate — approxCards must be false/absent",
  );
  assert.equal(radiance!.cards, 180);
  assert.match(
    radiance!.note,
    /66/,
    "the note should carry the Showcase-card detail Riot published alongside the total",
  );
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

test("the release-dates FAQ template no longer claims Showcase sits 'on top of the base numbering' — true for older sets, false for Radiance's inclusive 180", () => {
  // Origins/Spirit Forged/Unleashed: Showcase is a genuinely ADDITIONAL alt-art
  // printing of a card that already exists in the base numbering. Radiance's
  // Riot-published 180 already INCLUDES its 66 Showcase cards. A shared FAQ
  // template can't assert one relationship and be right about both, so the fix
  // dropped the specific "base set" / "on top of" claim rather than hard-coding
  // Radiance's split into a generic sentence that also has to describe whatever
  // set is `next` after it (Legacy, then The Reckoning).
  const src = read("src/app/release-dates/page.tsx");
  assert.doesNotMatch(src, /cards in the base set/);
  assert.doesNotMatch(src, /on top of the base numbering/);
});
