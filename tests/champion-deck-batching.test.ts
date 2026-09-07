import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// champions/[slug] used to resolve its "decks built around this champion" shelf
// with `Promise.all(deckSeeds.map((d) => resolveDeck(d, country)))` — one
// buildCardMap() query PER matching deck, the exact per-item-query shape
// lib/meta-decks.ts's own header comment says resolveAllDecks() exists to avoid
// ("resolving each card individually would fire ~100 queries per page").
// META_DECKS is small (~10 entries) so this was never an outage risk in
// practice, but it's the same pattern this file avoids everywhere else, and a
// champion page is rendered for all 87 champions — no reason for a new call
// site to reintroduce a fan-out the rest of the file was built to prevent.
//
// Fixed by adding resolveDecks() (batches ONE buildCardMap() call over a
// caller-chosen subset, same shape as resolveAllDecks() but not hardcoded to
// every META_DECKS entry) and switching the champion page to call it instead.
// ─────────────────────────────────────────────────────────────────────────────

test("resolveDecks batches one buildCardMap query over a subset, not one per deck", () => {
  const src = read("src/lib/meta-decks.ts");
  const fnAt = src.indexOf("export async function resolveDecks(");
  assert.ok(fnAt >= 0, "expected resolveDecks to exist alongside resolveDeck/resolveAllDecks");
  const body = src.slice(fnAt, fnAt + 500);
  // Exactly one buildCardMap call in the function body, built from ALL seeds'
  // names up front — not one call per seed.
  const calls = body.match(/buildCardMap\(/g) ?? [];
  assert.equal(calls.length, 1, "resolveDecks must call buildCardMap exactly once, not per-deck");
  assert.match(body, /seeds\.flatMap/, "must flatten every seed's card names into ONE buildCardMap call");
});

test("the champion page's deck shelf uses the batched resolver, not a per-deck fan-out", () => {
  const src = read("src/app/champions/[slug]/page.tsx");
  assert.match(src, /\bresolveDecks\(/, "expected the champion page to call the batched resolveDecks()");
  assert.doesNotMatch(
    src,
    /Promise\.all\(\s*deckSeeds\.map\(\s*\(?d\)?\s*=>\s*resolveDeck\(/,
    "must not resolve deckSeeds with one resolveDeck() call per item — that is the fan-out this test guards against",
  );
});
