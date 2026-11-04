import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// What sits on the first-paint critical path, pinned. Measured 2026-09-21 on
// the live guide page in a real mobile Chromium (Playwright, no throttling):
// first paint 828ms with every third-party script, 440ms with them blocked.
// The gap is bandwidth the analytics/ads scripts and three preloaded fonts
// take from the render-blocking CSS in the first half-second. These keep the
// two cheap fixes from being undone by a "restore the recommended snippet"
// edit later.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("gtag.js loads after the page is interactive, not as a high-priority preinit", () => {
  const src = read("src/components/GoogleAnalytics.tsx");
  // afterInteractive in the App Router = ReactDOM.preinit = a HIGH-priority
  // fetch of a 188KB script at ~176ms, ahead of the CSS. lazyOnload waits for
  // load and pulls it in on idle.
  assert.equal((src.match(/strategy="lazyOnload"/g) ?? []).length, 2, "both gtag <Script>s must be lazyOnload");
  assert.ok(!/strategy="afterInteractive"/.test(src), "gtag must not be afterInteractive (preinit)");
});

test("the monospace font is not preloaded ahead of the stylesheet", () => {
  const src = read("src/app/layout.tsx");
  const mono = /const jetbrainsMono = localFont\(\{[^}]*\}\)/.exec(src)?.[0] ?? "";
  assert.ok(mono, "expected the jetbrainsMono localFont() call");
  assert.match(mono, /preload:\s*false/, "mono font must carry preload: false");
  // The H1 face and the body face stay preloaded — they ARE the first paint.
  const display = /const cinzel = localFont\(\{[\s\S]*?\}\)/.exec(src)?.[0] ?? "";
  assert.ok(display, "expected the cinzel localFont() call (the heading face since the 2026-10-16 rebrand)");
  assert.ok(!/preload:\s*false/.test(display), "the display font must stay preloaded (it is the LCP on article pages)");
});

test("the fonts are self-hosted: the build never fetches Google Fonts", () => {
  // 2026-11-05: the production build died in next/font/google ("Cannot read
  // properties of null (reading '1')") when fonts.googleapis.com answered with
  // something other than the @font-face list the loader parses. A gated site
  // builds once a day; that build must not depend on a third-party fetch.
  const src = read("src/app/layout.tsx");
  assert.ok(!/from "next\/font\/google"/.test(src), "layout must not import next/font/google");
  for (const f of ["inter-latin-wght.woff2", "cinzel-latin-wght.woff2", "jetbrains-mono-latin-wght.woff2"]) {
    assert.ok(existsSync(join(process.cwd(), "src/app/fonts", f)), `missing self-hosted font ${f}`);
  }
});

test("robots.txt never blocks the crawlers that matter", () => {
  // Checked live 2026-09-21: Googlebot, bingbot, AhrefsBot and GPTBot all
  // fetched /, a card page, a guide and the sitemap with 200 and identical
  // bytes. This pins the source so a well-meaning "block the bots" edit can't
  // regress it: the wildcard rule must allow "/", and only the named bulk
  // scrapers may be disallowed from everything.
  const src = read("src/app/robots.ts");
  assert.match(src, /userAgent:\s*"\*"[\s\S]*?allow:\s*\[\s*"\/"/, "the * rule must allow /");
  const blocked = /const BLOCKED_BOTS = \[([^\]]*)\]/.exec(src)?.[1] ?? "";
  for (const bot of ["Googlebot", "bingbot", "Bingbot", "AhrefsBot", "GPTBot", "ClaudeBot", "PerplexityBot", "DuckDuckBot", "Applebot"]) {
    assert.ok(!blocked.includes(bot), `${bot} must not be in BLOCKED_BOTS`);
  }
});
