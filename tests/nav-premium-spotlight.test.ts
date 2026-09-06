import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SRC = "src/components/CinematicNavMenu.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// Reported directly: on phone, the only way to reach Premium was "clicking the
// three bars and finding the premium feature which is way too hidden" — it was
// one of nine equal tiles in the Popular grid. The fix is a spotlighted, gold
// banner that's the first thing shown once the phone Explore overlay opens.
// Pin the guarantees the same way premium-slidein.test.ts pins its sibling nudge.
// ─────────────────────────────────────────────────────────────────────────────

test("the spotlight only targets a non-Premium visitor who can actually buy", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /!premium\s*&&\s*premiumCheckout/, "must hide once already Premium and require checkout to be enabled");
});

test("unlike the signed-out-excluded slide-in, the spotlight is NOT gated on being signed in", () => {
  // Deliberate: this lives inside a menu the visitor chose to open (not an
  // unsolicited auto-popup like SignupPromoPopup), and the ⭐ Premium tile in
  // the Popular grid below was already visible to signed-out visitors in this
  // exact overlay — the spotlight only makes that existing entry prominent.
  const code = codeOnly(read(SRC));
  assert.doesNotMatch(code, /!premium\s*&&\s*!!user/, "must not require a signed-in user the way PremiumSlideIn does");
});

test("only shown in the default glance view, never while filtering or showing everything", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /!filtering\s*&&\s*!showAll\s*&&\s*!premium\s*&&\s*premiumCheckout/, "must share Popular's own visibility condition");
});

test("the CTA opens the shared Premium dialog and closes the menu first", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /usePremiumDialog/, "must reuse the site-wide Premium dialog, not a bespoke checkout");
  const btnAt = code.indexOf("openPremium();");
  assert.ok(btnAt > 0, "must call openPremium()");
  const closeAt = code.lastIndexOf("close();", btnAt);
  assert.ok(closeAt > 0 && closeAt < btnAt, "must close the overlay before opening the dialog, not leave both open");
});

test("CinematicNavMenu is mounted inside the Premium dialog provider", () => {
  // usePremiumDialog() only has real context inside PremiumDialogProvider —
  // otherwise the click silently no-ops (PremiumDialog.tsx's default context).
  const layout = read("src/app/layout.tsx");
  const providerAt = layout.indexOf("<PremiumDialogProvider>");
  const megaMenuAt = layout.indexOf("<MegaMenuProvider>");
  const providerCloseAt = layout.indexOf("</PremiumDialogProvider>");
  assert.ok(
    providerAt >= 0 && megaMenuAt > providerAt && megaMenuAt < providerCloseAt,
    "MegaMenuProvider (which renders CinematicNavMenu) must sit inside <PremiumDialogProvider>"
  );
});
