import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { parseDeckList, resolveDeckLines, isSectionHeader, formatDeckLine, DECK_LINE_CAP, type ResolvableCard } from "../src/lib/deck";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// lib/deck.ts: the one parser + resolver behind /deck (which absorbed the Bulk
// Pricer on 2026-09-25), /api/deck/price and /api/basket.
// ─────────────────────────────────────────────────────────────────────────────

test("parses quantities, set numbers and a Signature's '*'", () => {
  const lines = parseDeckList("3 Jinx, Loose Cannon\n2x Vayne, Hunter (OGN-038)\n1 OGN-301*\n1 Viktor (SFD-039a)");
  assert.deepEqual(
    lines.map((l) => [l.qty, l.name, l.setCode, l.number]),
    [
      [3, "Jinx, Loose Cannon", undefined, undefined],
      [2, "Vayne, Hunter", "OGN", "038"],
      [1, "", "OGN", "301*"],
      [1, "Viktor", "SFD", "039a"],
    ]
  );
});

test("strict mode ignores lines without a quantity; plain-name mode prices them as one copy", () => {
  const text = "Jinx, Loose Cannon\n2 Ahri, Inquisitive\nKai'Sa, Survivor x3\nDarius, Hand of Noxus\t2";
  assert.deepEqual(parseDeckList(text).map((l) => l.name), ["Ahri, Inquisitive"]);
  assert.deepEqual(
    parseDeckList(text, { plainNames: true }).map((l) => [l.qty, l.name]),
    [
      [1, "Jinx, Loose Cannon"],
      [2, "Ahri, Inquisitive"],
      [3, "Kai'Sa, Survivor"],
      [2, "Darius, Hand of Noxus"],
    ]
  );
});

test("section headers are skipped, never priced as phantom cards", () => {
  // The Bulk Pricer prefixed "1 " onto these and the substring fallback matched
  // "Legend:" to Hall of Legends and "Champion:" to Scrapyard Champion.
  for (const h of ["Legend:", "Champion:", "Main Deck (40)", "MainDeck:", "Runes", "Runes - 12", "Battlefields: 3", "Sideboard", "Total: 40 cards", "Deck"]) {
    assert.ok(isSectionHeader(h), h);
  }
  for (const card of ["Hall of Legends", "Scrapyard Champion", "Fury Rune", "Stacked Deck"]) assert.ok(!isSectionHeader(card), card);
  const lines = parseDeckList("Legend:\n1 Jinx, Loose Cannon\nMain Deck (40)\n3 Stacked Deck\nRunes:\n6 Fury Rune\n1 Legend:", { plainNames: true });
  assert.deepEqual(lines.map((l) => l.name), ["Jinx, Loose Cannon", "Stacked Deck", "Fury Rune"]);
  // "Legend: Jinx" on one line keeps the card.
  assert.deepEqual(parseDeckList("Legend: Jinx, Loose Cannon", { plainNames: true }).map((l) => l.name), ["Jinx, Loose Cannon"]);
});

test("formatDeckLine round-trips a pinned printing, Signature '*' included", () => {
  const sig = { name: "Viktor, Herald", setCode: "OGN", collectorNumber: "301*/298" };
  const [l] = parseDeckList(formatDeckLine(2, sig));
  assert.deepEqual([l.qty, l.name, l.setCode, l.number], [2, "Viktor, Herald", "OGN", "301*"]);
  assert.equal(formatDeckLine(1, sig, false), "1 Viktor, Herald");
});

// ── resolveDeckLines against an in-memory "database" ─────────────────────────

interface C extends ResolvableCard {
  name: string;
  price: number;
}
const CARDS: C[] = [
  { id: "ogn-251", name: "Jinx, Loose Cannon", nameNormalized: "jinxloosecannon", setCode: "OGN", collectorNumber: "251/298", price: 900 },
  { id: "ogn-251-promo", name: "Jinx, Loose Cannon", nameNormalized: "jinxloosecannon", setCode: "OGP", collectorNumber: "251/298", price: 400 },
  { id: "sfd-251", name: "Other Card", nameNormalized: "othercard", setCode: "SFD", collectorNumber: "251/221", price: 50 },
  { id: "ogn-301", name: "Viktor, Herald", nameNormalized: "viktorherald", setCode: "OGN", collectorNumber: "301/298", price: 100 },
  { id: "ogn-301s", name: "Viktor, Herald", nameNormalized: "viktorherald", setCode: "OGN", collectorNumber: "301*/298", price: 9000 },
  { id: "hall", name: "Hall of Legends", nameNormalized: "halloflegends", setCode: "OGN", collectorNumber: "280/298", price: 30 },
  { id: "kaisa", name: "Kai'Sa, Survivor", nameNormalized: "kaisasurvivor", setCode: "OGN", collectorNumber: "100/298", price: 200 },
];

// Just enough of Prisma's where-clause semantics for the shapes resolveDeckLines
// sends; results come back cheapest first, as the routes' orderBy does.
function matches(c: C, w: Prisma.CardWhereInput): boolean {
  for (const [k, v] of Object.entries(w)) {
    if (k === "OR") {
      if (!(v as Prisma.CardWhereInput[]).some((x) => matches(c, x))) return false;
    } else if (k === "setCode") {
      if (c.setCode !== v) return false;
    } else if (k === "collectorNumber") {
      if (typeof v === "string" ? c.collectorNumber !== v : !c.collectorNumber.startsWith((v as { startsWith: string }).startsWith)) return false;
    } else if (k === "nameNormalized") {
      const f = v as { in?: string[]; contains?: string };
      if (f.in && !f.in.includes(c.nameNormalized)) return false;
      if (f.contains && !c.nameNormalized.includes(f.contains)) return false;
    } else {
      throw new Error(`unexpected where key ${k}`);
    }
  }
  return true;
}
function db() {
  const calls: { where: Prisma.CardWhereInput; take?: number }[] = [];
  const find = async (args: { where: Prisma.CardWhereInput; take?: number }) => {
    calls.push(args);
    const hits = CARDS.filter((c) => matches(c, args.where)).sort((a, b) => a.price - b.price);
    return args.take != null ? hits.slice(0, args.take) : hits;
  };
  return { find, calls };
}

test("set + number is scoped to the line's set, and keeps the Signature printing", async () => {
  const { find } = db();
  const r = await resolveDeckLines(parseDeckList("1 OGN-251\n2 Viktor, Herald (OGN-301*)\n1 Viktor, Herald (OGN-301)"), find);
  assert.deepEqual(
    r.items.map((it) => it.card?.id),
    // Not SFD's cheaper 251, not the Signature for a plain 301.
    ["ogn-251", "ogn-301s", "ogn-301"]
  );
  assert.equal(r.fuzzy.length, 0);
});

test("exact name takes the cheapest printing; unmatched lines come back, not dropped", async () => {
  const { find } = db();
  const r = await resolveDeckLines(parseDeckList("3 Jinx, Loose Cannon\n1 Nobody Here At All", { plainNames: true }), find);
  assert.equal(r.matched.length, 1);
  assert.equal(r.matched[0].card.id, "ogn-251-promo", "cheapest printing of the name");
  assert.equal(r.matched[0].fuzzy, false);
  assert.deepEqual(r.unmatched.map((l) => l.raw), ["1 Nobody Here At All"]);
});

test("the contains fallback is flagged fuzzy and bounded by a take", async () => {
  const { find, calls } = db();
  const r = await resolveDeckLines(parseDeckList("Kai'Sa\nViktor", { plainNames: true }), find);
  assert.deepEqual(r.fuzzy.map((f) => f.card.id).sort(), ["kaisa", "ogn-301"]);
  assert.ok(r.matched.every((m) => m.fuzzy));
  const contains = calls.find((c) => JSON.stringify(c.where).includes("contains"));
  assert.ok(contains, "a contains query ran");
  assert.equal(contains!.take, 10, "five rows per unresolved line");
});

test("the fallback's take never exceeds 200, and at most DECK_LINE_CAP lines are resolved", async () => {
  const { find, calls } = db();
  const text = Array.from({ length: 250 }, (_, i) => `1 zzzz${i}`).join("\n");
  const r = await resolveDeckLines(parseDeckList(text), find);
  assert.equal(r.items.length, DECK_LINE_CAP);
  const contains = calls.find((c) => JSON.stringify(c.where).includes("contains"));
  assert.equal(contains!.take, 200);
  assert.ok(calls.length <= 3, "at most three queries");
});

test("header lines are skipped by the resolver too, even if handed in", async () => {
  const { find } = db();
  const r = await resolveDeckLines([{ raw: "1 Legend:", qty: 1, name: "Legend:" }, { raw: "1 Legends", qty: 1, name: "Legends" }], find);
  assert.equal(r.items.length, 0, "no phantom Hall of Legends");
});

test("/api/deck/price uses the shared resolver, rate-limits per IP and ships only what /deck renders", () => {
  const src = read("src/app/api/deck/price/route.ts");
  assert.match(src, /resolveDeckLines\(lines, \(args\) => prisma\.card\.findMany\(\{ \.\.\.args, select: cardSelect, orderBy \}\)\)/);
  assert.match(src, /parseDeckList\(text, \{ plainNames: true \}\)/);
  assert.match(src, /rateLimit\(`deck-price:\$\{clientIp\(req\)\}`/);
  const select = src.slice(src.indexOf("const cardSelect"), src.indexOf("} as const"));
  assert.match(select, /imageUrl: true/, "the preview pane shows the full-size art (cardImageSrc(preview, { full: true }))");
  const code = src.replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(code, /unitPriceCents|lineCents/, "the client prices lines from the card's own per-market prices");
  assert.match(src, /card: card \? withoutKey\(card\) : null/, "nameNormalized is resolution-only");
  assert.match(src, /status: 503/);
});

test("/deck's list pricer computes its notice from the response, not inside a state updater", () => {
  // The Bulk Pricer built "Added N cards" from counters mutated inside a
  // setPicked updater React hadn't run yet — so it always said "Added 0".
  const src = read("src/components/DeckBuilder.tsx");
  const fn = src.slice(src.indexOf("async function price("), src.indexOf("// If the page was opened from a shared link"));
  assert.doesNotMatch(fn, /setLines\(\(/, "no updater function");
  assert.ok(fn.indexOf("const missed") < fn.indexOf("setNotice("));
  assert.match(fn, /missed\.length/);
});
