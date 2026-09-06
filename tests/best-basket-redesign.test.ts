import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// Best Basket redesign: search-and-pick a card is the primary interaction now,
// with the raw-decklist paste demoted to a secondary "advanced" option. The
// search widget lives in a shared CardSearch component so any flow that needs
// card lookup stays on one implementation instead of forking a second copy.
// ─────────────────────────────────────────────────────────────────────────────

test("CardSearch is a standalone reusable component with an onPick callback, not a navigate-away link", () => {
  const code = readCode("src/components/CardSearch.tsx");
  assert.match(code, /export function CardSearch/, "must be an exported component");
  assert.match(code, /onPick:\s*\(c:\s*SearchCard\)\s*=>\s*void/, "must expose a select callback");
  assert.match(code, /\/api\/search\?q=/, "must reuse the existing /api/search endpoint, no new backend needed");
  assert.doesNotMatch(code, /next\/link/, "a pick must select the card, not navigate via <Link>");
});

test("CardSearch supports keyboard arrow/enter selection (a gap in both prior implementations)", () => {
  const code = readCode("src/components/CardSearch.tsx");
  assert.match(code, /ArrowDown/, "must handle ArrowDown to move the active result");
  assert.match(code, /ArrowUp/, "must handle ArrowUp to move the active result");
  assert.match(code, /key === "Enter"/, "must handle Enter to pick the active result");
});

test("BestBasket's primary flow is search-and-add: CardSearch feeds a picked-card list with qty and remove", () => {
  const code = readCode("src/components/BestBasket.tsx");
  assert.match(code, /import \{ CardSearch, type SearchCard \} from "\.\/CardSearch"/, "must use the shared search-and-pick widget");
  assert.match(code, /function addCard/, "picking a result must add it to a basket line list");
  assert.match(code, /function removeCard/, "each picked line must be removable");
  assert.match(code, /function setQty/, "each picked line must have an editable quantity");
});

test("BestBasket's decklist textarea is demoted to a collapsed 'advanced' option, not the primary control", () => {
  const code = readCode("src/components/BestBasket.tsx");
  assert.match(code, /showPaste/, "the paste textarea must be gated behind a toggle, not always visible");
  assert.match(code, /Advanced: paste a decklist instead/, "the toggle must be labelled as the advanced/secondary path");
});

test("BestBasket still honours ?list= handoff links by auto-running the paste path", () => {
  const code = readCode("src/components/BestBasket.tsx");
  assert.match(code, /initialList/, "must still accept a deck-page handoff list");
  assert.match(code, /autoRan/, "must still guard the auto-run to fire once");
  assert.match(code, /setShowPaste\(true\)/, "the auto-run must reveal the paste panel the result actually lives in");
});

test("BestBasket's structured add-flow posts { lines } (exact card ids), never re-serialising picks back to text", () => {
  const code = readCode("src/components/BestBasket.tsx");
  const runLinesAt = code.indexOf("async function runLines(");
  assert.ok(runLinesAt >= 0, "expected a dedicated runLines function for the structured path");
  const body = code.slice(runLinesAt, runLinesAt + 700);
  assert.match(body, /JSON\.stringify\(\{ lines \}\)/, "must POST { lines }, not reconstruct a text blob from the picks");
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/basket accepts the new structured { lines: { cardId, qty }[] } body
// alongside the existing { text } path — resolving a pick by its exact id
// instead of re-running name-based resolution (which can only pick ONE
// printing per name and would silently discard the user's exact choice).
// ─────────────────────────────────────────────────────────────────────────────

test("the basket API accepts a structured lines[] body as an alternative to text", () => {
  const code = readCode("src/app/api/basket/route.ts");
  assert.match(code, /body\?\.lines/, "must read a structured lines[] field from the request body");
  assert.match(code, /pickedLines\.length/, "must branch on whether structured lines were provided");
});

test("the structured path resolves cards by exact id, not by name, so a chosen printing can't be swapped out", () => {
  const code = readCode("src/app/api/basket/route.ts");
  const ifAt = code.indexOf("if (pickedLines.length)");
  assert.ok(ifAt >= 0, "expected the structured branch");
  const body = code.slice(ifAt, ifAt + 700);
  assert.match(body, /where:\s*\{\s*id:\s*\{\s*in:/, "must look cards up by id, unlike the text path's nameNormalized resolution");
  assert.doesNotMatch(body, /nameNormalized/, "the structured branch must not fall back to name-based resolution");
});

test("the structured path clamps quantity server-side, same bounds as the paste-path's parser", () => {
  const code = readCode("src/app/api/basket/route.ts");
  assert.match(code, /Math\.max\(1,\s*Math\.min\(99,/, "qty must be clamped 1-99 server-side regardless of what the client sends");
});

test("the pre-existing text path is untouched: still requires a session, still parses via parseDeckList", () => {
  const code = readCode("src/app/api/basket/route.ts");
  assert.match(code, /if \(!user\) return NextResponse\.json\(/, "sign-in gate must still be first");
  assert.match(code, /parseDeckList\(text\)/, "the paste fallback must still go through the existing decklist parser");
  assert.match(code, /optimizeBasket\(basketCards, storesMap\)/, "both paths must converge on the same optimizer, unchanged");
});
