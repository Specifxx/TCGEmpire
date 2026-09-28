import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAV_GROUPS } from "../src/components/nav-groups";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SRC = "src/components/CinematicNavMenu.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// THE MENU'S GOLD PREMIUM SPOTLIGHT IS GONE (2026-09-28). From 2026-09-10 the
// phone menu opened on a gold "✦ Premium" banner ("the premium feature … is
// way too hidden"). The owner then moved every upgrade prompt to where a free
// account hits a limit — "not in popups and headers" (DECISIONS.md, "Free
// limits: charge for what people use every week"). /premium must stay
// reachable from the menu, as the plain Premium entry of NAV_GROUPS.
// ─────────────────────────────────────────────────────────────────────────────

test("the menu no longer opens on a gold Premium spotlight", () => {
  const code = codeOnly(read(SRC));
  assert.doesNotMatch(code, /<PremiumNavLink/, "no Premium CTA of its own in the menu");
  assert.doesNotMatch(code, /border-gold|bg-gold/, "no gold Premium banner");
  assert.doesNotMatch(code, /usePremiumDialog/);
});

test("/premium stays reachable from the menu and the rail, as a plain nav entry", () => {
  const links = NAV_GROUPS.flatMap((g) => g.links);
  assert.ok(links.some((l) => l.href === "/premium"), "NAV_GROUPS must still list /premium");
});

test("CinematicNavMenu is mounted inside the Premium dialog provider", () => {
  // usePremiumDialog() only has real context inside PremiumDialogProvider —
  // the tool walls and at-the-limit panels rendered inside the menu's pages
  // rely on it.
  const layout = read("src/app/layout.tsx");
  const providerAt = layout.indexOf("<PremiumDialogProvider>");
  const megaMenuAt = layout.indexOf("<MegaMenuProvider>");
  const providerCloseAt = layout.indexOf("</PremiumDialogProvider>");
  assert.ok(
    providerAt >= 0 && megaMenuAt > providerAt && megaMenuAt < providerCloseAt,
    "MegaMenuProvider (which renders CinematicNavMenu) must sit inside <PremiumDialogProvider>"
  );
});
