import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const TILE = read("src/components/CardTile.tsx");

// ─────────────────────────────────────────────────────────────────────────────
// THE PRICE MUST NEVER RENDER THROUGH THE STORE COUNT BESIDE IT.
// ─────────────────────────────────────────────────────────────────────────────
// Reported from /watching, 2026-09-22, with a screenshot: "A$3,113" printed on
// top of the green store count, on an Overnumbered UNL card.
//
// The mechanism, because it is easy to reintroduce. The price row was a plain
// `justify-between` with `min-w-0` on the price block and `shrink-0` on the
// count. `min-w-0` only lets a flex child shrink below its content width — it
// does NOT clip anything. Without a `truncate` on the text itself the price
// simply overflowed its own column, and because the sibling refused to shrink,
// it overflowed straight across it.
//
// Three things hold it now, and each has a distinct job:
//   - min-w on the price block, so it refuses to squeeze. This is what makes
//     the wrap fire; `flex-1` alone has a flex-basis of 0 and would shrink to
//     nothing before ever wrapping.
//   - flex-wrap on the row, so the count drops to its own line instead.
//   - truncate on the price, as the last resort if even that is not enough.
test("the card tile's price row cannot overlap its store count", () => {
  const row = TILE.match(/<div className="mt-auto flex[^"]*"/);
  assert.ok(row, "expected the price row to still be the mt-auto flex row");
  assert.match(row![0], /\bflex-wrap\b/, "the price row must wrap rather than let its children collide");

  assert.match(
    TILE,
    /<div className="min-w-\[min\([\d.]+rem,100%\)\] flex-1">/,
    "the price block needs a real min-width, capped at its container — min-w-0 lets it shrink to nothing, and an uncapped rem minimum is wider than a narrow tile so truncate never engages",
  );

  const priceLine = TILE.match(/<div className="[^"]*text-accent[^"]*">/);
  assert.ok(priceLine, "expected the price to still be the text-accent div");
  assert.match(
    priceLine![0],
    /\btruncate\b/,
    "the price must truncate; without it min-w-0 does nothing and the text overflows across the store count",
  );
});

// The reported screenshot also showed names cut to about six characters
// ("Baron…", "Chemt…") because a single clamped line is very short once a tile
// is narrow. Two lines is the difference between a name and a prefix.
test("a card name gets two lines, not one", () => {
  assert.match(TILE, /<h3 className="line-clamp-2 /, "card names clamp to two lines so narrow tiles stay readable");
  assert.doesNotMatch(TILE, /<h3 className="line-clamp-1 /, "one clamped line truncates names to a few characters on a narrow tile");
});

// 12px of padding on every side is a quarter of a tile's width on a two-up
// phone grid, and it comes straight out of the card art.
test("the tile's image padding scales down on small tiles", () => {
  assert.match(
    TILE,
    /aspect-\[5\/7\] w-full overflow-hidden p-1\.5 sm:p-3/,
    "the image box must use smaller padding below sm, or the art loses a quarter of its width on phones",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// The watchlist grid, and the control it tells you to tap.
// ─────────────────────────────────────────────────────────────────────────────
const WATCHLIST = read("src/components/Watchlist.tsx");
const WATCHING_PAGE = read("src/app/watching/page.tsx");

test("the watchlist holds two columns until there is room for three", () => {
  // sm:grid-cols-3 put three tiles in 640px — about 190px each before padding,
  // which is where the names became prefixes. md: gives each tile ~235px.
  const grids = [...WATCHLIST.matchAll(/className="grid grid-cols-2[^"]*"/g)].map((m) => m[0]);
  assert.ok(grids.length >= 2, "expected both the skeleton grid and the real grid");
  for (const g of grids) {
    assert.doesNotMatch(g, /\bsm:grid-cols-3\b/, "three columns at 640px is too narrow for a card name");
    assert.match(g, /\bmd:grid-cols-3\b/, "three columns should start at md");
  }
});

test("the watchlist tells you to tap the control that actually exists", () => {
  // PriceWatchButton became a heart on 2026-09-21 ("the wishlist icon should be
  // a heart and not a bell"). The copy pointing at it was not updated, so both
  // the page and the list told people to tap a bell that is no longer drawn.
  const button = read("src/components/PriceWatchButton.tsx");
  assert.match(button, /A HEART, not a bell/, "this test assumes the watch control is a heart — re-read it if that changed");

  for (const [name, src] of [["Watchlist.tsx", WATCHLIST], ["watching/page.tsx", WATCHING_PAGE]] as const) {
    assert.doesNotMatch(
      src,
      /tap (a card&apos;s|the) bell/i,
      `${name} still tells the reader to tap a bell; the control is a heart`,
    );
  }
  assert.match(WATCHING_PAGE, /tap the heart on any card/i, "the page should name the heart");
  assert.match(WATCHLIST, /Tap a card&apos;s heart/i, "the list header should name the heart");
});

// ─────────────────────────────────────────────────────────────────────────────
// THE DRAWER. Reported 2026-09-24 with a screenshot: one card squeezed into a
// ~90px column of a 448px panel, the name cut, the price clipped, and the heart
// covered by an "★ Overnumbered" badge so the card could not be unwatched.
// ─────────────────────────────────────────────────────────────────────────────
// The previous fix to this file only touched the /watching PAGE's breakpoints.
// The drawer rendered the same grid, and a grid chosen by VIEWPORT width cannot
// know it is inside a 448px panel: every desktop is past `xl`, so the drawer got
// four columns. Checked by server-rendering the real components and hit-testing
// the heart at its centre, at 448px, at 390px, and in a four-up 90px tile grid.
const DRAWER = read("src/components/WatchlistDrawer.tsx");

test("the drawer renders the watchlist as rows, not the page's grid", () => {
  assert.match(DRAWER, /<Watchlist layout="list" onNavigate=\{close\} \/>/, "the drawer must ask for the list layout and close on navigation");
  assert.match(WATCHLIST, /layout = "grid"/, "grid stays the default, for /watching");
  assert.match(WATCHLIST, /function WatchRow\(/, "the drawer layout is a row per card");
});

test("a drawer row's heart is a sibling of its link, never inside or under it", () => {
  const row = WATCHLIST.slice(WATCHLIST.indexOf("function WatchRow("));
  const linkClose = row.indexOf("</Link>");
  const heart = row.indexOf("<PriceWatchButton");
  assert.ok(linkClose > 0 && heart > linkClose, "PriceWatchButton must come after the row's </Link>, in its own column");
  assert.match(row, /<div className="shrink-0">\s*<PriceWatchButton/, "the heart's column must not shrink away");
  // Badges live in the text column, inline — not absolutely positioned over art.
  assert.doesNotMatch(row, /absolute[^"]*top-2/, "nothing in a row may be absolutely positioned over the card");
});

test("on a tile, the heart stacks above the badges and the badges stop short of it", () => {
  const heartZ = Number(TILE.match(/absolute right-2 top-2 z-(\d+)/)?.[1]);
  const badgeZ = Number(TILE.match(/absolute left-2 [^"]*top-2 z-(\d+) flex flex-col/)?.[1]);
  assert.ok(heartZ && badgeZ, "expected both the heart and the badge column to be positioned");
  assert.ok(heartZ > badgeZ, `the heart (z-${heartZ}) must sit above the badge column (z-${badgeZ}), or a wide badge takes its clicks`);
  assert.match(TILE, /absolute left-2 right-12 top-2 z-\d+ flex flex-col/, "the badge column must end before the heart's corner");
  assert.match(TILE, /\[&>\*\]:truncate/, "each badge must truncate rather than run under the heart");
});
