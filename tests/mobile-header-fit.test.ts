import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─────────────────────────────────────────────────────────────────────────────
// "MAKE SURE IT ALL FITS ON A MOBILE PHONE" — the second half of the request
// that deleted the bottom tab bar, and the half that needed measuring rather
// than reasoning about.
//
// Moving the bar's Menu tab into the header as HeaderMenuButton cost 46px in a
// row that had ONE pixel of slack at 375px. Measured in Chromium against a real
// dev server, before any compensating change:
//
//   width   header row needed / had     page scrollWidth / viewport
//   320px   390 / 288                   406 / 320   ← sideways scroll
//   360px   390 / 328                   406 / 360   ← sideways scroll
//   375px   390 / 343                   406 / 375   ← sideways scroll
//   390px   390 / 358                   406 / 390   ← sideways scroll
//   640px   700 / 592                   724 / 640   ← already broken before this
//
// Two changes fixed it, and both are pinned below because either one reverting
// quietly reinstates a horizontally scrolling site on every phone:
//
//   1. The left group lost `shrink-0`. A non-shrinkable group cannot absorb
//      anything, so the overflow had nowhere to go but the document. With
//      `min-w-0` the worst case is a truncated label, not a scrolling page.
//   2. The below-lg "Database" text link was removed — ~76px, and the most
//      redundant thing in the header: the full-width search box on the next row
//      submits to /browse, which is also in the overlay.
//
// After: 288/288, 328/328, 343/343, 358/358, 592/592, 672/672 — no page-level
// horizontal scroll at ANY of 320/360/375/390/414/640/720, including the two
// widths that were broken beforehand. No tap target under 44x44 and no clipped
// text at 320/375/414, and the overlay opens full-width with 59 links.
//
// scripts/mobile-check.ts --url <dev> is the full audit to re-run after
// touching this row; it needs a database, so it runs in CI, not here.
// ─────────────────────────────────────────────────────────────────────────────

const NAVBAR = "src/components/Navbar.tsx";

test("the header's left group can shrink, so the row can never push the page sideways", () => {
  const code = readCode(NAVBAR);
  const row = code.slice(code.indexOf("h-16 w-full items-center"), code.indexOf("<HeaderSearchSlot>"));
  assert.match(row, /className="flex min-w-0 items-center gap-1 sm:gap-3"/, "left group must be shrinkable with min-w-0");
  assert.doesNotMatch(
    row,
    /className="flex shrink-0 items-center gap-1 sm:gap-3"/,
    "shrink-0 here is what made the overflow escape to the document",
  );
});

test("the redundant below-lg Database link stays out of the header row", () => {
  const code = readCode(NAVBAR);
  const row = code.slice(code.indexOf("h-16 w-full items-center"), code.indexOf("<HeaderSearchSlot>"));
  assert.doesNotMatch(row, /Database/, "the left group must not carry a Database text link below lg");
  // The DESKTOP one, in the right-hand nav, is untouched and must stay.
  assert.match(code, /href="\/browse"[^>]*lg:block[\s\S]{0,40}Database/, "the lg:block Database link must survive");
  // And nothing lost access: the mobile search row still submits to /browse.
  assert.match(code, /<HeaderSearchSlot mobile>/);
});

test("Premium keeps its phone slot — it was an explicit brief, not incidental", () => {
  // 2026-09-10: Premium was deliberately put beside Database on phones. Database
  // went; this must not have gone with it, and it is the reason the left group
  // still needs to be able to shrink.
  const code = readCode(NAVBAR);
  const row = code.slice(code.indexOf("h-16 w-full items-center"), code.indexOf("<HeaderSearchSlot>"));
  assert.match(row, /<PremiumNavLink className="[^"]*lg:hidden"/);
});

test("the menu button is an icon button that meets the tap-target floor", () => {
  const code = readCode("src/components/HeaderMenuButton.tsx");
  // `tap-icon` is the shared 44x44 (48 under pointer:coarse) utility — measured
  // at 44x44 in Chromium at 320/375/414 with zero targets under the floor.
  assert.match(code, /className=\{`tap-icon/);
});

test("nothing in the tree still reserves space for the deleted bar", () => {
  assert.ok(!existsSync(join(ROOT, "src/components/BottomTabBar.tsx")));
  const css = read("src/app/globals.css");
  assert.doesNotMatch(css, /var\(--bottombar-h\)/);
  // The body padding was the biggest one: 3.5rem of dead space under every page.
  assert.doesNotMatch(css, /padding-bottom:\s*calc\(var\(--bottombar-h\)/);
});
