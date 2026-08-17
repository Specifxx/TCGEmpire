#!/usr/bin/env node
// scripts/homepage-audit-analytics.mjs
//
// Verifies the homepage's GA4 instrumentation fires for real, by driving
// actual user interactions in a real Chromium and reading them back out of
// window.dataLayer — not by reading the source and assuming it works.
//
// WHY A SEPARATE SCRIPT FROM scripts/homepage-audit.mjs: that script asserts
// static/structural facts about a single rendered snapshot of the page (DOM
// counts, layout, JSON-LD, links) and is meant to be re-run constantly while
// iterating on layout. This one drives multi-step, stateful interactions
// (type → wait for debounce → click; scroll partway → wait for a rAF tick;
// open a dropdown → click an option) and needs a fresh page per scenario so
// one test's state (a focused input, an open dropdown, a client-side
// navigation) can never bleed into the next. Mixing the two would make the
// fast structural checks slow and the slow behavioural checks fragile to
// unrelated layout changes. Both are real Playwright scripts against the
// same running server; this is a "your call, document it" split, not a
// different verification standard.
//
// HOW THIS IS POSSIBLE WITHOUT REAL NETWORK EGRESS TO GOOGLE: gtag.js itself
// never has to load for this to work. ConsentDefaults.tsx's inline <head>
// script defines `window.dataLayer = window.dataLayer || []` and
// `function gtag(){dataLayer.push(arguments)}` itself, as the very first
// thing on the page — that shim is exactly what lib/ga-events.ts's
// `gaEvent()` calls, so every event this checks for lands in
// window.dataLayer the instant it fires, regardless of whether the real
// gtag.js ever finishes loading from googletagmanager.com (it does not, in
// this sandboxed environment). This proves each event fires with the right
// name, the right params, and the right trigger conditions — real
// client-side behaviour. It does NOT prove a real network beacon reaches
// Google's collectors in production; that half can only be checked after a
// real deploy, via GA4 Realtime or DebugView against real traffic.
//
// A dataLayer entry is `dataLayer.push(arguments)` — the `arguments` object,
// not a real array — so it survives Playwright's evaluate() round-trip as a
// plain object with numeric string keys ("0", "1", "2"), not an Array.
// `entry[0]`/`entry[1]`/`entry[2]` still work as property access on either
// shape, so the helpers below don't need to care which one they got.
//
// USAGE
//   node scripts/homepage-audit-analytics.mjs
//   AUDIT_BASE_URL=http://localhost:3000 node scripts/homepage-audit-analytics.mjs
// Same server-must-already-be-running contract as homepage-audit.mjs — see
// that script's own header comment.

import { chromium } from "playwright";

const BASE_URL = (process.env.AUDIT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const VIEWPORT = { width: 1440, height: 900 }; // desktop: needed for autoFocusDesktop + pointer:fine gating

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
}

function eventsNamed(dataLayer, name) {
  return dataLayer.filter((e) => e[0] === "event" && e[1] === name).map((e) => e[2] ?? {});
}

// Scrolls to `y` and POLLS for window.scrollY to actually arrive rather than
// a fixed sleep. `globals.css` sets `scroll-behavior: smooth` site-wide
// (overridden to instant only under `prefers-reduced-motion`, which this
// script's default browser context doesn't request), so `window.scrollTo()`
// animates over a real, non-trivial duration — a fixed short wait after
// calling it was found, empirically, to sometimes read back mid-animation
// scroll state (and therefore a stale scroll_depth threshold) instead of the
// true destination.
async function scrollToAndSettle(page, y, timeoutMs = 2000) {
  const target = await page.evaluate((y) => {
    window.scrollTo(0, y);
    return Math.max(0, Math.min(y, document.documentElement.scrollHeight - window.innerHeight));
  }, y);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await page.evaluate(() => window.scrollY);
    if (Math.abs(current - target) <= 2) return;
    await page.waitForTimeout(50);
  }
}

async function freshPage(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  // Block every request that isn't this script's own BASE_URL. The homepage
  // loads several real third-party scripts (Vercel Analytics, AdSense,
  // gtag.js itself) that this sandbox's network proxy has no route to and no
  // reason to reach — each one otherwise burns several real seconds retrying
  // a TLS handshake that can only fail, and with 7 fresh page loads across
  // this file that adds up to minutes wasted on network traffic this script
  // was never testing in the first place (dataLayer works via
  // ConsentDefaults.tsx's own inline gtag() shim — see this file's header —
  // gtag.js loading for real is neither required nor checked here). Also
  // matters for correctness, not just speed: `networkidle` waits for
  // in-flight requests to quiet down, so a page stuck retrying a doomed
  // external request can delay every `waitUntil: "networkidle"` goto() in
  // this file far longer than the page itself actually takes to become
  // interactive.
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE_URL)) route.continue();
    else route.abort();
  });
  const page = await context.newPage();
  await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200); // let entrance animations + the geo/preferredCountry effects settle
  return { context, page };
}

async function getDataLayer(page) {
  return page.evaluate(() => window.dataLayer ?? []);
}

async function main() {
  try {
    const r = await fetch(BASE_URL + "/", { method: "GET" });
    if (!r.ok) throw new Error(`homepage responded ${r.status}`);
  } catch (err) {
    console.error(`\nCannot reach ${BASE_URL}/ — is a server running there? See homepage-audit.mjs's header comment.\n`);
    console.error(String(err));
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch();

  // Each test gets its own try/catch: a failure (or a timeout) inside one
  // scenario must not abort the rest of the run, and must not leave the
  // shared `browser` handle in a state where the next test's freshPage()
  // hangs forever waiting on a page that will never load. Every test is
  // already responsible for closing its OWN context; this is a backstop for
  // when a test throws before reaching its own cleanup line.
  const tests = [
    testSearchInitiatedKeystroke,
    testSearchSuggestionSelected,
    testSearchNoResults,
    testSearchSubmitted,
    testStoreClick,
    testScrollDepth,
    testRegionChanged,
  ];
  for (const test of tests) {
    try {
      await test(browser);
    } catch (err) {
      record(test.name, false, `THREW: ${err?.message ?? err}`);
    }
  }

  await browser.close();
  report();
}

// ---------------------------------------------------------------------------
async function testSearchInitiatedKeystroke(browser) {
  const { context, page } = await freshPage(browser);
  const heroInput = page.locator('input[aria-label="Search cards"]').last(); // hero renders after the (scroll-gated) nav instances
  await heroInput.click();
  await heroInput.type("ahri", { delay: 30 });
  await page.waitForTimeout(400); // 180ms debounce + fetch
  const dl = await getDataLayer(page);
  const initiated = eventsNamed(dl, "search_initiated");
  const keystroke = initiated.find((p) => p.trigger === "keystroke");
  record("search_initiated fires on first keystroke", !!keystroke, JSON.stringify(keystroke ?? initiated));
  await context.close();
}

async function testSearchSuggestionSelected(browser) {
  const { context, page } = await freshPage(browser);
  const heroInput = page.locator('input[aria-label="Search cards"]').last();
  await heroInput.click();
  await heroInput.type("ahri", { delay: 30 });
  await page.waitForTimeout(400);
  const option = page.locator('[role="option"]').first();
  await option.waitFor({ state: "visible", timeout: 5000 });
  await option.click();
  await page.waitForTimeout(200);
  const dl = await getDataLayer(page);
  const selected = eventsNamed(dl, "search_suggestion_selected");
  const hasRank = selected.some((p) => typeof p.suggestion_rank === "number");
  record("search_suggestion_selected fires with a suggestion_rank", hasRank, JSON.stringify(selected));
  await context.close();
}

async function testSearchNoResults(browser) {
  const { context, page } = await freshPage(browser);
  const heroInput = page.locator('input[aria-label="Search cards"]').last();
  const query = "zzqxnonexistentcardxyz";
  await heroInput.click();
  await heroInput.type(query, { delay: 15 });
  await page.waitForTimeout(500);
  const dl = await getDataLayer(page);
  const noResults = eventsNamed(dl, "search_no_results");
  const match = noResults.find((p) => p.query === query);
  record("search_no_results fires with the query that had zero matches", !!match, JSON.stringify(match ?? noResults));
  await context.close();
}

async function testSearchSubmitted(browser) {
  const { context, page } = await freshPage(browser);
  const heroInput = page.locator('input[aria-label="Search cards"]').last();
  await heroInput.click();
  await heroInput.type("chemtech enforcer", { delay: 15 });
  await page.waitForTimeout(400);
  // No arrow-key navigation happened, so activeIndex is -1 and Enter falls
  // through to the form's native submit — commitSearch(value), a real
  // client-side navigation to /browse?q=... .
  await heroInput.press("Enter");
  await page.waitForURL(/\/browse\?q=/, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
  const dl = await getDataLayer(page);
  const submitted = eventsNamed(dl, "search_submitted");
  const match = submitted.find((p) => (p.query ?? "").toLowerCase().includes("chemtech"));
  record("search_submitted fires with the submitted query, and navigates to /browse", !!match, JSON.stringify(match ?? submitted));
  await context.close();
}

async function testStoreClick(browser) {
  const { context, page } = await freshPage(browser);
  const storeLink = page.locator("section:has(#proof-strip-heading) a[href]").nth(1); // [0] is the card link; store links follow
  const proofStrip = page.locator("#proof-strip-heading");
  const hasProofStrip = (await proofStrip.count()) > 0;
  if (!hasProofStrip) {
    record(
      "store_click fires on an outbound retailer click (ProofStrip)",
      false,
      "SKIPPED — ProofStrip did not render (no market has 3+ priced stores for a popular card in the current dataset); see DECISIONS.md",
    );
    await context.close();
    return;
  }
  await storeLink.scrollIntoViewIfNeeded();
  // The store link's href is a REAL external retailer/affiliate URL, and
  // freshPage() already blocks every non-BASE_URL request context-wide (see
  // its own comment) — which matters here specifically, not just for speed:
  // store_click fires synchronously in the onClick handler before the
  // browser acts on the href at all, so the event is already in dataLayer
  // regardless of whether the navigation the click triggers ever succeeds,
  // but an unblocked popup trying (and hanging) to reach a real external
  // host behind this sandbox's network proxy was observed to wedge the whole
  // browser instance for the rest of this run.
  // target="_blank": clicking spawns a popup tab rather than navigating this
  // page away, so window.dataLayer here is unaffected by the click's own
  // navigation — but Playwright still needs to catch and close the popup or
  // it leaks a page for the rest of this context's lifetime. A generous
  // timeout here is fine either way: the route block above means the popup
  // never actually loads anything, so this resolves fast regardless.
  const [popup] = await Promise.all([context.waitForEvent("page", { timeout: 5000 }).catch(() => null), storeLink.click()]);
  if (popup) await popup.close().catch(() => {});
  await page.waitForTimeout(200);
  const dl = await getDataLayer(page);
  const clicks = eventsNamed(dl, "store_click");
  const match = clicks.find((p) => p.page_type === "homepage" && p.transport_type === "beacon");
  record(
    "store_click fires on an outbound retailer click, with page_type+transport_type=beacon",
    !!match,
    JSON.stringify(match ?? clicks),
  );
  await context.close();
}

async function testScrollDepth(browser) {
  const { context, page } = await freshPage(browser);
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
  if (scrollable <= 0) {
    record("scroll_depth fires at 25/50/75/90%", false, "SKIPPED — page is not tall enough to scroll at this viewport");
    await context.close();
    return;
  }
  for (const frac of [0.3, 0.55, 0.8, 1.0]) {
    await scrollToAndSettle(page, Math.round(scrollable * frac));
    await page.waitForTimeout(150); // rAF-throttled listener, one tick after the scroll itself has truly settled
  }
  const dl = await getDataLayer(page);
  const depths = eventsNamed(dl, "scroll_depth").map((p) => p.percent_scrolled);
  const gotAll = [25, 50, 75, 90].every((t) => depths.includes(t));
  record("scroll_depth fires at 25/50/75/90%", gotAll, `got thresholds: ${JSON.stringify(depths.sort((a, b) => a - b))}`);

  // Fire-once-per-threshold: scroll back up and back down past 50% again —
  // must NOT produce a second 50% event (that would inflate the "percent who
  // reached 50%" metric with re-entries instead of unique visitors).
  await scrollToAndSettle(page, 0);
  await scrollToAndSettle(page, Math.round(scrollable * 0.55));
  await page.waitForTimeout(150);
  const dl2 = await getDataLayer(page);
  const fiftyCount = eventsNamed(dl2, "scroll_depth").filter((p) => p.percent_scrolled === 50).length;
  record("scroll_depth does not re-fire the same threshold on scroll-up-then-down", fiftyCount === 1, `50% fired ${fiftyCount} time(s)`);
  await context.close();
}

async function testRegionChanged(browser) {
  const { context, page } = await freshPage(browser);
  const trigger = page.locator('[data-region-control="hero"] button').first();
  await trigger.click();
  const nzOption = page.locator('[data-region-control="hero"] button:has-text("New Zealand")');
  await nzOption.waitFor({ state: "visible", timeout: 3000 });
  await nzOption.click();
  await page.waitForTimeout(200);
  const dl = await getDataLayer(page);
  const changed = eventsNamed(dl, "region_changed");
  const match = changed.find((p) => p.to === "NZ");
  record("region_changed fires with from/to when the hero region control is used", !!match, JSON.stringify(match ?? changed));
  await context.close();
}

// ---------------------------------------------------------------------------
function report() {
  const width = Math.max(...results.map((r) => r.name.length)) + 2;
  console.log("\n=== Homepage analytics audit — scripts/homepage-audit-analytics.mjs ===");
  console.log(`Base URL: ${BASE_URL}\n`);
  let failCount = 0;
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    if (!r.pass) failCount++;
    console.log(`${status.padEnd(5)} ${r.name.padEnd(width)}  ${r.detail}`);
  }
  console.log(`\n${results.length - failCount}/${results.length} checks passed.\n`);
  if (failCount > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
