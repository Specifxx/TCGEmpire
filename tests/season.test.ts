import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEASON_BOOT_SCRIPT, seasonAt, seasonMarkupLive } from "../src/lib/season";

// The Halloween season (owner, 2026-10-16: "Nocturne is going to come get
// you"). lib/season.ts decides it in the visitor's local time; these pin the
// window, the boot script that stamps it before paint, and the palette it swaps
// in.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

test("Halloween runs 16-31 October, and is gone on 1 November", () => {
  assert.equal(seasonAt(at(2026, 10, 15)), null);
  assert.equal(seasonAt(at(2026, 10, 16)), "halloween");
  assert.equal(seasonAt(at(2026, 10, 31)), "halloween");
  assert.equal(seasonAt(at(2026, 11, 1)), null);
  assert.equal(seasonAt(at(2027, 10, 20)), "halloween", "it comes back every year");
  // The markup is in the HTML from a day before to a day after, for the page cache.
  assert.equal(seasonMarkupLive("halloween", at(2026, 10, 15)), true);
  assert.equal(seasonMarkupLive("halloween", at(2026, 11, 1)), true);
  assert.equal(seasonMarkupLive("halloween", at(2026, 11, 2)), false);
  assert.equal(seasonMarkupLive("halloween", at(2026, 10, 14)), false);
});

function boot(date: Date, search = ""): string | null {
  let stamped: string | null = null;
  const RealDate = Date;
  const FakeDate = function () {
    return new RealDate(date.getTime());
  } as unknown as DateConstructor;
  const ctx = vm.createContext({
    Date: FakeDate,
    location: { search },
    document: { documentElement: { setAttribute: (k: string, v: string) => k === "data-season" && (stamped = v) } },
  });
  vm.runInContext(SEASON_BOOT_SCRIPT, ctx);
  return stamped;
}

test("the boot script agrees with seasonAt(), takes a ?season= override, and never throws", () => {
  for (const d of [at(2026, 10, 15), at(2026, 10, 16), at(2026, 10, 31), at(2026, 11, 1), at(2026, 3, 3)]) {
    assert.equal(boot(d), seasonAt(d), d.toDateString());
  }
  assert.equal(boot(at(2026, 3, 3), "?season=halloween"), "halloween", "preview it out of season");
  assert.equal(boot(at(2026, 10, 20), "?a=1&season=off"), null, "switch it off in season");
  assert.doesNotThrow(() => vm.runInContext(SEASON_BOOT_SCRIPT, vm.createContext({})));
});

test("the layout runs the season boot script in <head>", () => {
  const layout = read("src/app/layout.tsx");
  const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
  assert.match(head, /<script dangerouslySetInnerHTML=\{\{ __html: SEASON_BOOT_SCRIPT \}\} \/>/);
});

// WCAG contrast, as tests/theme.test.ts measures it.
function lum(triplet: string): number {
  const [r, g, b] = triplet.split(/\s+/).map((n) => {
    const c = Number(n) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

test("the Halloween night keeps every 4.5:1 text guarantee of the dark palette", () => {
  const css = read("src/app/globals.css");
  const vars = (sel: string) => {
    const i = css.indexOf(`${sel} {`);
    assert.ok(i >= 0, `expected a "${sel} {" block`);
    const out: Record<string, string> = {};
    for (const m of css.slice(i, css.indexOf("\n}", i)).matchAll(/--(c-[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
    return out;
  };
  const dark = vars(":root");
  const night = { ...dark, ...vars(':root[data-season="halloween"]:not([data-theme="light"])') };
  for (const surface of ["c-ink-950", "c-ink-900", "c-ink-850"]) {
    assert.notEqual(night[surface], dark[surface], `${surface} should change for Halloween`);
    for (const text of ["c-white", "c-slate-300", "c-slate-400", "c-slate-500", "c-slate-600", "c-accent", "c-brand-400", "c-up", "c-down", "c-gold", "c-rose-300", "c-rose-400", "c-red-400", "c-emerald-400", "c-amber-300", "c-sky-300", "c-sky-400"]) {
      const ratio = contrast(night[text], night[surface]);
      assert.ok(ratio >= 4.5, `halloween: ${text} on ${surface} is ${ratio.toFixed(2)}:1`);
    }
  }
  assert.ok(lum(night["c-ink-950"]) < 0.01 && lum(night["c-ink-900"]) < 0.01, "still a dark theme");
});

test("Halloween-only markup is hidden unless the season attribute is on, and the hero links Nocturne's real card", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.rb-nocturne,\s*\n\.rb-paranoia \{\s*display: none;/);
  assert.match(css, /:root\[data-season="halloween"\] \.rb-nocturne \{\s*display: inline-flex;/);
  assert.match(read("src/components/home/CinematicHero.tsx"), /<NocturneComing \/>/);
  const callout = read("src/components/home/NocturneComing.tsx");
  assert.match(callout, /if \(!seasonMarkupLive\("halloween"\)\) return null;/);
  assert.match(callout, /href="\/card\/nocturne-horrifying-ogn-194-298" className="rb-nocturne"/);
  const cards = JSON.parse(read("data/public/cards.json")) as { slug: string }[];
  assert.ok(cards.some((c) => c.slug === "nocturne-horrifying-ogn-194-298"), "the linked card must exist in the public snapshot");
});

test("scroll motion is scroll-driven, guarded, and declared before the reduced-motion block", () => {
  const css = read("src/app/globals.css");
  const i = css.indexOf("@supports (animation-timeline: view())");
  assert.ok(i > 0, "scroll timelines only where supported");
  assert.match(css.slice(i, i + 200), /@media \(prefers-reduced-motion: no-preference\)/);
  assert.ok(i < css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  const reveal = read("src/components/Reveal.tsx");
  assert.match(reveal, /CSS\.supports\("animation-timeline: view\(\)"\)/, "the observer path steps aside where CSS does it");
  assert.match(reveal, /stagger \? "rb-sd-stagger" : "rb-sd"/);
});
