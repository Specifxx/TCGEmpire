import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildCollectionNarrative,
  type CollectionKind,
  type CollectionMember,
} from "../src/lib/content/collection-narrative";

// ─────────────────────────────────────────────────────────────────────────────
// Data-derived prose on the set and domain templates (GROWTH-AUDIT.md § 3).
//
// Both were "mostly list" pages: /domains/[slug] carried roughly 80 words of
// real editorial (one intro sentence, two hand-written lore sentences, a link
// row) while receiving 233 inbound internal links, and /sets/[set] the same
// shape with 347. buildCollectionNarrative already supported kind "domain" and
// "set" and had simply never been called from either.
//
// The risk in generating prose is fabrication, so these tests are mostly about
// what the generator must NOT say.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const words = (ps: string[]) => ps.join(" ").split(/\s+/).filter(Boolean).length;

const member = (name: string, priceCents: number | null): CollectionMember => ({ name, priceCents });
const SAMPLE: CollectionMember[] = [
  member("Fury Rune", 19573),
  member("Jhin, Virtuoso", 19047),
  member("Fury Rune", 18886),
  member("Ashe, Frost Archer", 9000),
  member("Kindling", 450),
  member("Sharkling", 30),
  member("Unpriced Card", null),
];

const build = (kind: CollectionKind, members: CollectionMember[], siteMedianCents: number | null = 683) =>
  buildCollectionNarrative({ kind, label: kind === "set" ? "Origins" : "Fury", currency: "USD", place: "the United States", members, siteMedianCents });

// ── The templates actually call it ───────────────────────────────────────────

test("the set and domain templates render the generated intro", () => {
  for (const [path, label] of [
    ["src/app/sets/[set]/page.tsx", "set"],
    ["src/app/domains/[slug]/page.tsx", "domain"],
  ] as const) {
    const src = read(path);
    assert.ok(src.includes("buildCollectionNarrative"), `${label} page must build a narrative`);
    assert.match(src, /intro\.map\(\(p, i\) => \(/, `${label} page must render every paragraph`);
    assert.match(src, /kind: "(set|domain)"/, `${label} page must declare its collection kind`);
  }
});

test("the domain page adds no extra query — it reuses the cards it already has", () => {
  // The page already fetches every card in the domain for its grid. A second
  // query would double this page's database reads for data it is holding.
  const src = read("src/app/domains/[slug]/page.tsx");
  assert.match(src, /members: cards\.map\(/, "the narrative must read the already-fetched rows");
  assert.equal(
    (src.match(/prisma\.card\.findMany/g) ?? []).length,
    1,
    "the domain page must still issue exactly one card query",
  );
});

test("the set page's narrative query is lean, cached and default-view only", () => {
  const src = read("src/app/sets/[set]/page.tsx");
  // Four scalar fields, not a tile payload — see the egress rules in lib/db.ts.
  assert.match(src, /\["set-narrative", set\.code, country\]/, "the narrative query must be cached per set+market");
  assert.match(src, /tags: \[CONTENT_TAG\]/, "and purged by the price import");
  assert.match(src, /const narrativeMembers = isDefaultView/, "filtered and paged views must not pay for it");
  assert.ok(!/select: cardTileSelect\(country\),\s*\}\),\s*\["set-narrative"/.test(src), "must not reuse the heavy tile select");
  // A failed narrative query must degrade to no intro, never take the page down.
  assert.match(src, /narrative query failed/, "the narrative query must fail open");
});

// ── What the generator must not do ───────────────────────────────────────────

test("an empty collection says so plainly rather than padding", () => {
  const out = build("domain", []);
  assert.equal(out.length, 1, "nothing to say means one sentence, not 150 words");
  assert.ok(!/\$/.test(out[0]), "no prices may be quoted for an empty collection");
});

test("a collection with no priced cards quotes no prices at all", () => {
  const out = build("set", [member("A", null), member("B", null)]);
  const text = out.join(" ");
  assert.ok(!/US\$/.test(text), `no price may appear when nothing is priced: ${text}`);
  assert.match(text, /none currently has a live listing/, "it must say why instead");
});

test("no card is named twice in the 'cards to know' line", () => {
  // Several printings of one card cluster at the top of a price sort, so the raw
  // top 3 read "Fury Rune …, Jhin …, Fury Rune …" — reads as a bug and wastes
  // one of only three slots.
  const line = build("domain", SAMPLE).find((p) => p.startsWith("The cards to know"));
  assert.ok(line, "expected a notable-cards line");
  // Parse from the list itself, not the whole sentence: card names contain
  // commas ("Jhin, Virtuoso"), so split on the "$price," separator instead.
  const list = line!.slice("The cards to know: ".length).split(". At the other end")[0];
  const names = list
    .split(/US\$[\d,]+\.\d{2},?\s*/)
    .map((s) => s.replace(/\s+at\s*$/, "").replace(/\.$/, "").trim())
    .filter(Boolean);
  assert.equal(new Set(names).size, names.length, `duplicate card named: ${names.join(" | ")}`);
  assert.ok(names.includes("Fury Rune"), `the dearest printing of a duplicated card should still be quoted: ${names.join(" | ")}`);
  assert.ok(names.includes("Jhin, Virtuoso"), "a name containing a comma must survive intact");
});

test("every quoted figure is derivable from the members passed in", () => {
  const out = build("domain", SAMPLE).join(" ");
  const quoted = [...out.matchAll(/US\$([\d,]+\.\d{2})/g)].map((m) => Math.round(Number(m[1].replace(/,/g, "")) * 100));
  const known = new Set<number>(SAMPLE.filter((m) => m.priceCents != null).map((m) => m.priceCents as number));
  known.add(683); // the site median, passed in explicitly
  // The median of the sample is also legitimately quotable.
  const vals = SAMPLE.filter((m) => m.priceCents != null).map((m) => m.priceCents as number).sort((a, b) => a - b);
  known.add(vals[Math.floor(vals.length / 2)]);
  for (const q of quoted) {
    assert.ok(known.has(q), `quoted US$${(q / 100).toFixed(2)} is not a figure that was passed in`);
  }
});

test("the count in the prose matches the members passed in", () => {
  const out = build("set", SAMPLE).join(" ");
  assert.match(out, new RegExp(`tracks ${SAMPLE.length} `), "the total must be the real member count");
  assert.match(out, /6 of which have a live price/, "the priced count must exclude nulls");
});

test("a small collection degrades instead of inventing a distribution", () => {
  // Under four priced members there is no meaningful median or concentration,
  // and the generator must not imply one.
  const out = build("domain", [member("Only One", 500)]).join(" ");
  assert.ok(!/median/.test(out), `a single card has no median: ${out}`);
  assert.ok(!/concentrated/.test(out), "nor a concentration story");
  assert.match(out, /US\$5\.00/, "but it should still state the one real price");
});

test("every collection kind produces prose and closes with buyer advice", () => {
  const kinds: CollectionKind[] = ["champion", "type", "rarity", "printing", "domain", "set", "keyword"];
  for (const k of kinds) {
    const out = build(k, SAMPLE);
    assert.ok(out.length >= 3, `${k}: expected several paragraphs, got ${out.length}`);
    assert.ok(words(out) >= 120, `${k}: only ${words(out)} words`);
    assert.ok(out[out.length - 1].length > 80, `${k}: must close with substantive buyer advice`);
  }
});

test("the same data produces different prose for a set and a domain", () => {
  // If the two templates read identically they are a near-duplicate pair, which
  // is the problem this was meant to solve rather than create.
  const a = build("set", SAMPLE).join(" ");
  const b = build("domain", SAMPLE).join(" ");
  assert.notEqual(a, b, "set and domain prose must differ");
  assert.match(b, /Domain decides what a card can go in/);
  assert.match(a, /Buying a set card by card and buying sealed are different questions/);
});
