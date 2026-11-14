import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARTICLES } from "../src/lib/articles";
import { BANNED_CARDS, BANLIST_UPDATED, banFor, banIsUpcoming } from "../src/lib/banlist";

// Riot announced its fourth ban wave on 13 November 2026, effective 23
// November: eight cards and two battlefields, on the Standard and Constructed
// 2v2 lists together. The table, the guide, a news post and the hub references
// all had to move, and a ban announced ten days ahead must not read "since".

const WAVE = [
  "Riven, Broken Blade",
  "Zhonya's Hourglass",
  "Stellacorn Herder",
  "Nocturne, Horrifying",
  "Rhasa the Sunderer",
  "Brynhir Thundersong",
  "Dazzling Aurora",
  "Baited Hook",
  "Emperor's Dais",
  "Star Spring",
];

test("the ban data carries all ten November cards, in both formats, from 23 November", () => {
  assert.equal(BANLIST_UPDATED, "2026-11-13");
  for (const name of WAVE) {
    const b = banFor(name);
    assert.ok(b, `${name} is missing from BANNED_CARDS`);
    assert.equal(b!.effective, "2026-11-23");
    assert.deepEqual(b!.formats, ["Standard", "2v2"]);
  }
  assert.equal(BANNED_CARDS.length, 23);
  assert.equal(BANNED_CARDS.filter((b) => b.formats.includes("Standard")).length, 22);
});

test("every November card's slug is a real card in the public catalogue", () => {
  const cards = JSON.parse(readFileSync("data/public/cards.json", "utf8")) as { slug: string }[];
  const slugs = new Set(cards.map((c) => c.slug));
  const missing = BANNED_CARDS.filter((b) => b.effective === "2026-11-23" && !slugs.has(b.slug)).map((b) => b.slug);
  assert.deepEqual(missing, []);
});

test("a ban that is announced but not in force reads as upcoming, and stops on its date", () => {
  const riven = banFor("Riven, Broken Blade")!;
  assert.equal(banIsUpcoming(riven, new Date("2026-11-14T00:00:00Z")), true);
  assert.equal(banIsUpcoming(riven, new Date("2026-11-23T00:00:00Z")), false);
  assert.equal(banIsUpcoming(banFor("Stacked Deck")!, new Date("2026-11-14T00:00:00Z")), false);
  assert.match(readFileSync("src/components/BanNotice.tsx", "utf8"), /banIsUpcoming\(ban\) \? "from" : "since"/);
});

test("the guide names every November card, and its title counts 23", () => {
  const g = ARTICLES.find((a) => a.slug === "riftbound-banlist-explained")!;
  assert.equal(g.title, "Riftbound Ban List (Nov 2026): 23 Banned Cards");
  for (const name of WAVE) assert.ok(g.body.includes(name), `${name} missing from the guide`);
  assert.match(g.body, /\/blog\/riftbound-november-2026-bans-riven-baited-hook/);
});

test("the November post exists, names every card, sources Riot and links the guide", () => {
  const p = ARTICLES.find((a) => a.slug === "riftbound-november-2026-bans-riven-baited-hook");
  assert.ok(p, "expected the November ban post");
  for (const name of WAVE) assert.ok(p!.body.includes(name), `${name} missing from the post`);
  assert.match(p!.body, /playriftbound\.com\/en-us\/news\/announcements\/radiance-ban-list-updates-effective-november-23-2026/);
  assert.match(p!.body, /\/guides\/riftbound-banlist-explained/);
  assert.ok(p!.body.trim().split(/\s+/).length >= 1500);
  const refs = [...p!.body.matchAll(/\[\[embed:(\d+)\]\]/g)].map((m) => Number(m[1]));
  assert.deepEqual(refs, [0]);
  assert.equal(p!.embeds!.length, 1);
});
