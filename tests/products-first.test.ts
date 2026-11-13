import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HubIntro, plainIntroText } from "../src/components/HubIntro";
import { hubIntro } from "../src/lib/content/hub-intros";

// ─────────────────────────────────────────────────────────────────────────────
// The list pages show their products sooner (owner, 2026-11-13: "the product's
// very easy to access rather than have everything everywhere all at once";
// DECISIONS.md "Minimal redesign, second pass").
//
// Measured on a 390x844 phone, the first product's distance from the top of the
// page, the build before against this one: /browse 999px → 671px, /sealed
// 1,165px → 810px, /sets 1,443px → 815px, /cards 849px → 455px, /movers 1,112px
// → 910px, /price-guide 2,060px → 1,402px. Nothing was deleted to get there: the
// words moved under the list or behind a native <details>, so every one of them
// is still in the server HTML. This file pins both halves: the order, and that
// the words are still there.
// ─────────────────────────────────────────────────────────────────────────────

// tsx compiles JSX with the classic runtime (React.createElement), as in tests/ebay-clicks-funnel.test.ts.
(globalThis as { React?: typeof React }).React = React;

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

test("HubIntro: the first paragraph shows, the rest is a closed native <details>, and every word is in the HTML", () => {
  for (const path of ["/sealed", "/sets", "/price-guide", "/movers", "/cards"]) {
    const paragraphs = hubIntro(path);
    assert.ok(paragraphs.length >= 2, `${path} has a first paragraph and at least one more`);
    const html = renderToStaticMarkup(createElement(HubIntro, { path }));
    assert.match(html, /^<div data-hub-intro=""/, `${path}: the wrapper the phone's three-line rule hangs on`);
    const details = html.indexOf("<details");
    assert.ok(details > 0, `${path}: the paragraphs after the first are in a <details>`);
    assert.doesNotMatch(html, /<details[^>]*\sopen/, `${path}: closed until the reader opens it`);
    assert.equal((html.match(/<details/g) ?? []).length, 1, path);
    assert.match(html, /<summary[^>]*>.*Read more.*<\/summary>/s, path);
    assert.equal((html.slice(0, details).match(/<p>/g) ?? []).length, 1, `${path}: exactly one paragraph outside the <details>`);
    assert.equal((html.slice(details).match(/<p>/g) ?? []).length, paragraphs.length - 1, `${path}: the rest inside it`);
    const seen = text(html);
    for (const p of paragraphs) {
      const words = plainIntroText(p).replace(/\s+/g, " ").trim();
      assert.ok(seen.includes(words), `${path}: a paragraph is missing from the server HTML: "${words.slice(0, 60)}…"`);
    }
  }
  assert.equal(renderToStaticMarkup(createElement(HubIntro, { path: "/no-such-hub" })), "", "no entry, no markup");
});

test("HubIntro on a phone: three lines of the first paragraph, only while a closed 'Read more' follows it", () => {
  const css = read("src/app/globals.css");
  const at = css.indexOf("[data-hub-intro]:has(> details:not([open])) > p:first-child");
  assert.ok(at > 0, "the rule is tied to a CLOSED <details>: an opened intro, or an intro of one paragraph, is never cut");
  const media = css.lastIndexOf("@media", at);
  assert.match(css.slice(media, at), /^@media \(max-width: 639px\) \{\s*$/, "phones only");
  const rule = css.slice(at, css.indexOf("}", at));
  assert.match(rule, /-webkit-line-clamp: 3;/);
  assert.match(rule, /overflow: hidden;/);
  // The cut is on the screen only. A browser without :has() drops the whole rule and shows the paragraph whole; nothing in the
  // component hides text (no `hidden`, no `sr-only`, no line-clamp class on the paragraph itself).
  const component = codeOnly(read("src/components/HubIntro.tsx"));
  assert.doesNotMatch(component, /line-clamp|sr-only/);
});

test("/price-guide: the stat strip, then the filters and the list; 'Prices by set' is under the list and its pager", () => {
  const board = codeOnly(read("src/components/price-guide/PriceGuideMarketBoard.tsx"));
  const stats = board.indexOf('<PriceGuideSummary part="stats"');
  const filters = board.indexOf("<Filters ");
  const table = board.indexOf("<PriceGuideTable");
  const pager = board.indexOf("<Pagination ");
  const sets = board.indexOf('<PriceGuideSummary part="sets"');
  assert.ok(stats > 0 && filters > stats && table > filters && pager > table && sets > pager, "stats, filters, table, pager, prices by set");
  const summary = codeOnly(read("src/components/price-guide/PriceGuideSummary.tsx"));
  assert.match(summary, /if \(part === "stats"\) \{/, "the strip alone above the list");
  assert.match(summary, /aria-labelledby="pg-by-set"/, "the per-set table is still rendered, with its heading");
  assert.match(summary, /href=\{`\/sets\/\$\{s\.slug\}#price-guide`\}/, "and still links each set's own price guide");
});

test("/sets: the set lists come straight after the intro; the two longer paragraphs are in 'About Riftbound sets' under them", () => {
  const page = codeOnly(read("src/app/sets/page.tsx"));
  const intro = page.indexOf('<HubIntro path="/sets"');
  const released = page.indexOf("Released sets</h2>");
  const about = page.indexOf("About Riftbound sets</h2>");
  assert.ok(intro > 0 && released > intro && about > released, "intro, the sets, then the reading");
  const header = page.slice(intro, released);
  assert.doesNotMatch(header, /href="\/gallery"|href="\/domains"|href="\/portfolio\/sets"/, "the links moved out of the header");
  const reading = page.slice(about);
  for (const href of ["/gallery", "/domains", "/portfolio/sets"]) {
    assert.ok(reading.includes(`href="${href}"`), `${href} is still linked from the page, under the lists`);
  }
});

test("/browse: 'How to read these prices' is one closed line between the h1 and the board", () => {
  const view = codeOnly(read("src/components/browse/BrowseView.tsx"));
  const details = view.indexOf("<details");
  assert.ok(details > 0);
  assert.match(view.slice(details, details + 600), /<summary[\s\S]*How to read these prices/);
  assert.doesNotMatch(view.slice(details, details + 200), /<details[^>]*\sopen/);
});
