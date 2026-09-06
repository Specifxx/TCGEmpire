import test from "node:test";
import assert from "node:assert/strict";
import { clampText } from "../src/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// clampText() is the shared truncation rule behind every SERP-facing
// description (blog posts, card pages) — a live 2026-08-31 re-check still
// found one over Google's ~155-160 char SERP truncation point despite the
// DESCRIPTION_MAX guard already being wired in. The cause: clampText's OWN
// fallback branch (no good word boundary near the end) appended "…" to a
// cut that was already exactly `max` characters, overshooting by 1 every
// time it fired — the word-boundary branch never had this bug because
// `lastSpace` is always < max, leaving room for the ellipsis by construction.
// ─────────────────────────────────────────────────────────────────────────────

test("never exceeds max, even down the no-good-word-boundary fallback path", () => {
  // One giant word with no space anywhere near the cut point — forces the
  // fallback branch (lastSpace <= max * 0.6) exactly the way a real excerpt
  // with a long unbroken run (a URL, a hyphenless compound) could.
  const longWord = "x".repeat(200);
  const out = clampText(`Start ${longWord}`, 155);
  assert.ok(out.length <= 155, `expected <= 155, got ${out.length}: ${out}`);
  assert.ok(out.endsWith("…"));
});

test("never exceeds max down the normal word-boundary path", () => {
  const prose =
    "Twelve Ahri printings across three cards, from US$8.95 to US$3,420.28 " +
    "— including two prints that look identical except for a signature worth US$3,046.";
  const out = clampText(prose, 155);
  assert.ok(out.length <= 155, `expected <= 155, got ${out.length}: ${out}`);
});

test("short text passes through unchanged, no ellipsis added", () => {
  assert.equal(clampText("A short description.", 155), "A short description.");
});

test("truncates at a word boundary when one exists past the 60% mark", () => {
  const out = clampText("The quick brown fox jumps over the lazy dog and keeps running", 40);
  assert.ok(out.length <= 40);
  assert.ok(out.endsWith("…"));
  assert.ok(!out.slice(0, -1).endsWith(" "), "must not leave a trailing space before the ellipsis");
});

test("strips trailing punctuation before the ellipsis, doesn't double up", () => {
  const out = clampText("First sentence. Second sentence, with a trailing clause here", 22);
  assert.ok(out.length <= 22, `expected <= 22, got ${out.length}: ${out}`);
  assert.ok(!/[,;:.\s]…$/.test(out), `must not leave dangling punctuation before the ellipsis: ${out}`);
});

test("collapses internal whitespace before measuring", () => {
  assert.equal(clampText("Multiple   spaces\n\nand newlines", 155), "Multiple spaces and newlines");
});

// Regression pin for the exact bug shape: exhaustively check every length
// near the boundary for a run of long, space-free text, since the original
// bug only fired for specific max values relative to word length.
test("regression: no off-by-one overshoot across a range of max values", () => {
  const text = "Word " + "y".repeat(300);
  for (let max = 50; max <= 200; max += 7) {
    const out = clampText(text, max);
    assert.ok(out.length <= max, `max=${max} produced length ${out.length}: ${out}`);
  }
});
