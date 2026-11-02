import { test } from "node:test";
import assert from "node:assert/strict";
import { ROTATION, blackFridaySeason, parseOg, pickPosts, postText, tagFacets } from "../src/lib/bluesky-post";

test("two different sites a day, and every site within a week", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const day = new Date(Date.UTC(2026, 0, 5 + i)).toISOString().slice(0, 10);
    const p = pickPosts(day);
    assert.equal(p.length, 2);
    assert.notEqual(p[0].site.name, p[1].site.name);
    p.forEach((x) => seen.add(x.site.name));
  }
  assert.equal(seen.size, ROTATION.length);
});

test("Black Friday pages only in season", () => {
  assert.equal(blackFridaySeason("2026-10-31"), false);
  assert.equal(blackFridaySeason("2026-11-01"), true);
  assert.equal(blackFridaySeason("2026-12-07"), true); // Cyber Monday 30 Nov + 7
  assert.equal(blackFridaySeason("2026-12-08"), false);
  for (let i = 0; i < 30; i++) {
    const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    for (const p of pickPosts(day)) assert.doesNotMatch(p.url, /black-friday/);
  }
});

test("every rotation URL is https on the site's own host", () => {
  for (const s of ROTATION) for (const p of [...s.pages, s.blackFriday]) assert.match(s.url + p, /^https:\/\/[a-z.]+\/[a-z/-]*$/);
});

test("parseOg reads Open Graph tags and falls back to title and description", () => {
  const html = `<html><head><title>Fallback &amp; title</title><meta name="description" content="Desc &#x27;x&#x27;"><meta property="og:image" content="https://x.com/a.png"></head></html>`;
  assert.deepEqual(parseOg(html), { title: "Fallback & title", description: "Desc 'x'", image: "https://x.com/a.png" });
  assert.equal(parseOg(`<meta content="T" property="og:title">`).title, "T");
});

test("post text stays under Bluesky's limit and cuts on a word", () => {
  const t = postText("Title", "word ".repeat(100));
  assert.ok([...t].length <= 290);
  assert.match(t, /word…$/);
  assert.equal(postText("Title", "Short."), "Title\n\nShort.");
});

test("hashtags close the post, survive the cut and become facets on the right bytes", () => {
  const t = postText("Prix £ é", "word ".repeat(100), 290, ["PokemonTCG", "TCG"]);
  assert.ok([...t].length <= 290);
  assert.match(t, /word…\n\n#PokemonTCG #TCG$/);
  const bytes = new TextEncoder().encode(t);
  const f = tagFacets(t, ["PokemonTCG", "TCG"]);
  assert.equal(f.length, 2);
  const slice = (x: (typeof f)[number]) => new TextDecoder().decode(bytes.slice(x.index.byteStart, x.index.byteEnd));
  assert.equal(slice(f[0]), "#PokemonTCG");
  assert.equal(slice(f[1]), "#TCG");
  assert.equal(postText("T", "Short.", 290, ["MTG"]), "T\n\nShort.\n\n#MTG");
});

test("every site has one or two plain hashtags", () => {
  for (const s of ROTATION) {
    assert.ok(s.tags.length >= 1 && s.tags.length <= 2, s.name);
    for (const t of s.tags) assert.match(t, /^[A-Za-z][A-Za-z0-9]*$/);
  }
});
