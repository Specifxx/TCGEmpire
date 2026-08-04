/**
 * scripts/mobile-check.ts — 375px viewport audit.
 *
 *   npx tsx scripts/mobile-check.ts --url http://localhost:3111
 *
 * "The site is unusable on a phone" is a silent AdSense rejection cause: nothing
 * in the console says so, the review just fails. This drives a real Chromium at
 * an iPhone SE viewport (375×667) and reports the four faults that actually
 * cause it, measured rather than eyeballed:
 *
 *   • horizontal scroll — scrollWidth wider than the viewport
 *   • elements overflowing the right edge (the thing that CAUSES the scroll)
 *   • tap targets under 44×44 CSS px (Apple HIG / Google's mobile-usability bar)
 *   • text clipped by an overflow:hidden ancestor
 *
 * Uses the pre-installed Chromium via playwright-core; skips cleanly with an
 * explanatory message if neither is present, so it never breaks a build.
 */
export {};

const args = process.argv.slice(2);
const argOf = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = argOf("--url", "http://localhost:3111").replace(/\/$/, "");

const PATHS = (
  process.env.MOBILE_CHECK_PATHS ??
  "/,/browse,/sets,/guides,/blog,/about,/privacy,/editorial-policy,/market,/marketplace,/cards/rarity/rare"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const VIEWPORT = { width: 375, height: 667 };
const VERBOSE = args.includes("--verbose");
const MIN_TAP = 44;

// Interactive elements only — a 20px-tall <span> is not a tap target.
const TAP_SELECTOR = 'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, summary';

// Structural types for the slice of playwright-core this script uses.
//
// WHY NOT `import type { chromium } from "playwright-core"`: playwright-core is
// an OPTIONAL, developer-machine dependency — this script is run by hand against
// a running server, never in CI and never during a deploy. But `next build`
// typechecks the whole project (tsconfig includes **/*.ts), so a type-level
// reference to a package that isn't installed fails the PRODUCTION BUILD:
//
//   Type error: Cannot find module 'playwright-core' or its corresponding type
//   declarations.  scripts/mobile-check.ts:43
//
// That is exactly what happened on the first Vercel deploy of this branch.
// Typing the handful of methods used here structurally, and importing through a
// non-literal specifier so TypeScript cannot try to resolve it, keeps the script
// fully working where playwright-core IS installed and keeps it inert — and
// type-clean — everywhere else.
type PageLike = {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate(script: string): Promise<unknown>;
  close(): Promise<void>;
};
type ContextLike = { newPage(): Promise<PageLike> };
type BrowserLike = {
  newContext(opts: Record<string, unknown>): Promise<ContextLike>;
  close(): Promise<void>;
};
type ChromiumLike = {
  launch(opts: { executablePath: string; args?: string[] }): Promise<BrowserLike>;
};

const PLAYWRIGHT = "playwright-core";

async function main() {
  let chromium: ChromiumLike;
  try {
    // Non-literal specifier on purpose — see the note above.
    ({ chromium } = (await import(PLAYWRIGHT)) as { chromium: ChromiumLike });
  } catch {
    console.log("playwright-core is not installed — skipping the mobile check.");
    console.log("  npm i -D playwright-core   (Chromium is already at /opt/pw-browsers)");
    return;
  }

  const candidates = [
    process.env.CHROMIUM_PATH,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
    "/usr/bin/chromium",
  ].filter(Boolean) as string[];

  const { existsSync } = await import("node:fs");
  const executablePath = candidates.find((p) => existsSync(p));
  if (!executablePath) {
    console.log("No Chromium binary found — skipping the mobile check.");
    return;
  }

  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  let failures = 0;
  let totalVisible = 0, totalUnder44 = 0, totalUnder48 = 0;
  console.log(`\nMobile audit at ${VIEWPORT.width}×${VIEWPORT.height} — ${BASE}\n`);

  for (const path of PATHS) {
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 });
      // Let late-arriving content (carousels, client price sections) settle.
      await page.waitForTimeout(700);

      // The evaluate body is passed as a STRING, not a function. tsx/esbuild
      // rewrites transpiled functions to reference its own `__name` helper,
      // which does not exist in the page context — serialising a function here
      // fails with "ReferenceError: __name is not defined" on every page.
      const report = (await page.evaluate(`(() => {
        const MIN_TAP = ${MIN_TAP};
        const VW = ${VIEWPORT.width};
        const TAP_SELECTOR = ${JSON.stringify(TAP_SELECTOR)};
        const doc = document.documentElement;
        const scrollWidth = Math.max(doc.scrollWidth, document.body.scrollWidth);

        function describe(el) {
          const tag = el.tagName.toLowerCase();
          const cls = (el.getAttribute("class") || "").split(/\\s+/).slice(0, 2).join(".");
          const txt = (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 30);
          return tag + (cls ? "." + cls : "") + (txt ? ' "' + txt + '"' : "");
        }

        // Overflowing elements: anything whose painted box crosses the right
        // edge. Fixed decorative layers and deliberate horizontal scrollers are
        // exempt — a swipeable card row is a feature, not a broken layout.
        const overflowing = [];
        const all = Array.prototype.slice.call(document.body.querySelectorAll("*"));
        for (const el of all) {
          if (el.getAttribute("aria-hidden") === "true") continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right <= VW + 1) continue;
          if (getComputedStyle(el).position === "fixed") continue;
          let p = el.parentElement, inScroller = false;
          while (p && p !== document.body) {
            const ps = getComputedStyle(p);
            if (ps.overflowX === "auto" || ps.overflowX === "scroll") { inScroller = true; break; }
            p = p.parentElement;
          }
          if (inScroller) continue;
          overflowing.push(describe(el) + " -> right " + Math.round(r.right) + "px");
        }

        // Tap targets. Two numbers are produced on purpose:
        //
        //   small     — reportable failures, after the exemptions below.
        //   tapUnder* — EVERY visible interactive element, unexempted, which is
        //               what a reviewer measuring the live DOM sees and the only
        //               number that makes a before/after comparable.
        //
        // The exemptions are defensible (prose links, breadcrumbs, sr-only skip
        // links) but they hid the footer's 15px link rows for a long time: those
        // links sit in <li>, and an <a> is display:inline, so both halves of the
        // prose-link exemption matched a list of pure navigation.
        const small = [];
        let tapVisible = 0, tapUnder44 = 0, tapUnder48 = 0;
        const worst = [];
        for (const el of Array.prototype.slice.call(document.querySelectorAll(TAP_SELECTOR))) {
          const r0 = el.getBoundingClientRect();
          if (r0.width === 0 || r0.height === 0) continue;
          const cs0 = getComputedStyle(el);
          if (cs0.visibility === "hidden" || cs0.display === "none") continue;
          if (el.className && String(el.className).indexOf("sr-only") >= 0) continue;
          tapVisible++;
          if (r0.height < 43 || r0.width < 43) tapUnder44++;
          if (r0.height < 47 || r0.width < 47) {
            tapUnder48++;
            if (worst.length < 6) worst.push(describe(el) + " -> " + Math.round(r0.width) + "x" + Math.round(r0.height));
          }
        }
        for (const el of Array.prototype.slice.call(document.querySelectorAll(TAP_SELECTOR))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none") continue;
          if (el.closest("p, li, dd, blockquote") && cs.display.indexOf("inline") >= 0) continue;
          // Visually-hidden skip links are 1x1 until focused, by design (WCAG
          // 2.4.1). They expand to a full control on focus; measuring them at
          // rest is measuring the wrong state.
          if (el.className && String(el.className).indexOf("sr-only") >= 0) continue;
          // Breadcrumb trails are inline text navigation, not controls.
          if (el.closest("nav[aria-label='Breadcrumb'], ol")) continue;
          // 1px tolerance: an element set to exactly 44px (min-h-11 = 2.75rem)
          // measures 43.x under a 2x device pixel ratio, and failing a control
          // that IS at the standard makes the check untrustworthy.
          if (r.width < MIN_TAP - 1 || r.height < MIN_TAP - 1) {
            small.push(describe(el) + " -> " + Math.round(r.width) + "x" + Math.round(r.height));
          }
        }

        // Clipped text: content taller than its own overflow:hidden box, i.e.
        // words the visitor cannot read. Deliberate truncation (ellipsis,
        // line-clamp) is excluded.
        const clipped = [];
        for (const el of all) {
          const cs = getComputedStyle(el);
          if (cs.overflow !== "hidden" && cs.overflowY !== "hidden") continue;
          if (cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none") continue;
          if (el.scrollHeight > el.clientHeight + 4 && (el.textContent || "").trim().length > 20) {
            clipped.push(describe(el) + " -> " + el.scrollHeight + "px content in " + el.clientHeight + "px box");
          }
        }

        return {
          scrollWidth: scrollWidth,
          overflowing: overflowing.slice(0, 6),
          small: small.slice(0, 8),
          clipped: clipped.slice(0, 5),
          tapVisible: tapVisible,
          tapUnder44: tapUnder44,
          tapUnder48: tapUnder48,
          worst: worst,
        };
      })()`)) as {
        scrollWidth: number;
        overflowing: string[];
        small: string[];
        clipped: string[];
        tapVisible: number;
        tapUnder44: number;
        tapUnder48: number;
        worst: string[];
      };

      const hScroll = report.scrollWidth > VIEWPORT.width + 1;
      const bad = hScroll || report.overflowing.length || report.small.length || report.clipped.length;
      if (bad) failures++;
      totalVisible += report.tapVisible;
      totalUnder44 += report.tapUnder44;
      totalUnder48 += report.tapUnder48;

      console.log(
        `${bad ? "\x1b[31m✗\x1b[0m" : "\x1b[32m✓\x1b[0m"} ${path}` +
          `   \x1b[90m${report.tapUnder44}/${report.tapVisible} under 44px · ${report.tapUnder48}/${report.tapVisible} under 48px\x1b[0m`,
      );
      if (VERBOSE) for (const w of report.worst) console.log(`    \x1b[90msub-48: ${w}\x1b[0m`);
      if (hScroll) console.log(`    horizontal scroll: document is ${report.scrollWidth}px wide`);
      for (const o of report.overflowing) console.log(`    overflows right edge: ${o}`);
      for (const s of report.small) console.log(`    tap target < ${MIN_TAP}px: ${s}`);
      for (const c of report.clipped) console.log(`    clipped text: ${c}`);
    } catch (e) {
      failures++;
      console.log(`\x1b[31m✗\x1b[0m ${path} — ${String(e).slice(0, 120)}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  const pct = (n: number) => (totalVisible ? ((n / totalVisible) * 100).toFixed(0) : "0");
  console.log(
    `\nTap targets across ${PATHS.length} pages: ${totalUnder44}/${totalVisible} under 44px (${pct(totalUnder44)}%), ` +
      `${totalUnder48}/${totalVisible} under 48px (${pct(totalUnder48)}%).`,
  );
  console.log(`${failures === 0 ? "All pages clean at 375px." : `${failures} of ${PATHS.length} pages have mobile issues.`}\n`);
}

void main();
