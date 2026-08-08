import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const ROUTE = "src/app/api/promo/early-adopter/route.ts";
const POPUP = "src/components/SignupPromoPopup.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// The early-adopter promo must not publish how many spots are left.
// ─────────────────────────────────────────────────────────────────────────────
// The obvious version of this change is to edit the popup's copy. That is not
// sufficient: the numbers arrived from a PUBLIC, CACHEABLE JSON endpoint, so the
// exact signup count stayed readable by anyone opening the network tab or
// hitting /api/promo/early-adopter directly — regardless of what the UI chose to
// render. Both halves are asserted, because fixing only the visible one looks
// finished and isn't.

test("the promo endpoint never returns a slot count", () => {
  const src = read(ROUTE);
  const body = /return NextResponse\.json\(\s*\{([^}]*)\}/g;
  const payloads = [...src.matchAll(body)].map((m) => m[1]);
  assert.ok(payloads.length >= 2, "expected both the inactive and active responses");
  for (const p of payloads) {
    // Check the KEYS actually serialised, not any mention of the word: the
    // active branch legitimately reads the variable in `active: remaining > 0`,
    // which computes a boolean without sending the number.
    //
    // Split on commas and take each property's key so SHORTHAND is caught too —
    // `{ active, remaining }` publishes the count just as surely as
    // `{ remaining: n }`, and a `remaining\s*:` regex would miss it.
    const keys = p
      .split(",")
      .map((prop) => prop.split(":")[0].trim())
      .filter(Boolean);
    for (const banned of ["remaining", "limit"]) {
      assert.ok(!keys.includes(banned), `response still publishes "${banned}": {${p.trim()}}`);
    }
  }
});

test("the server still computes the count — it just keeps it", () => {
  // Scarcity has to stay TRUE. `active` must remain derived from a real
  // remaining-slots calculation, not hard-coded, or the popup would keep
  // promising a comp after the promo is full.
  const src = read(ROUTE);
  assert.match(src, /const remaining = Math\.max\(0, EARLY_PREMIUM_LIMIT - total\)/, "count must still be computed");
  assert.match(src, /active: remaining > 0/, "`active` must be derived from the real count");
});

test("the popup shows qualitative scarcity, not a number", () => {
  const src = read(POPUP);
  assert.match(src, /Few early-adopter spots left/, "expected the qualitative line");
  assert.ok(!/promo\.remaining/.test(src), "popup must not read a remaining count");
  assert.ok(!/promo\.limit/.test(src), "popup must not read the promo limit");
});

test("the client type cannot carry a count back in", () => {
  // The interface is the contract the fetch is cast through; leaving the fields
  // on it invites a future edit to render them again with no other change.
  const src = read(POPUP);
  const iface = /interface PromoStatus \{([\s\S]*?)\}/.exec(src)?.[1] ?? "";
  assert.ok(iface, "PromoStatus interface not found");
  assert.ok(!/remaining/.test(iface), "PromoStatus must not declare `remaining`");
  assert.ok(!/limit/.test(iface), "PromoStatus must not declare `limit`");
});
