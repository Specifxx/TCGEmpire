#!/usr/bin/env node
// scripts/homepage-audit.mjs
//
// Verification harness for the homepage-redesign brief's "Hard Targets" table
// (page height, heading/image/DOM-node counts, above-the-fold interactive
// budget, primary-CTA/search/region-selector duplication, autofocus, FAQ
// JSON-LD, the affiliate disclosure, and homepage-linked internal links).
// Fails loudly with a readable target-vs-actual diff and a non-zero exit
// code — this is meant to be run repeatedly while iterating on the homepage,
// not just once at the end.
//
// WHAT THIS SCRIPT DOES NOT COVER, ON PURPOSE: LCP / CLS / INP and the
// Lighthouse Performance/Accessibility scores from the same Hard Targets
// table need a production build served over HTTP and a real Lighthouse run
// (throttled, mobile preset) — a different tool for a different job. That
// happens in a later verification pass; see DECISIONS.md's audit-script
// phase entry for the exact split. Everything else in the Hard Targets
// table is asserted here.
//
// USAGE
//   node scripts/homepage-audit.mjs
//   AUDIT_BASE_URL=http://localhost:3000 node scripts/homepage-audit.mjs
//
// Requires a server already running at AUDIT_BASE_URL (default
// http://localhost:3000). Deliberately does NOT start one itself: this repo's
// `npm run build` runs real, potentially environment-mutating steps
// (adsense-guard, image optimize/check, a conditional live price import) that
// have no business running as a side effect of an audit script, and `next
// dev` needs a real terminal/long-lived process a one-shot script shouldn't
// own. Standard flow while iterating:
//   DATABASE_URL=postgresql://riftcompare:riftcompare_local@localhost:5432/riftcompare \
//     npm run dev &
//   node scripts/homepage-audit.mjs
// A closer-to-prod check (recommended before signing off) is `npm run build`
// then `npm run start`, pointed at the same DATABASE_URL, then this script
// unchanged — it only ever talks to AUDIT_BASE_URL over HTTP, so it can't
// tell a dev server from a production one and needs no flag to switch.

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const BASE_URL = (process.env.AUDIT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const ARTIFACT_DIR = path.join(ROOT, "artifacts", "after");
const ENTRANCE_ANIMATION_SETTLE_MS = 1200; // hero's staggered fade-ins are 0.6s + up to 360ms delay

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

// Same interactive-element definition used consistently for every
// above-the-fold count in this script (total interactive elements, search
// inputs, region controls, primary CTA) — a[href]/button/input/select/
// textarea/explicit interactive roles/positive-tabindex. Elements are only
// counted if REALLY visible (see isReallyVisible below), not merely present
// in the DOM — a naive display/visibility check was fooled during
// development by two full-screen nav overlays (the ⌘K launcher and the
// mobile mega-menu) that stay mounted at all times and hide via opacity +
// `inert` rather than `display:none`, for their own open/close transition.
const INTERACTIVE_SELECTOR =
  'a[href], button, input, select, textarea, [role="button"], [role="combobox"], [tabindex]:not([tabindex="-1"])';

const results = [];
function record(name, viewport, target, actual, pass, extra) {
  results.push({ name, viewport, target, actual, pass, extra });
}

// Scrolls to `y` and POLLS for window.scrollY to actually arrive, rather than
// a fixed sleep. `globals.css` sets `scroll-behavior: smooth` site-wide (only
// overridden to instant under `prefers-reduced-motion`, which this script's
// default browser context doesn't request), so `window.scrollTo()` animates
// over a real, non-trivial duration instead of jumping — a fixed short wait
// after calling it was found, empirically, to sometimes read back a scroll
// position from mid-animation rather than the true destination, which is
// exactly the kind of flake a polling wait removes instead of just papering
// over with a longer guess.
async function scrollToAndSettle(page, y, timeoutMs = 2000) {
  // Compare against the browser's own CLAMPED destination, not the raw
  // requested `y` — a caller asking to scroll to the full document height
  // (as the final step of a scroll-through loop does) is asking for more
  // than `scrollHeight - innerHeight` actually allows, and comparing against
  // the unclamped value would never settle within tolerance, wasting the
  // full timeout on every such call instead of returning as soon as the
  // browser reaches the only position it was ever going to reach.
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

function fmtScreens(px, vh) {
  return `${px}px (${(px / vh).toFixed(2)} screens)`;
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  // Reachability check up front — a clear, specific error beats Playwright's
  // own "net::ERR_CONNECTION_REFUSED" stack trace three screens down.
  try {
    const r = await fetch(BASE_URL + "/", { method: "GET" });
    if (!r.ok) throw new Error(`homepage responded ${r.status}`);
  } catch (err) {
    console.error(`\nCannot reach ${BASE_URL}/ — is a server running there?`);
    console.error(`  DATABASE_URL=postgresql://riftcompare:riftcompare_local@localhost:5432/riftcompare npm run dev`);
    console.error(`(see this script's own header comment for the closer-to-prod alternative)\n`);
    console.error(String(err));
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch();

  const perViewport = {};
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    perViewport[name] = await auditViewport(browser, name, vp);
  }

  await checkFaqJsonLd(perViewport.desktop.page);
  await checkAffiliateDisclosure(perViewport.desktop.page);
  await crawlInternalLinks(perViewport.desktop.page);

  for (const v of Object.values(perViewport)) await v.context.close();
  await browser.close();

  report();
}

// ---------------------------------------------------------------------------
// Per-viewport DOM/layout measurements
// ---------------------------------------------------------------------------
async function auditViewport(browser, name, vp) {
  const context = await browser.newContext({ viewport: vp });
  const page = await context.newPage();
  await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
  // Let the hero's staggered entrance fades (and anything else keyed off
  // mount) settle before measuring — mid-fade opacity/position would make
  // "above the fold" and "really visible" checks depend on exactly when the
  // script happened to look, which is not what those checks are meant to
  // measure.
  await page.waitForTimeout(ENTRANCE_ANIMATION_SETTLE_MS);

  // Takes INTERACTIVE_SELECTOR as an argument rather than closing over the
  // outer module-scope constant — page.evaluate() serialises its callback
  // and runs it inside the browser, which has no access to this file's own
  // scope, so the selector has to cross that boundary explicitly.
  const data = await page.evaluate((interactiveSelector) => {
    function isReallyVisible(el) {
      // An ancestor marked inert (this codebase's ⌘K launcher and mobile
      // mega-menu both do this while closed, alongside opacity-0, so a real
      // screen reader / keyboard user can't reach what a sighted user can't
      // see either) is never really visible or reachable.
      if (el.closest("[inert]")) return false;
      if (typeof el.checkVisibility === "function") {
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false;
      } else {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
      }
      if (getComputedStyle(el).pointerEvents === "none") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    function aboveFold(el) {
      const r = el.getBoundingClientRect();
      return r.top < vh && r.bottom > 0 && r.left < vw && r.right > 0;
    }
    function visibleAboveFold(selector) {
      return Array.from(document.querySelectorAll(selector)).filter((el) => isReallyVisible(el) && aboveFold(el));
    }
    function sampleOf(els) {
      return els.slice(0, 40).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          text: (el.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 40),
          top: Math.round(r.top),
        };
      });
    }

    const main = document.querySelector("main");
    const height = document.documentElement.scrollHeight;
    const interactiveAboveFold = visibleAboveFold(interactiveSelector);
    const searchInputsAboveFold = visibleAboveFold('input[role="combobox"]');
    const regionControlsAboveFold = visibleAboveFold("[data-region-control]").map((el) => el.getAttribute("data-region-control"));
    const primaryCtaAboveFold = visibleAboveFold("[data-primary-cta]");

    return {
      height,
      vh,
      vw,
      h2Count: main ? main.querySelectorAll("h2").length : -1,
      imageCount: main ? main.querySelectorAll("img").length : -1,
      domNodeCount: document.querySelectorAll("*").length,
      autofocusCount: document.querySelectorAll("[autofocus]").length,
      interactiveAboveFoldCount: interactiveAboveFold.length,
      interactiveAboveFoldSample: sampleOf(interactiveAboveFold),
      searchInputsAboveFoldCount: searchInputsAboveFold.length,
      regionControlsAboveFold,
      primaryCtaAboveFoldCount: primaryCtaAboveFold.length,
    };
  }, INTERACTIVE_SELECTOR);

  // Scroll through the page in a few steps before screenshotting — AFTER
  // every measurement above, which all describe the true first-load state
  // and must not be affected by this. Several homepage sections use
  // Reveal.tsx's IntersectionObserver-driven scroll-reveal (opacity:0 until
  // their own observer first sees them intersect the viewport, deliberately
  // real content in the server HTML either way — see that component's own
  // "SEO / no-JS safe" doc comment); a `fullPage: true` screenshot captures
  // the whole document directly without necessarily dispatching the scroll
  // positions those observers are listening for, so without this step the
  // screenshot below the first viewport can show misleading blank gaps where
  // real, populated sections (e.g. "Explore by set"'s grid of six set tiles)
  // simply never got the chance to reveal themselves. A single jump straight
  // to the bottom isn't enough either — IntersectionObserver only evaluates
  // entries at the scroll positions it's actually given a frame to look at,
  // so a middle section can be skipped between one instant jump's start and
  // end points; several evenly-spaced steps make sure every section's own
  // observer gets at least one frame where it genuinely intersects.
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    await scrollToAndSettle(page, Math.round((docHeight * i) / steps));
    await page.waitForTimeout(120); // let that step's newly-intersecting observers actually fire
  }
  await scrollToAndSettle(page, 0);
  await page.waitForTimeout(150); // let the homepage-only mobile-search scroll-gate (HeaderSearchSlot) re-hide

  // Neutralise `position: sticky` (the header) for the screenshot only — a
  // known Playwright/CDP limitation, not a real rendering bug: a `fullPage`
  // capture expands the viewport to the full document height in one shot
  // rather than replaying a real scroll, and a sticky element's "stuck"
  // offset from an earlier real scroll position (this function's own
  // reveal-triggering steps above) can get baked into that expanded capture,
  // making the header appear to float partway down the page. Real visitors
  // never hit this — they scroll a normal-height viewport, where this
  // header's sticky behaviour is unaffected and already exercised by every
  // prior phase's manual testing. `position: static` for a screenshot-only
  // style tag is enough to make it render once, at its natural top-of-
  // document position, which is exactly what a full-page screenshot should
  // show regardless.
  await page.addStyleTag({ content: "[class*='sticky']{position:static !important;}" });

  // Screenshot — full page, matching artifacts/before/'s own convention.
  await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}-${vp.width}x${vp.height}.png`), fullPage: true });

  // --- Assertions -----------------------------------------------------
  const screens = data.height / vp.height;
  if (name === "desktop") {
    record("Page height @1440x900", name, "≤ 2.6 screens (≤2350px)", fmtScreens(data.height, vp.height), data.height <= 2350);
  } else {
    record("Page height @390x844", name, "≤ 4.5 screens (≤3798px)", fmtScreens(data.height, vp.height), screens <= 4.5);
  }

  record("<h2> count in <main>", name, "≤ 6", data.h2Count, data.h2Count <= 6);
  record("Images in <main>", name, "≤ 24", data.imageCount, data.imageCount <= 24);
  record("DOM nodes", name, "≤ 1300", data.domNodeCount, data.domNodeCount <= 1300);
  record("[autofocus] attributes in the DOM", name, "0", data.autofocusCount, data.autofocusCount === 0);
  record(
    "Visible search inputs above the fold",
    name,
    "exactly 1",
    data.searchInputsAboveFoldCount,
    data.searchInputsAboveFoldCount === 1,
  );
  record(
    "Visible region selectors above the fold",
    name,
    "≤ 1 (0 duplicates)",
    `${data.regionControlsAboveFold.length} [${data.regionControlsAboveFold.join(", ")}]`,
    data.regionControlsAboveFold.length <= 1,
  );
  record(
    "Primary CTAs above the fold ([data-primary-cta])",
    name,
    "exactly 1",
    data.primaryCtaAboveFoldCount,
    data.primaryCtaAboveFoldCount === 1,
  );

  if (name === "desktop") {
    // The brief's own wording scopes this one to desktop ("Interactive
    // targets above the fold (desktop, incl. header) ≤ 12") — mobile is
    // still measured (see the console table) but not asserted against the
    // same ceiling, since the brief never states a mobile figure for it.
    record(
      "Interactive targets above the fold (desktop, incl. header)",
      name,
      "≤ 12",
      data.interactiveAboveFoldCount,
      data.interactiveAboveFoldCount <= 12,
      data.interactiveAboveFoldCount > 12 ? data.interactiveAboveFoldSample : undefined,
    );
  } else {
    record(
      "Interactive targets above the fold (informational only, no mobile target stated)",
      name,
      "n/a",
      data.interactiveAboveFoldCount,
      true,
    );
  }

  return { context, page, data };
}

// ---------------------------------------------------------------------------
// FAQ JSON-LD — must parse, and must contain every question actually on the
// page. Read from src/app/page.tsx's own FAQS array at audit time (rather
// than a hardcoded duplicate list) so this check can never silently go stale
// if a future edit adds/removes/rewords a question — verified once, by hand,
// that this extraction currently matches FAQS exactly (see DECISIONS.md).
// ---------------------------------------------------------------------------
async function checkFaqJsonLd(page) {
  const source = readFileSync(path.join(ROOT, "src/app/page.tsx"), "utf8");
  const faqsBlockMatch = source.match(/const FAQS:[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!faqsBlockMatch) {
    record("FAQ JSON-LD — found FAQS array in page.tsx source", "n/a", "found", "not found", false);
    return;
  }
  const expectedQuestions = Array.from(faqsBlockMatch[1].matchAll(/q:\s*"([^"]+)"/g)).map((m) => m[1]);
  record("FAQ JSON-LD — questions found in page.tsx source", "n/a", "> 0", expectedQuestions.length, expectedQuestions.length > 0);

  const ldJsonBlobs = await page.$$eval('script[type="application/ld+json"]', (nodes) => nodes.map((n) => n.textContent));
  let faqPageNode = null;
  let parseOk = true;
  for (const blob of ldJsonBlobs) {
    try {
      const parsed = JSON.parse(blob);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      const found = nodes.find((n) => n && n["@type"] === "FAQPage");
      if (found) faqPageNode = found;
    } catch {
      parseOk = false;
    }
  }
  record("FAQ JSON-LD — every <script type=application/ld+json> parses", "n/a", "valid JSON", parseOk ? "valid" : "PARSE ERROR", parseOk);
  record("FAQ JSON-LD — an FAQPage node exists", "n/a", "found", faqPageNode ? "found" : "not found", !!faqPageNode);

  if (faqPageNode) {
    const renderedQuestions = (faqPageNode.mainEntity ?? []).map((q) => q.name);
    const missing = expectedQuestions.filter((q) => !renderedQuestions.includes(q));
    const extra = renderedQuestions.filter((q) => !expectedQuestions.includes(q));
    record(
      "FAQ JSON-LD — contains every question from FAQS (and no others)",
      "n/a",
      `${expectedQuestions.length} questions, exact match`,
      `${renderedQuestions.length} questions${missing.length ? `, missing: ${JSON.stringify(missing)}` : ""}${extra.length ? `, extra: ${JSON.stringify(extra)}` : ""}`,
      missing.length === 0 && extra.length === 0,
    );
    // Every question's accepted answer must also be present and non-empty —
    // a FAQPage with a name but no answer text is a Search Console warning
    // waiting to happen, and it's cheap to check while we're already here.
    const emptyAnswers = (faqPageNode.mainEntity ?? []).filter((q) => !q.acceptedAnswer?.text?.trim());
    record(
      "FAQ JSON-LD — every question has a non-empty acceptedAnswer.text",
      "n/a",
      "0 empty answers",
      emptyAnswers.length,
      emptyAnswers.length === 0,
    );
  }

  // The visible, collapsed <details> accordion must carry the SAME answer
  // text in the DOM (brief: "answers present in the DOM ... but not
  // consuming visual space") — a schema-only answer with nothing backing it
  // visually would be exactly the "hide it entirely" the brief rules out.
  const domAnswers = await page.$$eval("main details p", (nodes) => nodes.map((n) => n.textContent?.trim() ?? ""));
  const schemaAnswers = (faqPageNode?.mainEntity ?? []).map((q) => q.acceptedAnswer?.text?.trim() ?? "");
  const answersMatchDom = schemaAnswers.length > 0 && schemaAnswers.every((a) => domAnswers.includes(a));
  record(
    "FAQ JSON-LD — every schema answer is also present in the collapsed DOM",
    "n/a",
    "all present",
    answersMatchDom ? "all present" : `mismatch (DOM has ${domAnswers.length}, schema has ${schemaAnswers.length})`,
    answersMatchDom,
  );
}

// ---------------------------------------------------------------------------
// Affiliate disclosure — EPN/TCGplayer compliance requirement. Extracted
// from AffiliateDisclosure.tsx's own "both" string (rather than a hand-typed
// copy of it here) so this check can never itself drift from the wording it
// is supposed to be guarding — a hardcoded expectation would happily pass
// even if the component's actual text changed out from under it.
// ---------------------------------------------------------------------------
async function checkAffiliateDisclosure(page) {
  const source = readFileSync(path.join(ROOT, "src/components/AffiliateDisclosure.tsx"), "utf8");
  const match = source.match(/both:\s*"([^"]+)"/);
  if (!match) {
    record("Affiliate disclosure — found 'both' wording in source", "n/a", "found", "not found", false);
    return;
  }
  const expectedText = match[1];
  const bodyText = await page.evaluate(() => document.body.textContent || "");
  const present = bodyText.includes(expectedText);
  record(
    "Affiliate disclosure text present on homepage (verbatim, eBay+TCGplayer)",
    "n/a",
    "present",
    present ? "present" : `MISSING: "${expectedText}"`,
    present,
  );
}

// ---------------------------------------------------------------------------
// Crawl every internal link the homepage's own rendered DOM links to
// (href starting with "/" or the site's own origin) and assert none 4xx/5xx.
// Scoped to the homepage's OWN direct links, not a recursive site crawl —
// scripts/crawl-check.ts already exists for the full site graph; duplicating
// that here would be redundant and much slower for no extra signal about the
// homepage rebuild specifically.
// ---------------------------------------------------------------------------
// Concurrency is deliberately modest and the timeout deliberately generous:
// against a `next dev` server (this script's documented default target), a
// route that has never been requested in this server process's lifetime
// compiles on demand — first-hit compiles of 5-10s are normal for this
// codebase's larger routes, and firing many of them at once serialises on
// webpack's single compiler, compounding the wait. A production server
// (`next build && next start`) has nothing to compile at request time and
// comfortably clears this same timeout in milliseconds; the generous budget
// only ever matters for the dev-server case, so it costs nothing there.
const CRAWL_CONCURRENCY = 4;
const CRAWL_TIMEOUT_MS = 45000;

async function crawlInternalLinks(page) {
  const origin = new URL(BASE_URL).origin;
  const hrefs = await page.$$eval("a[href]", (nodes) => nodes.map((n) => n.getAttribute("href")));
  const targets = new Set();
  for (const href of hrefs) {
    if (!href) continue;
    if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    if (href.startsWith("#")) continue;
    let abs;
    try {
      abs = new URL(href, BASE_URL + "/");
    } catch {
      continue;
    }
    if (abs.origin !== origin) continue; // external — not this script's job
    abs.hash = "";
    targets.add(abs.pathname + abs.search);
  }

  const list = Array.from(targets);
  const brokenLinks = [];
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const p = list[cursor++];
      const url = BASE_URL + p;
      let status;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS);
        let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
        // Some route handlers only define GET — Next.js auto-derives HEAD
        // from GET for Route Handlers, but fall back explicitly rather than
        // trust that in every case (this codebase has 150+ routes, some
        // hand-written before that behaviour was verified against).
        if (res.status === 405 || res.status === 501) {
          res = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
        }
        clearTimeout(timer);
        status = res.status;
      } catch (err) {
        status = `ERROR: ${err?.message ?? err}`;
      }
      if (typeof status === "string" || status >= 400) brokenLinks.push({ path: p, status });
    }
  }
  await Promise.all(Array.from({ length: CRAWL_CONCURRENCY }, worker));

  record(
    "Broken internal links reachable from the homepage",
    "n/a",
    "0",
    brokenLinks.length,
    brokenLinks.length === 0,
    brokenLinks.length ? brokenLinks : undefined,
  );
  record("Internal links crawled from the homepage", "n/a", "> 0", list.length, list.length > 0);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function report() {
  const width = Math.max(...results.map((r) => r.name.length)) + 2;
  console.log("\n=== Homepage audit — scripts/homepage-audit.mjs ===");
  console.log(`Base URL: ${BASE_URL}\n`);

  let failCount = 0;
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    if (!r.pass) failCount++;
    const vp = r.viewport === "n/a" ? "" : ` [${r.viewport}]`;
    console.log(`${status.padEnd(5)} ${r.name.padEnd(width)}${vp}  target: ${String(r.target).padEnd(24)} actual: ${r.actual}`);
    if (!r.pass && r.extra) {
      const extra = Array.isArray(r.extra) ? r.extra : [r.extra];
      for (const e of extra.slice(0, 15)) {
        if (typeof e === "object") {
          console.log(`        ${e.top != null ? `${e.top}px  ` : ""}<${e.tag ?? ""}> "${e.text ?? ""}" ${e.path ? e.path + " -> " + e.status : ""}`);
        } else {
          console.log(`        ${e}`);
        }
      }
    }
  }

  console.log(`\n${results.length - failCount}/${results.length} checks passed.`);
  if (failCount > 0) {
    console.log(`${failCount} FAILED — see DECISIONS.md for which failures are logged as accepted, documented shortfalls`);
    console.log(`(architectural constraints identified and reasoned about, not silently ignored) vs. real regressions to fix.\n`);
    process.exitCode = 1;
  } else {
    console.log("All hard targets covered by this script passed.\n");
  }
  console.log(`Screenshots written to ${path.relative(ROOT, ARTIFACT_DIR)}/\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
