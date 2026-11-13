import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { formatDayUtc } from "../src/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// Words a client component draws into the server's HTML must be the same words
// in every browser (found 2026-11-13, while checking the minimal redesign).
//
// A client component is rendered twice: on the server, into the HTML, and again
// in the browser to hydrate it. If the two disagree on a single text node, React
// 18 gives up on the server's HTML and renders the whole document again in the
// browser ("The server HTML was replaced with client content in <#document>").
// Two things did exactly that on the live site:
//
//  - the price chart's axis labels used `toLocaleDateString(undefined, …)`: the
//    visitor's locale and time zone. A price point is stamped 00:00 UTC, so
//    every visitor west of UTC got the day before ("Oct 13" against the
//    server's "Oct 14") and every day-first locale got "14 Oct": the card page,
//    the page that earns, was re-rendered from scratch for all of them;
//  - the card list's, the sealed list's and the set page's counts used
//    `n.toLocaleString()`: "1.741" for a German visitor against the server's
//    "1,741", so /browse was re-rendered for most of the EU market.
//
// Measured with a US visitor's and a German visitor's settings over 16 pages
// before and after; none fails now. This file keeps it that way.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.tsx$/.test(n) ? [p] : [];
  });

test("formatDayUtc: a price point's day is its UTC date, the same words on the server and in every browser", () => {
  const t = Date.parse("2026-10-14T00:00:00.000Z");
  assert.equal(formatDayUtc(t), "14 Oct");
  assert.equal(formatDayUtc(t, true), "14 Oct 2026");
  assert.equal(formatDayUtc(new Date("2026-01-01T00:00:00Z")), "1 Jan");
  assert.equal(formatDayUtc(Date.parse("2026-09-30T23:59:59Z"), true), "30 Sep 2026", "written out, not Intl: 'Sep' and 'Sept' both exist in ICU");

  // The visitor's time zone must not move the day. The old label did, west of UTC.
  const saved = process.env.TZ;
  try {
    for (const tz of ["America/Los_Angeles", "America/New_York", "Europe/Berlin", "Australia/Sydney", "Pacific/Auckland"]) {
      process.env.TZ = tz;
      assert.equal(formatDayUtc(t), "14 Oct", tz);
      assert.equal(formatDayUtc(t, true), "14 Oct 2026", tz);
    }
    process.env.TZ = "America/New_York";
    assert.equal(
      new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      "Oct 13",
      "what the chart drew for a US visitor before: the day before the server's, a hydration mismatch",
    );
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});

test("the price chart and the history note print their days with formatDayUtc, never the visitor's locale", () => {
  const chart = codeOnly(read("src/components/PriceChart.tsx"));
  assert.match(chart, /const fmtDate = \(t: number\) => formatDayUtc\(t\);/, "the axis labels, which are in the server HTML");
  assert.match(chart, /\{formatDayUtc\(hp\.t, true\)\}/, "the hover tooltip names the same day as the axis");
  assert.doesNotMatch(chart, /toLocale(Date|Time)?String\(/);
  const history = codeOnly(read("src/components/LocalizedPriceHistory.tsx"));
  assert.match(history, /\{formatDayUtc\(older, true\)\}/, "the 'full history since' line, also in the server HTML");
  assert.doesNotMatch(history, /toLocale(Date|Time)?String\(/);
});

// A client component may still format in the visitor's own locale where the value only exists in the browser (state filled
// after a fetch or a click), because then the server never rendered it. Each entry says why; an entry whose call is gone fails
// below, so the list cannot go stale.
const BROWSER_ONLY: Record<string, string> = {
  "src/components/cart/CartListView.tsx": "the time this browser last re-checked the cart: state set after the check, null in the server HTML",
  "src/components/NotificationBell.tsx": "dates of notifications fetched after sign-in: the list is empty in the server HTML",
};
const VISITOR_LOCALE = /\.toLocale(?:Date|Time)?String\(\s*(?:\)|undefined\b|\[\s*\])/;

test("no public client component formats a date or a number in the visitor's own locale", () => {
  const clients = [...walk("src/components"), ...walk("src/app")]
    .filter((f) => !/\/admin\//.test(f))
    .filter((f) => /^\s*["']use client["']/m.test(read(f).slice(0, 400)));
  assert.ok(clients.length > 100, `expected to scan the client components, found ${clients.length}`);
  const offenders = clients.filter((f) => VISITOR_LOCALE.test(codeOnly(read(f))) && !(f in BROWSER_ONLY));
  assert.deepEqual(
    offenders,
    [],
    'a client component formats with the visitor\'s locale: pass a fixed one ("en-US" for numbers, formatDayUtc for days), or the server\'s HTML and the browser\'s will disagree and React re-renders the whole page',
  );
  for (const [f, why] of Object.entries(BROWSER_ONLY)) {
    assert.ok(VISITOR_LOCALE.test(codeOnly(read(f))), `${f} no longer formats in the visitor's locale (${why}): remove it from BROWSER_ONLY`);
  }
});

test("the counts the list pages hydrate are grouped the en-US way, as the server prints them", () => {
  for (const f of [
    "src/components/browse/BrowseMarketBoard.tsx",
    "src/components/BrowseGrid.tsx",
    "src/components/SealedMarketBoard.tsx",
    "src/components/sets/SetMarketBoard.tsx",
    "src/components/CountUp.tsx",
  ]) {
    const src = codeOnly(read(f));
    assert.match(src, /\.toLocaleString\("en-US"\)/, f);
    assert.doesNotMatch(src, /\.toLocaleString\(\s*\)/, f);
  }
  assert.equal((1741).toLocaleString("en-US"), "1,741");
  assert.equal((1741).toLocaleString("de-DE"), "1.741", "what a German visitor's browser printed against the server's 1,741");
});
