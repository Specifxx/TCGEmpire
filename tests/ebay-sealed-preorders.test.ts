import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SRC = "src/lib/sealed-import.ts";

// ─────────────────────────────────────────────────────────────────────────────
// eBay sealed search used to run against getSealedGroups() only — shipped sets
// — so a set in its pre-order window (Radiance: 23 Oct 2026) got store-scrape
// and TCGplayer coverage on /radiance-preorders but no eBay search, even though
// real pre-order listings exist there (reported directly; eBay's own keyword
// table already carries Radiance-specific entries — SEALED_TYPE_KW's Vault and
// Showdown Decks — suggesting this exact gap was anticipated but never closed).
// Pin that both eBay call sites now search the union of shipped AND pre-order
// groups, not shipped alone.
// ─────────────────────────────────────────────────────────────────────────────

test("refreshEbaySealedMarket searches pre-order groups too, not shipped groups alone", () => {
  const code = codeOnly(read(SRC));
  const fnAt = code.indexOf("async function refreshEbaySealedMarket(");
  assert.ok(fnAt >= 0, "expected to find refreshEbaySealedMarket");
  const groupsAt = code.indexOf("const groups =", fnAt);
  assert.ok(groupsAt >= 0 && groupsAt < fnAt + 1200, "expected a groups assignment near the top of the function");
  const line = code.slice(groupsAt, code.indexOf("\n", groupsAt));

  assert.match(line, /getSealedGroups\(mkt\.country\)/, "must still search shipped groups");
  assert.match(line, /getPreorderGroups\(mkt\.country\)/, "must also search pre-order groups");
});

test("the cross-market reference map is also built from pre-order groups, so a borrowed reference can cover an unreleased set", () => {
  const code = codeOnly(read(SRC));
  const buildAt = code.indexOf("const marketRefs = new Map");
  const loopAt = code.indexOf("for (const mkt of EBAY_SEALED_MARKETS) {\n        if (isEbayRateLimited())");
  assert.ok(buildAt >= 0 && loopAt > buildAt, "expected the marketRefs build block before the per-market loop");
  const buildBlock = code.slice(buildAt, loopAt);

  assert.match(buildBlock, /getSealedGroups\(m\.country\)/, "must still read shipped groups");
  assert.match(buildBlock, /getPreorderGroups\(m\.country\)/, "must also read pre-order groups");
});

test("getPreorderGroups is not imported — it's defined in this same module, like getSealedGroups", () => {
  // Both are declared further down sealed-import.ts and used earlier in the file
  // (function declarations hoist) — an import here would mean someone split
  // them into a different module without updating this call site.
  const code = codeOnly(read(SRC));
  assert.ok(!/import\s*\{[^}]*\bgetPreorderGroups\b/.test(code), "getPreorderGroups must not be imported from elsewhere");
  assert.match(code, /export async function getPreorderGroups\(/, "must still be declared locally");
});
