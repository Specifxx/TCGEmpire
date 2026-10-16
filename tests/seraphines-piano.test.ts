import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GAMES, isGameKey } from "../src/lib/games";
import { NAV_GROUPS } from "../src/components/nav-groups";
import { STATIC_PAGE_DATES } from "../src/lib/static-page-dates";
import { LANES, SONGS, WINDOWS, accuracy, buildChart, grade, judge, laneForMidi, multiplierFor } from "../src/lib/seraphine-piano";

// ─────────────────────────────────────────────────────────────────────────────
// SERAPHINE'S PIANO (2026-10-16, owner: "get rid of the two games that are like
// the worst performing… come up with a new game… called Seraphine's Piano…
// related to the upcoming Radiance release… very graphic, very dynamic… the
// buttons aren't glitchy… everything's very smooth"). DECISIONS.md, "Seraphine's
// Piano". It replaced Card Rain and Pairs, the two least played games by search
// clicks and saved scores (the games-report workflow). This file pins the swap,
// the charts' playability and the choices that keep the game smooth.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const SRC = "src/components/games/SeraphinesPiano.tsx";
const PAGE = "src/app/games/seraphines-piano/page.tsx";

test("Card Rain and Pairs are gone, not merely unlinked, and their URLs 301 to the new game", () => {
  for (const p of ["src/components/games/CardRain.tsx", "src/app/games/card-rain/page.tsx", "src/components/games/Pairs.tsx", "src/app/games/pairs/page.tsx"]) {
    assert.ok(!existsSync(join(ROOT, p)), `${p} must be deleted`);
  }
  for (const k of ["card-rain", "pairs", "space-invaders"]) assert.ok(!isGameKey(k), `${k} must leave the leaderboard registry`);
  const cfg = read("next.config.js");
  for (const old of ["/games/space-invaders", "/games/card-rain", "/games/pairs"]) {
    const at = cfg.indexOf(`source: "${old}"`);
    assert.ok(at >= 0, `${old} must redirect`);
    const block = cfg.slice(at, at + 160);
    assert.match(block, /destination: "\/games\/seraphines-piano"/, `${old} points straight at the new game (no chain)`);
    assert.match(block, /permanent: true/);
  }
  const links = NAV_GROUPS.flatMap((g) => g.links).map((l) => l.href);
  assert.ok(!links.includes("/games/card-rain") && !links.includes("/games/pairs"));
});

test("Seraphine's Piano is registered everywhere a game has to be", () => {
  assert.ok(isGameKey("seraphines-piano"));
  assert.equal(GAMES["seraphines-piano"].dir, "desc");
  assert.ok(STATIC_PAGE_DATES["/games/seraphines-piano"], "static-page-dates (sitemap lastmod)");
  assert.match(read("src/lib/sitemap-sections.ts"), /\/games\/seraphines-piano/);
  assert.ok(NAV_GROUPS.flatMap((g) => g.links).some((l) => l.href === "/games/seraphines-piano"), "nav-groups");
  assert.match(read("src/app/games/page.tsx"), /href: "\/games\/seraphines-piano"/, "the arcade's spotlight");
  const page = read(PAGE);
  assert.match(page, /<Breadcrumbs\s+trail=\{\[\s*\{ name: "Games", href: "\/games" \},\s*\{ name: "Seraphine's Piano"/);
  assert.match(page, /export const revalidate = 86400;/, "no page under six hours (CLAUDE.md)");
  assert.match(read(SRC), /<GameResultExtras game="seraphines-piano"/, "scores reach the leaderboard");
});

test("three songs, harder ones denser and faster, every chart the same every time", () => {
  assert.deepEqual(SONGS.map((s) => s.difficulty), ["Easy", "Normal", "Hard"]);
  const charts = SONGS.map(buildChart);
  for (let i = 1; i < charts.length; i++) {
    assert.ok(charts[i].notes.length > charts[i - 1].notes.length, "each song has more notes than the last");
    assert.ok(SONGS[i].fallSpeed > SONGS[i - 1].fallSpeed);
  }
  assert.deepEqual(buildChart(SONGS[1]).notes, charts[1].notes, "deterministic");
  for (const s of SONGS) assert.ok(s.cardSlug.includes("-rad-"), "each song is named for a Radiance card");
});

test("every chart is playable: spread across all four keys, no lane crammed, every note on a key", () => {
  for (const s of SONGS) {
    const { notes } = buildChart(s);
    const per = Array.from({ length: LANES }, (_, l) => notes.filter((n) => n.lane === l).length);
    assert.ok(Math.min(...per) / Math.max(...per) >= 0.6, `${s.id}: lanes ${per.join("/")} are unbalanced`);
    for (let l = 0; l < LANES; l++) {
      const ts = notes.filter((n) => n.lane === l).map((n) => n.t);
      for (let i = 1; i < ts.length; i++) assert.ok(ts[i] - ts[i - 1] >= 0.2 - 1e-9, `${s.id}: two notes in lane ${l} closer than 0.2s`);
    }
    assert.ok(notes.every((n) => n.lane >= 0 && n.lane < LANES && n.t > 0));
  }
  assert.equal(laneForMidi(60), 0);
  assert.equal(laneForMidi(79), LANES - 1);
});

test("judging, multipliers and grades", () => {
  assert.equal(judge(0), "perfect");
  assert.equal(judge(-WINDOWS.perfect), "perfect");
  assert.equal(judge(0.08), "great");
  assert.equal(judge(-0.14), "good");
  assert.equal(judge(0.2), null, "outside every window is not a hit");
  assert.deepEqual([0, 9, 10, 25, 50, 200].map(multiplierFor), [1, 1, 2, 3, 4, 4]);
  assert.equal(accuracy({ perfect: 10, great: 0, good: 0, notes: 10 }), 1);
  assert.equal(grade(1, true), "S");
  assert.equal(grade(1, false), "D", "a run the crowd stopped is never graded above D");
  assert.equal(grade(0.86, true), "A");
});

test("built to be smooth: one audio clock, one canvas loop, no per-note React renders, instant input", () => {
  const src = read(SRC);
  assert.match(src, /ctx\.currentTime - run\.startAt - run\.latency/, "the song clock is the Web Audio clock");
  assert.match(src, /requestAnimationFrame\(frame\)/);
  assert.match(src, /onPointerDown=\{onPointerDown\}/, "pointerdown, not click");
  assert.match(src, /touch-none/, "no scroll or zoom stealing taps on the stage");
  assert.match(src, /document\.hidden\) pause\(\)/, "a hidden tab pauses instead of drifting");
  assert.match(src, /ctx\.suspend\(\)/, "pausing stops the clock itself");
  assert.match(src, /function noteSprite/, "notes are pre-rendered sprites, not live shadow blur");
  const frame = src.slice(src.indexOf("const frame = useCallback"), src.indexOf("useEffect(() => () => cancelAnimationFrame"));
  assert.doesNotMatch(frame, /\bset(Phase|Result|Bests|SongId|Muted)\(/, "the frame loop never sets React state directly");
  assert.match(read("src/app/globals.css"), /\.sp-float \{/, "the landing page's motion is CSS");
});
