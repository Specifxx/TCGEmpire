import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RELEASES,
  assumedStreetInstant,
  latestRelease,
  nextDatedRelease,
  releaseDateLabel,
  splitCalendar,
} from "../src/lib/release-calendar";
import { SETS } from "../src/lib/constants";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// THE RELEASE PAGE MUST NOT ROT ON A DATE.
//
// /vendetta-countdown went stale on 31 Jul 2026 and had to be retired by hand.
// /radiance-countdown was built to replace it and would have gone stale on 23
// Oct 2026 in exactly the same way — a hard-coded date, a hard-coded set name,
// a hard-coded "23 October 2026" in the smoke test, and an Event schema that
// needed a manual `released` branch to stop advertising an event that had
// already happened.
//
// /release-dates reads the calendar and splits it at today's date instead. These
// tests are the guard on that: they roll the clock forward past every announced
// release and assert the page still tells the truth at each point. If a later
// change reintroduces a hard-coded set anywhere in this path, one of these fails
// BEFORE the date it would have failed on in production.
// ─────────────────────────────────────────────────────────────────────────────

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

test("the calendar splits at today's date, and rolls forward on its own", () => {
  // Before Radiance ships: Vendetta is the newest release, Radiance is next.
  const before = at("2026-09-01");
  assert.equal(latestRelease(before)?.name, "Vendetta");
  assert.equal(nextDatedRelease(before)?.name, "Radiance");

  // The day after Radiance ships — no code change, no deploy — Radiance is out
  // and Legacy is the countdown. This is the entire point of the rewrite.
  const afterRadiance = at("2026-10-24");
  assert.equal(latestRelease(afterRadiance)?.name, "Radiance");
  assert.equal(nextDatedRelease(afterRadiance)?.name, "Legacy");

  // And again, one release later. The February 2027 boxed decks sit between
  // Legacy and The Reckoning with a window rather than a date, and must not
  // count as out — nor block anything behind them (see isOut()).
  const afterLegacy = at("2027-02-01");
  assert.equal(latestRelease(afterLegacy)?.name, "Legacy");
  assert.equal(nextDatedRelease(afterLegacy)?.name, "The Reckoning");

  // The bug a slice-at-the-first-future-row split would have shipped: a dated
  // set that has plainly released still reading as upcoming, forever, because an
  // undated placeholder ahead of it never resolves.
  const afterReckoning = at("2027-05-01");
  assert.equal(latestRelease(afterReckoning)?.name, "The Reckoning");
  assert.ok(
    splitCalendar(afterReckoning).released.some((r) => r.name === "The Reckoning"),
    "a released set must not be held upcoming by an undated placeholder before it",
  );

  // Every entry lands on exactly one side of the split, at every point in time.
  for (const day of ["2026-09-01", "2026-10-24", "2027-02-01", "2027-05-01"]) {
    const { released, upcoming } = splitCalendar(at(day));
    assert.equal(released.length + upcoming.length, RELEASES.length, `entries lost or duplicated at ${day}`);
  }
});

test("undated historical sets stay on the released side, and placeholders stay upcoming", () => {
  const { released, upcoming } = splitCalendar(at("2026-09-01"));
  // Riot never published street dates for these four. They must not be pushed
  // into "upcoming" by a date test just because they have no date.
  for (const name of ["Origins", "Origins: Proving Grounds", "Spirit Forged", "Unleashed"]) {
    assert.ok(released.some((r) => r.name === name), `${name} must count as released`);
  }
  // A window-only slot ("Q3 2027") has no date to compare, and must never read
  // as already out.
  for (const name of ["Set 8", "Set 9"]) {
    assert.ok(upcoming.some((r) => r.name === name), `${name} is a placeholder slot and must stay upcoming`);
  }
  // …even long after its window has passed, since a slot that ships gets a real
  // date before it does.
  assert.ok(splitCalendar(at("2028-06-01")).upcoming.some((r) => r.name === "Set 9"));
});

test("a window-only entry never also carries a date", () => {
  // Both set means splitCalendar's own rule is ambiguous, and releaseWhenLabel
  // would silently prefer one and drop the other.
  for (const r of RELEASES) {
    assert.ok(!(r.date && r.window), `${r.name} sets both date and window`);
  }
});

test("the assumed street hour follows daylight saving instead of being frozen", () => {
  // The Radiance page hard-coded "2026-10-23T07:00:00.000Z" — correct for a PDT
  // date, and an hour wrong for any PST one. Computing it from Riot's time zone
  // is what makes the countdown right for every future set, not just this one.
  assert.equal(assumedStreetInstant("2026-10-23"), "2026-10-23T07:00:00.000Z"); // PDT, UTC-7
  assert.equal(assumedStreetInstant("2027-01-29"), "2027-01-29T08:00:00.000Z"); // PST, UTC-8
  assert.equal(assumedStreetInstant("2027-04-30"), "2027-04-30T07:00:00.000Z"); // PDT again
  assert.equal(assumedStreetInstant(null), null);
  assert.equal(assumedStreetInstant("not-a-date"), null);
});

test("dates render in the site's own format", () => {
  assert.equal(releaseDateLabel("2026-10-23"), "23 October 2026");
  assert.equal(releaseDateLabel("2026-07-31"), "31 July 2026");
  assert.equal(releaseDateLabel(null), null);
});

test("the calendar agrees with SETS, which drives the rest of the site", () => {
  // Two sources of truth for the same fact is how a set page ends up saying one
  // date and the release page another. Where both know something, they match.
  for (const entry of RELEASES) {
    if (!entry.code) continue;
    const set = SETS.find((s) => s.code === entry.code);
    assert.ok(set, `${entry.name} claims set code ${entry.code}, which is not in SETS`);
    assert.equal(entry.name, set!.name, `${entry.code}: name disagrees with SETS`);
    if (set!.releasedOn) assert.equal(entry.date, set!.releasedOn, `${entry.code}: date disagrees with SETS`);
    if (set!.totalCards != null) assert.equal(entry.cards, set!.totalCards, `${entry.code}: card count disagrees with SETS`);
  }
  // The next upcoming set on the calendar must be the same one constants.ts
  // hands the homepage teaser, or the homepage and this page advertise different
  // "next sets".
  const next = nextDatedRelease(at("2026-09-01"));
  assert.equal(next?.code, "RAD");
});

test("nothing in the release path hard-codes the set that happens to be next", () => {
  // The failure mode this whole change exists to prevent. A set name written
  // into the page, the metadata or the smoke test is a line that becomes false
  // on a date already in the calendar — which is exactly how both predecessors
  // of this page died.
  const page = read("src/app/release-dates/page.tsx");
  const body = page.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const name of ["Radiance", "Legacy", "Vendetta"]) {
    assert.ok(!body.includes(name), `release-dates/page.tsx names "${name}" outside a comment`);
  }
  // A bare year is fine — /blog/riftbound-2027-set-roadmap is a real article
  // slug, and linking to it is not a staleness risk. A DATE literal is the thing
  // that goes wrong: the old page carried "23 October 2026" in its H1, its title
  // and its Event schema, and "2026-10-23T07:00:00.000Z" as the countdown target.
  for (const pattern of [
    /\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/,
    /\d{4}-\d{2}-\d{2}/,
  ]) {
    assert.ok(!pattern.test(body), `release-dates/page.tsx hard-codes a date (${pattern}) outside a comment`);
  }

  const smoke = read("scripts/smoke-pages.ts");
  const entry = /\{[^{}]*path: "\/release-dates"[\s\S]*?\n  \}/.exec(smoke);
  assert.ok(entry, "expected a /release-dates smoke entry");
  assert.ok(
    !/23 October 2026|Radiance/.test(entry![0].replace(/\/\/.*$/gm, "")),
    "the smoke check must assert set-agnostic content, not the current set's date",
  );
});

test("the retired countdown URLs redirect instead of 404ing", () => {
  const config = read("next.config.js");
  for (const source of ["/vendetta-countdown", "/radiance-countdown"]) {
    assert.match(
      config,
      new RegExp(`source: "${source}", destination: "[^"]+", permanent: true`),
      `${source} was internally linked and indexed — it must 301, not 404`,
    );
  }
  // A redirecting URL in a sitemap is a soft error in Search Console.
  const sitemap = read("src/lib/sitemap-sections.ts");
  assert.ok(!/\$\{SITE_URL\}\/radiance-countdown/.test(sitemap), "a redirected URL must not stay in the sitemap");
  assert.match(sitemap, /\$\{SITE_URL\}\/release-dates/, "the release page must be submitted");
});
