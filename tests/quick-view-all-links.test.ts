import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Owner, 2026-11-17: the quick view opens from every card link, not only the tiles that wrap CardQuickLink.
test("the quick view provider opens the popup for any plain /card/<slug> link nobody handled", () => {
  const s = readFileSync(new URL("../src/components/QuickView.tsx", import.meta.url), "utf8");
  assert.match(s, /document\.addEventListener\("click", onDocClick, true\)/, "capture phase: before Next's Link navigates");
  assert.match(s, /if \(openedAtRef\.current >= at\) return;/, "a tile's own handler is not doubled");
  assert.match(s, /openedAtRef\.current = performance\.now\(\);/);
  assert.match(s, /\/\^\\\/card\\\/\(\[\^\/\?#\]\+\)\\\/\?\$\//);
  assert.match(s, /\.catch\(\(\) => window\.location\.assign\(href\)\)/, "a failed read falls back to the card page");
});
