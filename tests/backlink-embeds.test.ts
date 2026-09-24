import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { storeBadgeHtml, embedAttributionHtml } from "../src/lib/store-badge";

// Backlinks, 2026-09-24 growth pass: a link inside an iframe is a link on OUR
// document, so the iframe-only widgets earned no credit. Every snippet now ends
// with a plain link, and stores get a plain-HTML badge.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("every widget snippet carries a plain, branded attribution link outside the iframe", () => {
  const src = read("src/app/embed/page.tsx");
  const iframes = src.match(/<iframe src=/g) ?? [];
  const links = src.match(/embedAttributionHtml\("https:\/\/riftcompare\.com\//g) ?? [];
  assert.equal(iframes.length, 3);
  assert.equal(links.length, iframes.length, "one attribution link per iframe snippet");
  assert.match(src, /embedAttributionHtml\("https:\/\/riftcompare\.com\/card\/CARD-SLUG", "CARD NAME on RiftCompare"\)/);
  const html = embedAttributionHtml("https://riftcompare.com/card/x", "Jinx, Loose Cannon on RiftCompare");
  assert.match(html, /^<p [^>]*><a href="https:\/\/riftcompare\.com\/card\/x">Jinx, Loose Cannon on RiftCompare<\/a><\/p>$/);
  assert.doesNotMatch(html, /iframe|rel="nofollow"/);
});

test("the store badge is plain HTML + inline SVG to the store's own page, escaped, with no fetches", () => {
  const html = storeBadgeHtml({ slug: "games401", name: `401 "Games" <&>` });
  assert.match(html, /^<a href="https:\/\/riftcompare\.com\/stores\/games401"/);
  assert.match(html, /Prices tracked on RiftCompare/);
  assert.match(html, /<svg /);
  assert.doesNotMatch(html, /<script|<img|<iframe|src=/);
  assert.doesNotMatch(html, /<&>/, "store names are escaped");
  assert.match(read("src/app/stores/[slug]/page.tsx"), /Add this badge to \{store\.name\}&apos;s site/);
  assert.match(read("src/app/embed/page.tsx"), /Prices tracked on RiftCompare/);
});
