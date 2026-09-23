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
 *   SMOKE_SEED=1 npx tsx scripts/smoke-pages.ts          # a build serving prisma/seed.ts
 *
 * SMOKE_SEED=1 is for .github/workflows/ci-build.yml, which builds and starts
 * the app against a throwaway Postgres holding prisma/seed.ts's synthetic
 * catalogue (never a production database — see that workflow's header). The
 * seed has ~1,064 Origins-to-Unleashed cards and nothing else: no Vendetta or
 * Radiance printings, no retailer prices, no price history. A few expectations
 * below are about production DATA (a specific Vendetta card, Product/PreOrder
 * JSON-LD, which is emitted only when there are offers), so a check may carry
 * a `seed` override for exactly those. It can change WHICH page or WHICH copy
 * is asserted — never the floors: 200, the <h1> count, minText, minLinks,
 * mustNot and the retired-URL assertions apply identically in both modes.
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
// Strictly "1": anything else runs the production expectations, which fail
// loudly on a seeded build rather than passing quietly on a real one.
const SEED = process.env.SMOKE_SEED === "1";

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
  /**
   * Exact number of <h1> elements. Default 1. Only a chrome-free widget
   * document (no layout, no heading of its own) should ever set this.
   */
  h1?: number;
  /**
   * SMOKE_SEED=1 replacements for an expectation that only production DATA
   * can meet (see the header). Limited to these three fields on purpose: the
   * floors are read from the check itself in both modes, so a seed override
   * can point at a page the seed has, or at copy the seed renders, and can
   * never lower what is asserted about the page it lands on.
   */
  seed?: { path?: string; label?: string; must?: string[] };
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
    // The seed has no Vendetta, and the card page emits Product JSON-LD only
    // when it has offers (no retailer prices in the seed). OGN #001 is the
    // first card of the first set, so it survives any reshuffle of the seed;
    // its breadcrumb schema is the card template's own, not the layout's.
    seed: {
      path: "/card/blazing-scorcher-ogn-001-298",
      label: "card page (seed: Blazing Scorcher)",
      must: ['"@type":"BreadcrumbList"', "Blazing Scorcher"],
    },
  },

  // ── The release calendar: always leads with the NEXT set ─────────────────
  {
    path: "/release-dates",
    label: "release dates",
    optional: true,
    // Deliberately set-agnostic assertions. The old check demanded the literal
    // string "23 October 2026", which would have started failing the day
    // Radiance shipped — the exact staleness this page was rebuilt to end. What
    // must always hold is that the page renders its FAQ schema and its full
    // calendar, whichever set happens to be next.
    must: ['"@type":"FAQPage"', "Riftbound release dates", "Every Riftbound release, in order", "Vendetta"],
    minText: 900,
  },

  // ── The upcoming set's launch surfaces ───────────────────────────────────
  // None of these were smoke-checked before, which is a gap with a deadline on
  // it: they are the pages that carry a set launch, and the window where they
  // matter is the one window where nobody is watching them.
  //
  // Assertions are deliberately thin and set-agnostic where they can be. The
  // pre-order page IS named for its set (it is the one route that is), so it may
  // name Radiance — but it must never claim InStock for a product nobody has
  // shipped, which is the single thing that would make it a lie, so that is what
  // is asserted rather than any particular price or store.
  {
    path: "/radiance-preorders",
    label: "Radiance pre-order comparison",
    optional: true,
    must: ["Pre-order", "schema.org/PreOrder", '"@type":"FAQPage"'],
    mustNot: ["schema.org/InStock"],
    minText: 600,
    // The PreOrder ItemList is emitted only for PRICED pre-order listings,
    // and the seed has none. The InStock ban above still applies.
    seed: { must: ["Pre-order", '"@type":"FAQPage"'] },
  },
  {
    path: "/sets/radiance",
    label: "upcoming set hub",
    optional: true,
    // Asserts the hub (RadianceHub), which renders whatever the card count.
    // This used to demand "Get ready for Radiance", the heading of the
    // zero-card empty state, which never matched anywhere: it shipped in the
    // same commit as that heading's JSX, `Get ready for {set.name}`, which
    // React serves as `Get ready for <!-- -->Radiance` (fixed in the matcher
    // below). And production no longer renders the empty state at all:
    // spoiled Radiance cards are in the catalogue (checked 2026-09-23). The
    // seed has no Radiance cards, so under SMOKE_SEED the page is guaranteed
    // empty and that state's exits are asserted as well.
    must: ["Radiance", "Riftbound Radiance — what"],
    minText: 300,
    seed: { must: ["Radiance", "Riftbound Radiance — what", "Get ready for Radiance"] },
  },
  {
    path: "/embed/release-countdown",
    label: "embeddable release countdown",
    optional: true,
    // Chrome-free route handler, so no layout text — just the widget's own
    // body. Hence also no <h1> and no relative links: its one link is
    // ABSOLUTE (it is served inside other people's pages) and is asserted by
    // name instead. The default floors of one <h1> and ten links failed this
    // check against every origin, production included, until 2026-09-23.
    must: ["data-target=", "RiftCompare", "riftcompare.com/release-dates?utm_source=embed"],
    minText: 40,
    h1: 0,
    minLinks: 0,
  },
  {
    // The widget DIRECTORY — an ordinary page, unlike the three widgets under
    // it. This is the URL partnership outreach sends people to, so a webmaster
    // landing on a broken one is the failure that costs an actual link rather
    // than a pageview. It must show the snippets a reader is meant to copy.
    path: "/embed",
    label: "widget directory (outreach landing page)",
    must: ["iframe", "/embed/release-countdown", "Card price badge"],
    minText: 600,
  },

  // ── Retired URLs ─────────────────────────────────────────────────────────
  // /vendetta-countdown carried the "riftbound vendetta release date" query and
  // ~35 internal links, so it must 301 rather than 404 — a silent drop to 404
  // would throw that away and look identical to a working deploy.
  { path: "/vendetta-countdown", label: "retired Vendetta countdown → set page", retired: { to: "/sets/vendetta" } },
  // Its Radiance-era successor, retired for the same reason and 301'd to the
  // set-agnostic page that replaced BOTH of them.
  { path: "/radiance-countdown", label: "retired Radiance countdown → release dates", retired: { to: "/release-dates" } },
  // The widget feature is gone outright; nothing links here and it has no
  // equivalent page, so 404 is the correct answer, not a redirect to something
  // unrelated.
  { path: "/widgets", label: "retired price-widget page", retired: {} },

  // ── Box EV ───────────────────────────────────────────────────────────────
  // The calculator is a client component, so the numbers themselves are not in
  // the HTML — but the page's editorial IS, and that is what regressed here
  // before: a DB failure used to leave "Price data is still warming up" with no
  // pools, which looks fine and says nothing. `mustNot` catches exactly that.
  {
    path: "/tools/box-ev",
    label: "box EV calculator",
    must: ['"@type":"WebApplication"', "TCGplayer market price"],
    mustNot: ["Price data is still warming up"],
    minText: 1200,
  },

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
  console.log(`Smoke-testing ${BASE}${SEED ? " (SMOKE_SEED: seed-data expectations)" : ""}\n`);
  let failures = 0;
  let skipped = 0;

  for (const base of CHECKS) {
    // Spread order is the guarantee: only the three fields `seed` may hold can
    // be replaced, so every floor below is still read from the check itself.
    const c: Check = SEED && base.seed ? { ...base, ...base.seed } : base;
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
      const wantH1 = c.h1 ?? 1;
      if (h1s !== wantH1) problems.push(`${h1s} <h1> elements, expected exactly ${wantH1}`);

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

      // React separates adjacent text nodes with an empty comment, so JSX like
      // `Get ready for {set.name}` is served as `Get ready for <!-- -->Radiance`
      // and a phrase spanning an interpolation can never match the raw bytes —
      // which is how the /sets/radiance check failed from the day it was
      // written. Matching against the joined text only ever finds MORE, so the
      // mustNot list is checked against it too.
      const joined = html.replace(/<!-- -->/g, "");
      for (const s of c.must ?? []) {
        // Compare against whitespace-normalised HTML so a JSON-LD assertion isn't
        // defeated by the serializer's spacing.
        if (!joined.includes(s) && !joined.replace(/\s+/g, "").includes(s.replace(/\s+/g, ""))) {
          problems.push(`missing required content: ${JSON.stringify(s)}`);
        }
      }
      for (const s of c.mustNot ?? []) {
        if (joined.includes(s)) problems.push(`contains forbidden content: ${JSON.stringify(s)}`);
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
