// The phone dock (components/AdDock.tsx, fed by SideAds.tsx; owner 2026-11-06): the side rails' tiles in a bar along the foot of a
// screen too narrow for the rails, with the buy bar's rules. Pinned: when it may show, its tags, and that it yields to every unit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DOCK_ARM, dockShows, interleave, type DockState } from "../src/components/AdDock";

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("the phone dock: narrow screens only, never on the first screen, never beside another unit, the buy bar or a dialog", () => {
  const ok: DockState = { narrow: true, scrolled: 1000, screen: 800, blockers: 0, buybar: false, modal: false, typing: false, dismissed: false };
  assert.ok(dockShows(ok));
  assert.ok(!dockShows({ ...ok, narrow: false }), "wide screens have the rails");
  assert.ok(!dockShows({ ...ok, scrolled: 800 * DOCK_ARM - 1 }), "not on the first screen");
  assert.ok(!dockShows({ ...ok, blockers: 1 }), "another unit or the footer in view");
  assert.ok(!dockShows({ ...ok, buybar: true }), "never on a page with the buy bar");
  assert.ok(!dockShows({ ...ok, modal: true }), "never over a dialog or the menu");
  assert.ok(!dockShows({ ...ok, typing: true }), "never over the keyboard");
  assert.ok(!dockShows({ ...ok, dismissed: true }));
  assert.deepEqual(interleave([{ items: ["e1", "e2", "e3"] }, { items: ["t1"] }]), ["e1", "t1", "e2", "e3"], "the sides take turns");
  const d = src("components/AdDock.tsx");
  assert.match(d, /^"use client";/);
  assert.match(d, /return armed \? <>\{children\}<\/> : null;/, "nothing rendered or fetched before the visitor scrolls");
  assert.match(d, /translate-y-full/, "slides on transform only (CLS 0)");
  assert.match(d, /querySelectorAll\(`footer, \[data-dock-yield\], \[data-rate-card\], \$\{yieldTo\}`\)/, "hides beside every other unit, the rating card and the footer");
  assert.match(d, /yieldTo = "\[data-ad\]"/, "every [data-ad] unit by default");
  assert.match(d, /sessionStorage\.setItem\(DISMISS_KEY, "1"\)/, "✕ hides it for the visit");
  assert.match(d, />Ad<\/span>/, "labelled Ad");
  const s = src("components/SideRails.tsx");
  assert.match(s, /railTiles\(data, country, "dock"\)/, "its own tags (dock_<market>, tcg_dock)");
  assert.match(s, /surface="ad_dock"/);
  assert.match(s, /yieldTo="\[data-ad-placement\], \[data-rate-prompt\]"/, "yields to every ad unit and the rating card");
  assert.match(s, /if \(narrow && !adFree\)/, "never for Plus/Premium");
  assert.match(d, /\[data-adfree\], \.capacitor-native/, "never for Plus/Premium or in the app");
  assert.match(s, /buybar="\.buybar"/, "never on a card page (the buy bar)");
  assert.match(src("app/globals.css"), /html\[data-ad-dock\] \.above-bottombar/, "the feedback button lifts above it");
  assert.doesNotMatch(d + s, /amazon/i, "no Amazon in the dock");
});

test("the phone dock's tiles carry their own tags, never the rails'", async () => {
  const { railTiles } = await import("../src/components/SideRails");
  const data = { set: "x", ebay: [], tcg: [{ cardId: "a", name: "A", url: "https://www.tcgplayer.com/product/1", imageUrl: "https://i/a.jpg", priceCents: 500 }] } as never;
  assert.match(railTiles(data, "US", "dock").tcg[0].href, /tcg_dock/);
  assert.match(railTiles(data, "US", "side").tcg[0].href, /tcg_side/);
});
