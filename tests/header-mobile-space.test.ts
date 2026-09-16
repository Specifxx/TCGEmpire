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

test("the notification bell is hidden below sm, not removed outright", () => {
  const code = readCode("src/components/NavUser.tsx");
  assert.match(code, /<NotificationBell/, "the bell must still exist for larger screens");
  assert.match(code, /hidden sm:inline-flex/, "…but must be display:none below sm");
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
