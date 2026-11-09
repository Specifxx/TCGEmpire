import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HEADER_MENUS, NAV_GROUPS } from "../src/components/nav-groups";

const hrefs = new Set(NAV_GROUPS.flatMap((g) => g.links.map((l) => l.href)));
const menu = readFileSync("src/components/HeaderMegaMenu.tsx", "utf8");
const bar = readFileSync("src/components/Navbar.tsx", "utf8");

test("header menus are built from NAV_GROUPS: every link is one the rail and phone menu carry", () => {
  assert.deepEqual(HEADER_MENUS.map((m) => m.label), ["Singles", "Sealed", "Deals & market"]);
  for (const m of HEADER_MENUS) for (const c of m.columns) for (const l of c.links) assert.ok(hrefs.has(l.href), l.href);
});

test("singles dropdown has every facet a buyer browses by", () => {
  const singles = HEADER_MENUS[0].columns.flatMap((c) => c.links.map((l) => l.href));
  for (const h of ["/sets", "/domains", "/champions", "/cards"]) assert.ok(singles.includes(h), h);
});

test("header stays at 7 top-level items or fewer", () => {
  // Database, Singles, Sealed, Deals & market, Blog, Tools, Premium
  assert.ok(HEADER_MENUS.length + 4 <= 7);
});

test("menu: panels are always in the HTML, real links, aria, Escape, hover intent, keyboard", () => {
  assert.match(menu, /aria-expanded/);
  assert.match(menu, /aria-controls/);
  assert.match(menu, /"Escape"/);
  assert.match(menu, /ArrowDown/);
  assert.match(menu, /onMouseEnter/);
  assert.match(menu, /<Link href=\{l\.href\}/);
  assert.doesNotMatch(menu, /isOpen && \(|open === i &&/, "a closed panel must stay in the markup");
});

test("navbar gates are complementary: Sealed link below 1440px, dropdowns from it", () => {
  assert.match(bar, /<HeaderMegaMenu menus=\{HEADER_MENUS\} className="hidden min-\[1440px\]:flex"/);
  assert.match(bar, /lg:block lg:px-2.5 min-\[1440px\]:hidden/);
});
