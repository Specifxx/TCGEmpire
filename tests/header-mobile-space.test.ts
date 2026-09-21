import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─────────────────────────────────────────────────────────────────────────────
// Reported directly: "get rid of the notification icon so we make more space
// for the profile icon. Also profile icon should be smaller so it fits for
// mobile." Two changes, both mobile-only — the bell stays for anyone with
// screen real estate to spare, and the profile icon's TAP TARGET stays at the
// site's own accessibility floor (44px on phones, bumped to 48px on a coarse
// pointer, same as the bell — see .tap-icon in globals.css); only the
// circle drawn inside it shrinks.
// ─────────────────────────────────────────────────────────────────────────────

test("the notification bell is now removed from the header outright", () => {
  // THE REVERSE OF WHAT THIS ONCE ASSERTED. The bell was hidden below sm for
  // "get rid of the notification icon so we make more space for the profile
  // icon"; on 2026-09-19 it was removed from the header entirely, asked for in
  // the same breath as bringing the Database link back — the row could not carry
  // both, and Database is the more valuable.
  //
  // It also ended a real ambiguity: HeaderWatchButton draws a bell for the
  // watchlist, so between sm and lg a signed-in visitor saw two bells side by
  // side, told apart only by fill and badge.
  const code = readCode("src/components/NavUser.tsx");
  assert.doesNotMatch(code, /<NotificationBell/, "the header must not render it at any width");
  assert.doesNotMatch(code, /import .*NotificationBell/, "and must not import it");
});

test("removing the bell left notifications with no surface, and that is recorded", () => {
  // Stated rather than quietly dropped: NotificationBell was an in-place
  // dropdown with no page equivalent (there is no /notifications route), so
  // unread notifications currently have nowhere to be seen. The component and
  // use-unread.ts stay in the tree; the fix, if notifications matter, is a real
  // page linked from the menu overlay — not squeezing the bell back into a row
  // that has lost this argument twice.
  const { existsSync } = require("node:fs") as typeof import("node:fs");
  assert.ok(existsSync(join(ROOT, "src/components/NotificationBell.tsx")), "kept for a future page, not deleted");
  // read(), NOT readCode(): the note is a comment, and readCode strips comments.
  assert.match(read("src/components/NavUser.tsx"), /no \/notifications route/, "the cost must stay written down");
});

test("the profile avatar's tap target never shrinks below the site's own floor", () => {
  const code = readCode("src/components/UserMenu.tsx");
  const btn = code.slice(code.indexOf('aria-label="Account menu"') - 40, code.indexOf('aria-label="Account menu"') + 400);
  assert.match(btn, /tap-icon/, "the button itself must keep the standard 44/48px accessible target");
});

test("only the visible circle shrinks on phones, not the accessible box around it", () => {
  const code = readCode("src/components/UserMenu.tsx");
  assert.match(code, /h-8 w-8[^>]*sm:h-9 sm:w-9/, "the drawn circle is smaller below sm, back to the original size from sm up");
  // The unverified-email badge must anchor to the (now differently sized)
  // circle, not float relative to the bigger invisible touch box around it.
  const circleWrapperAt = code.indexOf("relative grid h-8 w-8");
  const badgeAt = code.indexOf("Email not verified");
  assert.ok(circleWrapperAt > 0 && badgeAt > circleWrapperAt, "the badge must be nested inside the circle-sized wrapper, not the outer button");
});
