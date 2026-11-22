import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CURRENT_GIVEAWAY as G } from "../src/lib/giveaway";
import {
  GIVEAWAY_PROMPT_GAP_MS,
  GIVEAWAY_PROMPT_MAX_SHOWS,
  freshPromptState,
  markDone,
  markShown,
  parsePromptState,
  shouldShowGiveawayPrompt,
} from "../src/lib/giveaway-prompt";

const open = Date.parse(G.opensAt) + 86_400_000;
const visit = { pages: 2, otherPromptShown: false };

test("giveaway card: never on the first page of a visit, never in a visit another prompt took", () => {
  const s = freshPromptState();
  assert.equal(shouldShowGiveawayPrompt(s, open, "/card/x", { pages: 1, otherPromptShown: false }), false);
  assert.equal(shouldShowGiveawayPrompt(s, open, "/card/x", { pages: 3, otherPromptShown: true }), false);
  assert.equal(shouldShowGiveawayPrompt(s, open, "/card/x", visit), true);
});

test("giveaway card: not on the home page (its banner), the giveaway, account, Premium or admin pages", () => {
  const s = freshPromptState();
  for (const p of ["/", "/giveaway", "/account", "/premium", "/sign-in", "/admin/giveaway"]) {
    assert.equal(shouldShowGiveawayPrompt(s, open, p, visit), false, p);
  }
});

test("giveaway card: at most three times, two days apart, and never after Don't show again or an entry", () => {
  let s = markShown(freshPromptState(), open);
  assert.equal(shouldShowGiveawayPrompt(s, open + 3_600_000, "/sets", visit), false);
  assert.equal(shouldShowGiveawayPrompt(s, open + GIVEAWAY_PROMPT_GAP_MS, "/sets", visit), true);
  for (let i = 1; i < GIVEAWAY_PROMPT_MAX_SHOWS; i++) s = markShown(s, open);
  assert.equal(shouldShowGiveawayPrompt(s, open + 10 * GIVEAWAY_PROMPT_GAP_MS, "/sets", visit), false);
  assert.equal(shouldShowGiveawayPrompt(markDone(freshPromptState()), open, "/sets", visit), false);
});

test("giveaway card: only while the giveaway is open; a new giveaway starts fresh", () => {
  const s = freshPromptState();
  assert.equal(shouldShowGiveawayPrompt(s, Date.parse(G.closesAt) + 1000, "/sets", visit), false);
  assert.equal(shouldShowGiveawayPrompt(s, Date.parse(G.opensAt) - 1000, "/sets", visit), false);
  assert.deepEqual(parsePromptState(JSON.stringify({ key: "old", shows: 3, lastShownAt: 1, done: true })), freshPromptState());
  assert.deepEqual(parsePromptState("not json"), freshPromptState());
});

test("the rating card stands down in a visit the giveaway card took, and the home page carries the banner", () => {
  assert.match(readFileSync("src/components/RateUsPrompt.tsx", "utf8"), /GIVEAWAY_PROMPT_SESSION_KEY/);
  assert.match(readFileSync("src/app/page.tsx", "utf8"), /<GiveawayHomeBanner \/>/);
  assert.match(readFileSync("src/app/layout.tsx", "utf8"), /<GiveawayPrompt \/>/);
});
