import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// The hero's affiliate rails must out-stack the hero's foreground column.
// ─────────────────────────────────────────────────────────────────────────────
// 2026-08-15: the rails shipped at zIndex 5, inherited verbatim from the
// decorative chase-card showcase they replaced. On that showcase 5 was correct —
// it was ornamental, and sitting under the headline guaranteed a copy change
// could never make the H1 unreadable. On a monetised unit the same number is a
// silent revenue-zero bug.
//
// CinematicHero's foreground column is `container-app relative z-10`, which is
// `mx-auto w-full max-w-[1400px]`. It is the shell's only in-flow child, so it
// spans the shell's full height and up to 1400px of its width — a strictly
// larger box than the rail band in the same containing block. It paints no
// background, but a transparent element still hit-tests across its entire
// border box (opting out of that is exactly what pointer-events:none is for,
// and is why the decorative background layer beside it sets precisely that).
//
// So the column received every click instead of the rail. Measured with
// elementFromPoint aimed at the CTA pill, before the fix:
//
//     1400 BLOCKED · 1440 BLOCKED · 1512 BLOCKED · 1600 BLOCKED · 1920 ok
//
// Every laptop width the rails render at was dead. Only a 1920px monitor
// worked, which is why nothing caught it: the banners render correctly, the
// geometry measures correctly, and NOTHING else in this repo — not tsc, not
// lint, not the other 527 tests, not scripts/adsense-guard.ts — evaluates hit
// testing. Layout tests measure where things are, never what receives a click.
//
// This test is that missing check, kept static so it runs in the normal suite
// with no browser: it simply asserts the rail out-stacks the column it is known
// to overlap. If someone lowers the rail, or raises the column, the suite fails
// here instead of the ad silently earning nothing.

const RAIL = "src/components/home/HeroAdRail.tsx";
const HERO = "src/components/home/CinematicHero.tsx";

function railZIndex(src: string): number {
  // The rail sets it inline because Tailwind's default scale has no z-5/z-20
  // arbitrary need — match the literal it actually ships.
  const m = src.match(/style=\{\{\s*zIndex:\s*(\d+)\s*\}\}/);
  assert.ok(m, `${RAIL} must set an inline zIndex on the positioned wrapper`);
  return Number(m![1]);
}

function foregroundZIndex(src: string): number {
  // The foreground column carries Tailwind's z-10 on the same element as
  // `container-app relative`.
  const m = src.match(/className="container-app relative z-(\d+)/);
  assert.ok(m, `${HERO} must keep the foreground column's z-N class discoverable`);
  return Number(m![1]);
}

test("the hero ad rails out-stack the hero's foreground column", () => {
  const rail = read(RAIL);
  const hero = read(HERO);
  const railZ = railZIndex(rail);
  const fgZ = foregroundZIndex(hero);

  assert.ok(
    railZ > fgZ,
    `HeroAdRail renders at zIndex ${railZ} but CinematicHero's foreground column ` +
      `is z-${fgZ}. The column is transparent, full-height and up to 1400px wide, ` +
      `so it hit-tests over both rails: every click on an ad would land on the ` +
      `column instead. The banners would look perfect and earn nothing.`,
  );
});

test("the rails re-enable hit testing inside their pointer-events-none wrapper", () => {
  const rail = read(RAIL);
  // The outer wrapper disables hit testing so the rail can never steal a click
  // from the hero; the inner box must turn it back on or the same revenue-zero
  // outcome arrives by a different route.
  assert.match(rail, /pointer-events-none/, "outer wrapper should stay pointer-events-none");
  assert.match(
    rail,
    /pointer-events-auto/,
    "the panel wrapper must re-enable pointer events, or the banners render perfectly and are unclickable",
  );
});

test("every rail destination is a real affiliate-tagged URL, not a bare merchant link", () => {
  const rail = read(RAIL);
  // eBay must go through the shared helper (which applies campid/mkrid/customid)
  // and TCGplayer through affiliateUrl (which wraps it in the Impact deep link).
  assert.match(rail, /ebaySearchUrl\(/, "eBay units must build links via ebaySearchUrl");
  assert.match(rail, /affiliateUrl\(/, "TCGplayer units must build links via affiliateUrl");

  // The www host is load-bearing: affiliateUrl only rewrites hosts matching
  // /(?:^|\.)tcgplayer\.com$/, so a partner.tcgplayer.com URL passes straight
  // through UNTAGGED and every click earns nothing.
  const tcg = rail.match(/const TCG_SEARCH_URL\s*=\s*"([^"]+)"/);
  assert.ok(tcg, "TCG_SEARCH_URL should stay a single named constant");
  const host = new URL(tcg![1]).hostname;
  assert.ok(
    /(?:^|\.)tcgplayer\.com$/.test(host) && !host.startsWith("partner."),
    `TCG_SEARCH_URL host is "${host}". affiliateUrl only rewrites *.tcgplayer.com, ` +
      `and must not be handed an already-wrapped partner.tcgplayer.com URL — either ` +
      `mistake leaves the link untagged and unmonetised.`,
  );
});
