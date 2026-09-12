import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { THEME_BOOT_SCRIPT, THEME_COLOR, readThemeCookie, resolveThemeMode } from "../src/lib/theme-shared";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Light/dark theme. The site's components hard-code dark classes everywhere,
// so the theme is implemented as a switchable PALETTE: tailwind.config.ts
// defines the neutrals as rgb(var(--c-…)) and globals.css supplies a dark set on
// :root and a light set on :root[data-theme="light"]. What this file pins:
//   • the two palettes define exactly the same variables (a token defined in
//     one and not the other would silently render transparent in that theme);
//   • the dark palette is the exact hexes the config used to hard-code, so
//     the default theme is pixel-identical to before;
//   • the light palette clears WCAG AA where the dark one does — the
//     accessibility audit that lifted slate-500/600 must not be undone by the
//     new theme;
//   • the boot script agrees with the resolver and defaults to dark.
// ─────────────────────────────────────────────────────────────────────────────

const CSS = read("src/app/globals.css");
const CFG = read("tailwind.config.ts");

function block(selector: string): string {
  const i = CSS.indexOf(`${selector} {`);
  assert.ok(i >= 0, `expected a "${selector} {" block in globals.css`);
  return CSS.slice(i, CSS.indexOf("\n}", i));
}
function vars(blockSrc: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of blockSrc.matchAll(/--(c-[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const DARK = vars(block(":root"));
const LIGHT = vars(block(':root[data-theme="light"]'));

test("tailwind's themed tokens are all CSS variables, and both palettes define every one of them", () => {
  const names = [...new Set([...CFG.matchAll(/v\("([a-z0-9-]+)"\)/g)].map((m) => `c-${m[1]}`))];
  assert.ok(names.length >= 20, `expected the neutrals to be variable-backed, found ${names.length}`);
  for (const n of names) {
    assert.ok(DARK[n], `${n} has no dark value in globals.css :root`);
    assert.ok(LIGHT[n], `${n} has no light value in globals.css :root[data-theme="light"]`);
  }
  // …and nothing defined in one palette is missing from the other.
  assert.deepEqual(Object.keys(LIGHT).sort(), Object.keys(DARK).sort(), "the two palettes must define the same variable set");
  // The wrapper itself must keep <alpha-value> so bg-ink-900/95-style modifiers work.
  assert.match(CFG, /rgb\(var\(--c-\$\{name\}\) \/ <alpha-value>\)/);
  // brand-300 stays undefined on purpose (tests/premium-pitch-panel.test.ts relies on it).
  assert.doesNotMatch(CFG, /\b300: v\("brand-300"\)/);
});

test("the dark palette is the exact palette the config used to hard-code (dark mode is pixel-identical)", () => {
  const rgb = (hex: string) => hex.match(/[0-9a-f]{2}/gi)!.map((h) => parseInt(h, 16)).join(" ");
  const expected: Record<string, string> = {
    "c-ink-950": "#0a0c10", "c-ink-900": "#0e1116", "c-ink-850": "#13171f", "c-ink-800": "#191e28", "c-ink-700": "#252b38", "c-ink-600": "#333b4d",
    "c-brand-400": "#34d17e", "c-slate-500": "#8593a6", "c-slate-600": "#76828f",
    "c-slate-400": "#94a3b8", "c-slate-300": "#cbd5e1", "c-slate-200": "#e2e8f0", // Tailwind stock
    "c-accent": "#eef1f5", "c-gold": "#caa85a", "c-up": "#3fb950", "c-down": "#f0506e", "c-white": "#ffffff",
  };
  for (const [k, hex] of Object.entries(expected)) assert.equal(DARK[k], rgb(hex), `${k} dark`);
  assert.match(block(":root"), /--page-bg:\s*#0b0e14;/);
  assert.match(block(":root"), /--page-fg:\s*#e8eaee;/);
  assert.match(CSS, /background-color: var\(--page-bg\);\s*\n\s*color: var\(--page-fg\);/);
});

// WCAG relative luminance + contrast ratio, on RGB triplets as stored.
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

test("the light palette keeps the accessibility guarantees the dark one makes (4.5:1 body text on both surfaces)", () => {
  for (const [name, pal] of [["dark", DARK], ["light", LIGHT]] as const) {
    for (const surface of ["c-ink-950", "c-ink-900", "c-ink-850"]) {
      for (const text of ["c-white", "c-slate-300", "c-slate-400", "c-slate-500", "c-slate-600", "c-accent", "c-brand-400"]) {
        const ratio = contrast(pal[text], pal[surface]);
        assert.ok(ratio >= 4.5, `${name}: ${text} on ${surface} is ${ratio.toFixed(2)}:1, below 4.5:1`);
      }
      // Gain/loss colours are read as numbers next to prices — same floor.
      for (const t of ["c-up", "c-down", "c-gold"]) {
        const ratio = contrast(pal[t], pal[surface]);
        assert.ok(ratio >= 4.5, `${name}: ${t} on ${surface} is ${ratio.toFixed(2)}:1, below 4.5:1`);
      }
    }
  }
  // Dark ink on bright fills stays dark in the light theme (text-ink-950 would
  // otherwise invert to near-white on the green button and gold badges), the
  // fills themselves stay bright, and the button's hover stays a light green.
  assert.match(CSS, /:root\[data-theme="light"\] \.btn-primary,\s*\n\s*:root\[data-theme="light"\] \.bg-brand-500\.text-ink-950,\s*\n\s*:root\[data-theme="light"\] \.bg-gold\.text-ink-950,[\s\S]*?\{\s*color: #0a0c10;/);
  assert.match(CSS, /:root\[data-theme="light"\] \.bg-gold \{\s*background-color: #caa85a;/);
  assert.match(CSS, /:root\[data-theme="light"\] \.bg-brand-400 \{\s*background-color: #34d17e;/);
  assert.match(CSS, /:root\[data-theme="light"\] \.btn-primary:hover \{\s*background-color: #27b868;/);
});

test("the light palette is actually light and the dark one actually dark", () => {
  assert.ok(lum(LIGHT["c-ink-950"]) > 0.85 && lum(LIGHT["c-ink-900"]) > 0.95, "light surfaces must be near-white");
  assert.ok(lum(DARK["c-ink-950"]) < 0.01 && lum(DARK["c-ink-900"]) < 0.01, "dark surfaces must be near-black");
  assert.ok(lum(LIGHT["c-white"]) < 0.01, "text-white must become ink in the light theme");
  assert.match(block(':root[data-theme="light"]'), /color-scheme: light;/);
  assert.match(block(":root"), /color-scheme: dark;/);
});

test("the boot script agrees with the resolver for every cookie shape, defaults to dark, and never throws", () => {
  const run = (cookie: string) => {
    let stamped: string | null = null;
    const ctx = vm.createContext({ document: { cookie, documentElement: { setAttribute: (_k: string, v: string) => (stamped = v) } } });
    vm.runInContext(THEME_BOOT_SCRIPT, ctx);
    return stamped;
  };
  for (const c of ["", "theme=light", "theme=dark", "a=1; theme=light; b=2", "theme=blue", "notheme=light", "sidenav=expanded"]) {
    assert.equal(run(c), resolveThemeMode(readThemeCookie(c)), `cookie "${c}"`);
  }
  assert.equal(run(""), "dark");
  assert.doesNotThrow(() => vm.runInContext(THEME_BOOT_SCRIPT, vm.createContext({})));
  assert.equal(readThemeCookie("theme=light"), "light");
  assert.equal(resolveThemeMode("sideways"), "dark");
});

test("the layout inlines the boot script in <head> and the meta theme-colour matches the dark palette", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /import \{ THEME_BOOT_SCRIPT \} from "@\/lib\/theme-shared"/);
  const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
  assert.match(head, /<script dangerouslySetInnerHTML=\{\{ __html: THEME_BOOT_SCRIPT \}\} \/>/);
  assert.match(layout, new RegExp(`themeColor: "${THEME_COLOR.dark}"`), "viewport.themeColor must be the dark palette's page colour");
  assert.doesNotMatch(layout, /from "next\/headers"/, "the caching rule still holds — no cookies() in the root layout");
});

test("the toggle is reachable at every width: header icon from sm up, a row in the phone menu below lg", () => {
  assert.match(read("src/components/Navbar.tsx"), /<ThemeToggle className="hidden sm:grid" \/>/);
  const menu = read("src/components/CinematicNavMenu.tsx");
  assert.match(menu, /<ThemeToggle variant="row" \/>/);
  assert.match(menu, /className="mt-3 lg:hidden">\s*<ThemeToggle variant="row" \/>/);
  const toggle = read("src/components/ThemeToggle.tsx");
  assert.match(toggle, /setAttribute\("data-theme", mode\)/);
  assert.match(toggle, /document\.cookie = `\$\{THEME_COOKIE\}=\$\{next\}; path=\/; max-age=\$\{THEME_COOKIE_MAX_AGE\}; SameSite=Lax`/);
  assert.match(toggle, /meta\[name="theme-color"\]/, "the browser-chrome colour must follow the page");
  assert.match(toggle, /useState<ThemeMode>\("dark"\)/, "initial state must match the server render (no hydration mismatch)");
});

test("nothing that must stay white in both themes uses the themed `white` token", () => {
  // The Google sign-in button is white by Google's brand rules, not by theme.
  assert.match(read("src/components/AuthForm.tsx"), /bg-\[#ffffff\] py-2\.5 text-sm font-semibold text-\[#0a0c10\]/);
});
