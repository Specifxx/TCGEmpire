/**
 * Smoke test — do the pages that matter actually return real content?
 *
 * WHY THIS EXISTS, SPECIFICALLY:
 * The AdSense remediation shipped a deploy in which the HOMEPAGE server-rendered
 * nothing at all — an unwrapped useSearchParams() in the hero deopted the whole
 * tree to client-side rendering, so the HTML Google (and every non-JS client) got
 * was a loading spinner with no <h1> and not one internal link. It typechecked, it
 * built, and it looked fine in a browser. Nothing in CI could have caught it,
 * because nothing in CI looked at the bytes.
 *
 * This does. For each key URL it asserts the things that were false that day:
 *   • HTTP 200
 *   • no BAILOUT_TO_CLIENT_SIDE_RENDERING marker inside <main>
 *   • exactly one <h1>
 *   • a floor of real visible text in <body>
 *   • a floor of internal links
 *   • any page-specific strings the caller demands (schema types, key copy)
 *
 * It is deliberately NOT a crawler — scripts/crawl-check.ts already walks the whole
 * site. This is the fast, explicit list you run on every deploy, and it fails loudly
 * with the actual numbers rather than a pass/fail bit.
 *
 * Usage:
 *   npx tsx scripts/smoke-pages.ts                      # defaults to localhost:3000
 *   npx tsx scripts/smoke-pages.ts https://riftcompare.com
 *   npx tsx scripts/smoke-pages.ts <origin> --allow-404  # new routes not deployed yet
 *
 * Exit code 1 on any failure, so it can gate a deploy.
 */

// NOT named `origin`: next build typechecks scripts/ too, and `origin` is a
// lib.dom global — redeclaring it fails the whole production build. A stray
// script reference taking the deploy down is a mistake this repo has already
// made once (see docs/adsense-remediation.md, the playwright-core import).
const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
// For running against an origin that predates a branch's new routes: a 404 on a
// page marked `optional` is reported but doesn't fail the run. Never silences a
// 404 on an established page.
const allow404 = process.argv.includes("--allow-404");

interface Check {
  path: string;
  label: string;
  /** Substrings that MUST appear in the served HTML. */
  must?: string[];
  /** Substrings that must NOT appear. */
  mustNot?: string[];
  /** Minimum visible text characters in <body>. Default 500. */
  minText?: number;
  /** Minimum internal links. Default 10. */
  minLinks?: number;
  /** Route added on a feature branch — a 404 is tolerated with --allow-404. */
  optional?: boolean;
  /**
   * A RETIRED url. Asserts the redirect/404 itself instead of page content: no
   * redirect is followed, and none of the content floors apply.
   *
   * `to` set   → expect a 301/308 whose Location ends with this path.
   * `to` unset → expect a 404 (the page is simply gone).
   *
   * Retiring a page is the change most likely to be half-done — the route gets
   * deleted, the next.config.js entry doesn't, and nobody notices the 404 until
   * Search Console reports it. Asserting it here means every deploy re-checks it.
   */
  retired?: { to?: string };
}

const CHECKS: Check[] = [
  // ── The page that broke. Non-negotiable. ─────────────────────────────────
  { path: "/", label: "homepage", minText: 1500, minLinks: 40 },

  // ── SEO landing pages this branch targets ────────────────────────────────
  {
    path: "/sets/vendetta/gallery",
    label: "Vendetta card gallery (new)",
    optional: true,
    must: ['"@type":"ItemList"', "card gallery"],
    minLinks: 20,
  },
  { path: "/sets/vendetta", label: "Vendetta set page", must: ["Vendetta"], minLinks: 20 },
  {
    path: "/riftle",
    label: "Riftle",
    must: ['"@type":"VideoGame"', '"@type":"FAQPage"', "Riftle"],
    // The game grid is client-side; the surrounding explainer + FAQ is what has to
    // be in the HTML, and is the whole point of the change being smoke-tested here.
    minText: 900,
    minLinks: 10,
  },

  // ── The mechanics cluster (our best-performing content) ──────────────────
  {
    path: "/guides/riftbound-empower-explained",
    label: "Empower guide",
    must: ['"@type":"FAQPage"', "Empower"],
    minText: 2000,
  },
  {
    path: "/guides/riftbound-flow-explained",
    label: "Flow guide",
    must: ['"@type":"FAQPage"', "Flow"],
    minText: 2000,
  },
  {
    path: "/guides/riftbound-burn-explained",
    label: "Burn guide",
    must: ['"@type":"FAQPage"', "Burn"],
    minText: 2000,
  },

  // ── Card page template (the card-name query cluster) ─────────────────────
  {
    path: "/card/ravenbloom-prefect-ven-102",
    label: "card page (Ravenbloom Prefect)",
    must: ['"@type":"Product"'],
    minText: 800,
  },

  // ── The release countdown: always the NEXT set ───────────────────────────
  {
    path: "/radiance-countdown",
    label: "Radiance countdown (new)",
    optional: true,
    // Event schema is emitted only while the date is still ahead — this asserting
    // is the point: if it survives past 23 Oct 2026 the page is claiming an
    // upcoming event that already happened, and this check will say so.
    must: ['"@type":"FAQPage"', "23 October 2026", "Radiance"],
    minText: 900,
  },

  // ── Retired URLs ─────────────────────────────────────────────────────────
  // /vendetta-countdown carried the "riftbound vendetta release date" query and
  // ~35 internal links, so it must 301 rather than 404 — a silent drop to 404
  // would throw that away and look identical to a working deploy.
  { path: "/vendetta-countdown", label: "retired Vendetta countdown → set page", retired: { to: "/sets/vendetta" } },
  // The widget feature is gone outright; nothing links here and it has no
  // equivalent page, so 404 is the correct answer, not a redirect to something
  // unrelated.
  { path: "/widgets", label: "retired price-widget page", retired: {} },

  // ── Core browse surfaces ─────────────────────────────────────────────────
  { path: "/browse", label: "card database", minLinks: 20 },
  { path: "/guides", label: "guides index", minLinks: 20 },
  { path: "/blog", label: "blog index", minLinks: 20 },
];

/** Visible text: strip script/style/head, then tags, then collapse whitespace. */
function visibleText(html: string): string {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function run() {
  console.log(`Smoke-testing ${BASE}\n`);
  let failures = 0;
  let skipped = 0;

  for (const c of CHECKS) {
    const url = `${BASE}${c.path}`;
    const problems: string[] = [];
    let status = 0;
    let html = "";

    let location: string | null = null;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "RiftCompare-smoke/1.0" },
        // A retired URL is checked with redirect:"manual" — following the 301
        // would test the destination page and say nothing about the redirect,
        // which is the entire thing being asserted.
        redirect: c.retired ? "manual" : "follow",
      });
      status = res.status;
      location = res.headers.get("location");
      if (!c.retired) html = await res.text();
    } catch (e) {
      problems.push(`fetch failed: ${(e as Error).message}`);
    }

    if (!problems.length && c.retired) {
      const want = c.retired.to;
      if (want) {
        if (status !== 301 && status !== 308) {
          problems.push(`HTTP ${status}, expected a permanent redirect to ${want}`);
        } else if (!location || !location.replace(/\?.*$/, "").endsWith(want)) {
          problems.push(`redirects to ${location ?? "(no Location header)"}, expected ${want}`);
        }
      } else if (status !== 404 && status !== 410) {
        problems.push(`HTTP ${status}, expected the page to be gone (404)`);
      }
    } else if (!problems.length) {
      if (status === 404 && c.optional && allow404) {
        console.log(`~ SKIP ${c.label} (${c.path}) — 404, route not deployed yet`);
        skipped++;
        continue;
      }
      if (status !== 200) problems.push(`HTTP ${status}, expected 200`);

      // ── On the CSR-bailout marker ──────────────────────────────────────────
      // Its mere presence inside <main> is NOT a failure, and treating it as one
      // was a bug in this script that failed a perfectly healthy production deploy
      // (and would have triggered a needless revert). React emits
      //   <!--$!--><template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>
      //   <fallback/><!--/$-->
      // for EVERY Suspense boundary that deopts — including the hero's SearchBar,
      // which is wrapped in its own boundary precisely so the deopt stays contained
      // to one input. A contained bailout is the fix working, not the bug.
      //
      // What actually went wrong that day was an UNCONTAINED bailout: with no
      // boundary around SearchBar it escalated to app/loading.tsx and swallowed the
      // entire page, leaving a spinner with no <h1> and zero links. That condition
      // is measured directly by the three floors below. So the marker is kept only
      // as an EXPLANATION attached to a real content failure, never as its own.
      const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
      const bailedOut = Boolean(main && main[1].includes("BAILOUT_TO_CLIENT_SIDE_RENDERING"));

      const before = problems.length;

      const h1s = (html.match(/<h1[\s>]/gi) ?? []).length;
      if (h1s !== 1) problems.push(`${h1s} <h1> elements, expected exactly 1`);

      const text = visibleText(html);
      const minText = c.minText ?? 500;
      if (text.length < minText) problems.push(`only ${text.length} chars of visible text (min ${minText})`);

      const links = new Set(
        [...html.matchAll(/href="(\/[^"#?][^"]*)"/g)].map((m) => m[1]),
      ).size;
      const minLinks = c.minLinks ?? 10;
      if (links < minLinks) problems.push(`only ${links} internal links (min ${minLinks})`);

      // Content floors failed AND the page deopted → this is the real incident.
      if (problems.length > before && bailedOut) {
        problems.push(
          "^ an UNCONTAINED client-side-rendering bailout swallowed <main> — check for a " +
            "useSearchParams() (or other client hook) rendered without its own <Suspense> boundary",
        );
      }

      for (const s of c.must ?? []) {
        // Compare against whitespace-normalised HTML so a JSON-LD assertion isn't
        // defeated by the serializer's spacing.
        if (!html.includes(s) && !html.replace(/\s+/g, "").includes(s.replace(/\s+/g, ""))) {
          problems.push(`missing required content: ${JSON.stringify(s)}`);
        }
      }
      for (const s of c.mustNot ?? []) {
        if (html.includes(s)) problems.push(`contains forbidden content: ${JSON.stringify(s)}`);
      }
    }

    if (problems.length) {
      failures++;
      console.log(`✗ FAIL ${c.label} (${c.path})`);
      for (const p of problems) console.log(`        ${p}`);
    } else {
      console.log(`✓ ok   ${c.label} (${c.path})`);
    }
  }

  const ran = CHECKS.length - skipped;
  console.log(`\n${ran - failures}/${ran} checks passed${skipped ? ` (${skipped} skipped)` : ""}.`);
  if (failures) {
    console.error(`\n::error::${failures} page(s) failed the smoke test.`);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
