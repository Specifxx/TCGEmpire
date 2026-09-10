import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GAMES, isGameKey } from "../src/lib/games";
import { NAV_GROUPS } from "../src/components/nav-groups";
import { STATIC_PAGE_DATES } from "../src/lib/static-page-dates";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const SRC = "src/components/games/CardRain.tsx";
const PAGE = "src/app/games/card-rain/page.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// Card Rain replaced the arcade's Space Invaders clone on 2026-09-10 (the
// shooter was the wrong game: the brief was always cards falling from the sky,
// caught for points, with power-ups). A game swap touches SIX registration
// points beyond the component itself — leaderboard registry, nav, sitemap,
// static-page-dates, the arcade shelf and a redirect for the retired URL — and
// missing any one of them leaves either a dead link or an orphan page. That is
// what this file pins.
// ─────────────────────────────────────────────────────────────────────────────

test("the old Space Invaders game is gone, not merely unlinked", () => {
  for (const p of ["src/components/games/SpaceInvaders.tsx", "src/app/games/space-invaders/page.tsx"]) {
    assert.throws(() => readFileSync(join(ROOT, p), "utf8"), `${p} must be deleted — the game was replaced`);
  }
  // A leaderboard key with no game behind it would keep accepting scores.
  assert.ok(!isGameKey("space-invaders"), "the retired game must not stay in the leaderboard registry");
});

test("/games/space-invaders 301s to the game that replaced it", () => {
  // The route is deleted, so without this the URL 404s — a week of indexing and
  // any shared link with it. tests/watchlist-*.test.ts's "NO next.config.js
  // redirect shadows a real app route" covers the other half of this rule.
  const cfg = read("next.config.js");
  const at = cfg.indexOf('source: "/games/space-invaders"');
  assert.ok(at >= 0, "next.config.js must 301 the retired game URL");
  const block = cfg.slice(at, at + 160);
  assert.match(block, /destination: "\/games\/card-rain"/, "must point at the replacement game");
  assert.match(block, /permanent: true/, "a replaced game is a permanent move, not a temporary one");
});

test("Card Rain is registered everywhere a game has to be", () => {
  assert.ok(isGameKey("card-rain"), "leaderboard registry");
  assert.equal(GAMES["card-rain"].dir, "desc", "higher score wins");
  assert.equal(GAMES["card-rain"].unit, "pts");

  assert.ok(STATIC_PAGE_DATES["/games/card-rain"], "static-page-dates (sitemap lastmod reads this)");
  assert.match(read("src/lib/sitemap-sections.ts"), /\/games\/card-rain/, "sitemap");
  assert.ok(
    NAV_GROUPS.flatMap((g) => g.links).some((l) => l.href === "/games/card-rain"),
    "nav-groups (the command launcher reads this)",
  );
  assert.match(read("src/app/games/page.tsx"), /href: "\/games\/card-rain"/, "the arcade shelf must carry a tile");
});

test("the game is what it says on the tin: falling cards, caught for points, with power-ups", () => {
  const src = read(SRC);
  // The three things the game IS — pinned because this component replaced one
  // that did none of them.
  assert.match(src, /BASE_FALL/, "cards must fall");
  assert.match(src, /const POWERS:/, "power-ups must exist as a real, enumerated list");
  assert.match(src, /tierPts\(card\.priceCents\)/, "catching a card must score on its live price, like the rest of the arcade");
  // And the thing it must NOT be any more.
  assert.doesNotMatch(src, /playerBullets|enemyBullets|\bfire\(/, "no shooting — this is a catcher");
});

test("every power-up in the list is real, distinct, and handled by the tick loop", () => {
  const src = read(SRC);
  const kinds = [...src.matchAll(/\{ kind: "(\w+)", emoji:/g)].map((m) => m[1]);
  assert.ok(kinds.length >= 4, `expected a real spread of power-ups, found ${kinds.length}`);
  assert.equal(new Set(kinds).size, kinds.length, "duplicate power-up kinds");

  // "life" is instant; every other kind is timed and must have a duration, or it
  // would be caught and silently do nothing.
  const timed = kinds.filter((k) => k !== "life");
  const durations = src.slice(src.indexOf("const POWER_MS"), src.indexOf("const SLOW_FACTOR"));
  for (const k of timed) {
    assert.match(durations, new RegExp(`${k}:\\s*\\d+`), `${k} has no duration in POWER_MS`);
  }
  // Each timed effect has to be read somewhere in the loop, not just declared.
  for (const k of timed) {
    assert.ok(
      src.includes(`timersRef.current.${k} >`) || src.includes(`t[it.power]`),
      `${k} is never checked during play`,
    );
  }
});

test("dropping a card costs a life, and only a card", () => {
  // The whole score curve depends on this: a missed power-up is a missed bonus,
  // a missed CARD is what eventually ends the run.
  const src = read(SRC);
  const missBlock = src.slice(src.indexOf("if (y > 100)"), src.indexOf("survivors.push"));
  assert.match(missBlock, /it\.kind === "card"/, "the life cost must be gated on the item being a card");
  assert.match(missBlock, /lifeLost/, "a dropped card must cost a life");
  assert.match(missBlock, /comboNow = 0/, "a drop must break the combo");
});

test("every game page shows exactly ONE breadcrumb trail — the one with the JSON-LD", () => {
  // All eight game pages render <Breadcrumbs> (which emits the BreadcrumbList
  // that scripts/adsense-guard.ts budgets for). GameShell used to ALSO render
  // its own "🎮 Games / <title>" nav, so every one of them displayed two trails
  // stacked on top of each other — confirmed in a browser on /games/card-rain,
  // costing ~25px directly above the playfield on the phones least able to
  // spare it. The shell's copy was the redundant one and is gone.
  // Comments stripped: the prop's own docs explain what was removed and why,
  // and a doc comment describing the old markup is not the old markup.
  const shell = read("src/components/games/shared.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(shell, /aria-label="Breadcrumb"/, "GameShell must not render a second breadcrumb trail");
  assert.doesNotMatch(shell, /🎮 Games/, "…nor the visible link that trail was made of");

  // …which only works because the PAGE carries the real one, every time.
  const pages = readdirSync(join(ROOT, "src/app/games"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `src/app/games/${e.name}/page.tsx`);
  assert.ok(pages.length >= 8, `expected the full arcade, found ${pages.length} game pages`);
  for (const p of pages) {
    assert.match(read(p), /<Breadcrumbs\s/, `${p} has no breadcrumb trail at all now`);
  }
});

test("the page describes the game it actually ships, and carries its own how-to-play", () => {
  const page = read(PAGE);
  assert.match(page, /<CardRain \/>/);
  assert.match(page, /How to play/);
  // Each power-up named in the copy must be one the game really has — the exact
  // drift this arcade's own PITCH_TOOLS-style lists keep proving is easy.
  const src = read(SRC);
  for (const label of [...src.matchAll(/label: "([^"]+)", weight:/g)].map((m) => m[1])) {
    assert.ok(page.includes(label), `the page's how-to-play never mentions the "${label}" power-up`);
  }
  assert.doesNotMatch(page, /shoot|formation|invader/i, "leftover shooter copy");
});
