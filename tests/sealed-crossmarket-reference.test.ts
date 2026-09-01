import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SRC = "src/lib/sealed-import.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Reported directly: an AU-market sealed eBay listing for the Origins booster
// box priced as though it were the far-cheaper Chinese-print product. A market
// with NO local store/TCGplayer reference for a product used to fall back to
// the flat per-type SEALED_MIN_CENTS floor alone (e.g. $40 for "Booster Box")
// — a "not obviously an accessory" sanity check, not a "not obviously a
// different, far-cheaper foreign printing" one. Pin the fix: borrow another
// market's real reference, FX-converted, before ever falling back to the flat
// floor with nothing behind it.
// ─────────────────────────────────────────────────────────────────────────────

test("trustedRef falls back to another market's reference before giving up", () => {
  const code = codeOnly(read(SRC));
  const fnStart = code.indexOf("const trustedRef = (g: SealedGroup)");
  assert.ok(fnStart >= 0, "expected to find trustedRef");
  const fn = code.slice(fnStart, code.indexOf("\n  };", fnStart) + 5);

  assert.match(fn, /marketRefs\.get\(g\.groupKey\)/, "must consult the cross-market reference map");
  assert.match(fn, /convertCents\(ref\.cents,\s*ref\.currency,\s*mktCurrency\)/, "must FX-convert a borrowed reference into THIS market's currency");
  assert.match(fn, /if \(m\.country === mkt\.country\) continue/, "must not borrow a market's own reference back from itself");
});

test("the cross-market map is built from every market, once, before the per-market loop", () => {
  const code = codeOnly(read(SRC));
  const buildAt = code.indexOf("const marketRefs = new Map");
  const loopAt = code.indexOf("for (const mkt of EBAY_SEALED_MARKETS) {\n        if (isEbayRateLimited())");
  assert.ok(buildAt >= 0, "expected the marketRefs map to be built in importSealed()");
  assert.ok(loopAt > buildAt, "the map must be built BEFORE the per-market refresh loop, not after");

  const buildBlock = code.slice(buildAt, loopAt);
  assert.match(buildBlock, /for \(const m of EBAY_SEALED_MARKETS\)/, "must be built from every market, not just one");
  assert.match(buildBlock, /getSealedGroups\(m\.country\)/, "must read each market's OWN groups (reuses the existing 15-minute memo)");
  assert.match(buildBlock, /!l\.retailer\.startsWith\("ebay"\)/, "must only trust NON-eBay listings as a reference, same rule as the local case");
});

test("refreshEbaySealedMarket receives and threads the map through, not a fresh one per market", () => {
  const code = codeOnly(read(SRC));
  assert.match(
    code,
    /async function refreshEbaySealedMarket\(\s*mkt: \(typeof EBAY_SEALED_MARKETS\)\[number\],\s*marketRefs: Map</,
    "refreshEbaySealedMarket must accept marketRefs as a parameter"
  );
  assert.match(code, /refreshEbaySealedMarket\(mkt, marketRefs\)/, "the call site must pass the shared map through");
});
