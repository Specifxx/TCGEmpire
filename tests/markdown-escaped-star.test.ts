import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, InlineMarkdown } from "../src/components/Markdown";

// Signature collector numbers carry a star ("169*/167"). Two of them in one
// paragraph used to pair up as *italic*, and the escaped form printed its
// backslash and broke any **bold** or [link] around it (2026-09-29, the
// Radiance Preview Season post). "\*" is now a literal star.

const md = (content: string) => renderToStaticMarkup(createElement(Markdown, { content }));
const inl = (content: string) => renderToStaticMarkup(createElement(InlineMarkdown, { content }));

test("an escaped star renders as a plain star, with no backslash and no italic", () => {
  const html = md("Ziggs 169\\*/167 and Orianna 171\\*/167 are Signatures.");
  assert.match(html, /Ziggs 169\*\/167 and Orianna 171\*\/167 are Signatures\./);
  assert.doesNotMatch(html, /<em/);
  assert.doesNotMatch(html, /\\/);
});

test("an escaped star inside bold and a link keeps both", () => {
  const html = md("Ziggs has a Signature, **[169\\*/167](/card/ziggs-hexplosives-expert-rad-169s-167)**, by Kindlejack.");
  assert.match(html, /<strong[^>]*><a [^>]*href="\/card\/ziggs-hexplosives-expert-rad-169s-167"[^>]*>169\*\/167<\/a><\/strong>/);
});

test("the inline renderer (summaries, FAQ answers) handles it too", () => {
  const html = inl("**First Signatures:** Ziggs 169\\*/167, Orianna 171\\*/167.");
  assert.match(html, /Ziggs 169\*\/167, Orianna 171\*\/167\./);
  assert.doesNotMatch(html, /<em/);
});

test("ordinary emphasis is unchanged", () => {
  assert.match(md("An *italic* word and a **bold** one."), /<em[^>]*>italic<\/em>.*<strong[^>]*>bold<\/strong>/);
});
