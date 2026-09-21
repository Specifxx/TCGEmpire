import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spoilersHrefForSet } from "../src/lib/release-calendar";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// Comments STRIPPED. The "must name no set" assertions below are about the
// CODE, and every one of these files carries a doc comment that names Radiance
// on purpose — explaining that the link rolls forward to the next set is the
// whole point of the comment, and a test that bans the explanation along with
// the hardcoding would be read as "delete the comment", which is backwards.
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

// ─────────────────────────────────────────────────────────────────────────────
// A SET'S REVEAL TRACKER MUST BE REACHABLE FROM THE SITE'S OWN PROMOTION
// SURFACES WHILE THAT SET IS STILL UPCOMING.
// ─────────────────────────────────────────────────────────────────────────────
// Added 2026-09-21, four days before Radiance Preview Season opens.
//
// WHAT THESE ARE PROTECTING. `riftbound radiance spoilers` and
// `riftbound radiance card list` were the site's #2 and #5 Search Console
// queries (1,152 and 817 impressions in 28 days), and the tracker built to own
// them was linked from the set page and nothing else. The homepage did not link
// it, the daily Discord post did not mention it, and the Friday promo pack — the
// one artefact whose entire job is to be pasted somewhere — was movers-only. The
// site's best page for its best queries had no path from its own front door
// during the one month it mattered.
//
// WHY THE TESTS ARE SHAPED LIKE THIS. Every assertion below is about the
// PLUMBING being set-agnostic, not about Radiance. Each of these surfaces has
// rotted before by hardcoding the set of the moment: the daily Discord post used
// to feature a market wrap that was later deleted, and /release-dates exists at
// all because /radiance-countdown and /vendetta-countdown were hand-written
// pages that died on release day. So what is pinned is that the link is resolved
// from the release calendar and retires on the street date by itself — a future
// set inherits the whole arrangement with one `spoilersHref` line and no code
// change on any of these three surfaces.

test("spoilersHrefForSet returns a set's tracker while it is upcoming, and nothing after release", () => {
  const before = new Date("2026-10-22T00:00:00Z");
  const onRelease = new Date("2026-10-23T00:00:00Z");
  const after = new Date("2026-11-01T00:00:00Z");

  assert.equal(spoilersHrefForSet("RAD", before), "/blog/riftbound-radiance-spoilers");
  // Release day itself: the tracker either flips to a past-tense title or
  // redirects to the set page, so the promotion surfaces must stop pointing at
  // it WITHOUT anyone remembering to edit them.
  assert.equal(spoilersHrefForSet("RAD", onRelease), null);
  assert.equal(spoilersHrefForSet("RAD", after), null);

  // A set with no tracker, and an unknown code, both resolve to nothing rather
  // than throwing — every call site treats null as "render no link".
  assert.equal(spoilersHrefForSet("OGN", before), null);
  assert.equal(spoilersHrefForSet(undefined, before), null);
  assert.equal(spoilersHrefForSet("NOPE", before), null);
});

test("the tracker a set advertises actually exists as an article", () => {
  const articles = read("src/lib/articles.ts");
  const calendar = read("src/lib/release-calendar.ts");
  const hrefs = [...calendar.matchAll(/spoilersHref: "\/blog\/([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 0, "no spoilersHref rows in the release calendar");
  for (const slug of hrefs) {
    assert.ok(
      articles.includes(`slug: "${slug}"`),
      `release-calendar points at /blog/${slug} but no article has that slug`,
    );
  }
});

test("the homepage's next-set line links the tracker, resolved from the calendar", () => {
  const sections = read("src/components/home/HomeSections.tsx");
  const card = read("src/components/home/NextSetCountdownCard.tsx");

  // Resolved by the CALLER from the calendar — not hardcoded in the component,
  // which is the rule the `preorders` prop right next to it already follows.
  assert.match(sections, /spoilersHrefForSet\(nextSet\.code\)/);
  assert.match(sections, /<NextSetCountdownCard[\s\S]{0,400}?spoilers=\{/);
  assert.match(card, /spoilers\?: \{ href: string; setName: string \} \| null;/);
  assert.match(card, /\{spoilers && \([\s\S]{0,300}?href=\{spoilers\.href\}/);

  // Naming a set in either file is the failure mode this whole arrangement
  // exists to prevent.
  assert.ok(!/radiance/i.test(code("src/components/home/NextSetCountdownCard.tsx")),
    "NextSetCountdownCard must name no set");
});

test("the daily Discord post features the upcoming set's tracker", () => {
  const discord = read("src/lib/discord.ts");
  assert.match(discord, /spoilersHrefForSet\(upcoming\.code\)/);
  // Led ahead of the Riftle prompt during the window, and the Riftle-only post
  // is still what ships once the set lands.
  assert.match(discord, /embeds: spoilers \? \[spoilers, riftle\] : \[riftle\]/);
  assert.ok(!/radiance/i.test(code("src/lib/discord.ts")), "the daily post must name no set");
});

test("the Friday promo pack carries the tracker on all three channels", () => {
  const promo = read("scripts/weekly-promo.ts");
  assert.match(promo, /function spoilerPromo\(/);
  // The pack's value is that it is paste-ready; a channel that silently omits
  // the seasonal link is the one the owner would have to hand-edit every week.
  for (const source of ["reddit", "twitter", "discord"]) {
    assert.match(
      promo,
      new RegExp(`spoilerPromo\\("${source}"\\)`),
      `the ${source} half of the promo pack does not include the reveal tracker`,
    );
  }
  assert.ok(!/radiance/i.test(code("scripts/weekly-promo.ts")), "the promo pack must name no set");
});
