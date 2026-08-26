/**
 * scripts/status-check.ts — assert HTTP STATUS CODES, not rendered text.
 *
 *   npx tsx scripts/status-check.ts --url http://localhost:3111
 *   npm run status:check -- --url https://riftcompare.com
 *
 * Every unresolvable dynamic param must return a real 404. This is a separate
 * script from crawl-check because a crawler only follows links that exist — it
 * can never discover the URLs that matter here, which are the ones nothing links
 * to and anyone can invent.
 *
 * ── The bug this exists to prevent ──────────────────────────────────────────
 * `src/app/loading.tsx` at the APP ROOT wrapped every route in a Suspense
 * boundary. That makes Next stream: the shell flushes with a committed HTTP 200
 * before the page component runs, so a notFound() thrown afterwards could only
 * swap the UI, never the status. Result: every unknown /card/…, /sets/…,
 * /decks/… URL returned "200 OK" with the 404 page rendered inside it —
 * an unlimited supply of crawlable junk URLs, each a soft 404.
 *
 * It could not be fixed by moving notFound() into generateMetadata: measured,
 * that returns 200 too while a root loading.tsx exists. The only fix is to not
 * have a Suspense boundary above the notFound() call, which is why loading.tsx
 * is now scoped to leaf routes with no notFound()-calling descendants.
 *
 * Checks, per dynamic route family:
 *   • a bogus param returns 404 (not 200, not 500)
 *   • the 404 body is the real not-found page, not a half-rendered template
 *   • the 404 carries its own <title> — not the homepage's
 *   • a KNOWN-GOOD param on the same route still returns 200 (no over-404ing)
 */
export {};

const args = process.argv.slice(2);
const argOf = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = argOf("--url", "http://localhost:3111").replace(/\/$/, "");

// Bogus params, one per dynamic route family. Deliberately varied in shape:
// a plausible slug, an obvious probe, punctuation, and a very long string.
const MUST_404 = [
  "/card/nonexistent-card-test",
  "/card/vi-destructive-ogn-999z-999",
  "/sets/nonexistent-page-test",
  "/sets/origins-extra",
  "/decks/nonexistent-deck-test",
  "/blog/nonexistent-post-test",
  "/guides/nonexistent-guide-test",
  "/stores/nonexistent-store-test",
  "/champions/nonexistent-champion-test",
  "/keywords/nonexistent-keyword-test",
  "/domains/nonexistent-domain-test",
  "/authors/nonexistent-author-test",
  "/cards/type/nonexistent-type-test",
  "/cards/rarity/nonexistent-rarity-test",
  "/cards/printing/nonexistent-printing-test",
  "/marketplace/seller/nonexistent-seller-test",
  // Not a dynamic param — the router's own 404. Included so a regression that
  // breaks routing-level 404s is caught by the same script.
  "/this-route-does-not-exist-at-all",
  "/browse/deeper/than/it/goes",
];

// Dynamic ROUTE HANDLERS (not pages). They never render the React not-found
// page — they answer with markdown, XML or a chrome-free HTML widget — so only
// the status line is asserted for these.
const MUST_404_RAW = [
  "/llm/card/nonexistent-card-test",
  "/llm/blog/nonexistent-post-test",
  "/sitemaps/nonexistent-section-test",
  // Was the last soft 404 on the site: an unknown id returned 200 with a
  // "Card not found" widget rendered inside it.
  "/embed/card/nonexistent-card-test",
];

// Known-good URLs that must KEEP returning 200 — the other half of the check.
// A fix that 404s everything would otherwise pass.
const MUST_200 = (process.env.STATUS_CHECK_OK ?? "/,/browse,/sets,/guides,/blog,/about,/privacy,/editorial-policy,/authors,/movers")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const UA = "Mozilla/5.0 (compatible; RiftCompare-StatusCheck/1.0)";

// Titles come out of the HTML entity-escaped ("&amp;", "&#x27;"). Comparing a
// raw string against the escaped markup silently never matches, which is how the
// homepage-title bug survived its own regression check: every 404 WAS serving
// "RiftCompare — Riftbound Card Database &amp; Price Comparison" and the check
// reported a tick. Decode before comparing, always.
const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ");

async function probe(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: { "user-agent": UA, accept: "text/html" },
  });
  const html = res.status < 300 || res.status >= 400 ? await res.text() : "";
  return {
    status: res.status,
    location: res.headers.get("location"),
    isNotFoundPage: /This page doesn(&apos;|&#x27;|&#39;|')t exist/.test(html),
    title: decode((/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim()),
    // Every <meta name="robots"> on the page, decoded and lowercased. A 404 that
    // also says "index, follow" is a page telling Google two different things.
    robots: [...html.matchAll(/<meta[^>]+name="robots"[^>]*content="([^"]*)"/gi)].map((m) =>
      decode(m[1]).toLowerCase(),
    ),
    length: html.length,
  };
}

const HOMEPAGE_TITLE = "RiftCompare — Riftbound Card Database & Price Comparison";

async function main() {
  console.log(`\nHTTP status check — ${BASE}\n`);
  let failures = 0;
  const ok = (m: string) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
  const bad = (m: string) => {
    failures++;
    console.log(`  \x1b[31m✗ ${m}\x1b[0m`);
  };

  console.log("Unresolvable params must be a real 404:");
  for (const path of MUST_404) {
    try {
      const r = await probe(path);
      // A 3xx to a canonical URL is a legitimate answer for some shapes; follow
      // it once and judge the destination instead of failing outright.
      if (r.status >= 300 && r.status < 400 && r.location) {
        bad(`${path} → ${r.status} redirect to ${r.location} (expected 404)`);
        continue;
      }
      if (r.status !== 404) {
        bad(`${path} → ${r.status}${r.isNotFoundPage ? " with the 404 page rendered — SOFT 404" : ""}`);
        continue;
      }
      if (!r.isNotFoundPage) {
        bad(`${path} → 404 but the body isn't the not-found page (${r.length} bytes)`);
        continue;
      }
      ok(`${path} → 404`);
    } catch (e) {
      bad(`${path} → fetch failed: ${String(e).slice(0, 60)}`);
    }
  }

  console.log("\nDynamic route handlers must answer 404 too:");
  for (const path of MUST_404_RAW) {
    try {
      const r = await probe(path);
      if (r.status === 404) ok(`${path} → 404`);
      else bad(`${path} → ${r.status} (expected 404)`);
    } catch (e) {
      bad(`${path} → fetch failed: ${String(e).slice(0, 60)}`);
    }
  }

  console.log("\n404 pages must not advertise themselves as the homepage:");
  for (const path of MUST_404.slice(0, 8)) {
    try {
      const r = await probe(path);
      if (r.status !== 404) continue; // already reported above
      if (r.title === HOMEPAGE_TITLE) bad(`${path} inherits the homepage <title>`);
      else if (!r.title) bad(`${path} has no <title>`);
      else if (!r.robots.length) bad(`${path} → "${r.title}" but no robots directive`);
      else if (r.robots.some((v) => !v.includes("noindex")))
        bad(`${path} → "${r.title}" but robots says ${r.robots.filter((v) => !v.includes("noindex")).join(" / ")}`);
      else ok(`${path} → "${r.title}" (${r.robots.join(" / ")})`);
    } catch {
      /* reported above */
    }
  }

  console.log("\nReal pages must still be 200:");
  for (const path of MUST_200) {
    try {
      const r = await probe(path);
      if (r.status === 200) ok(`${path} → 200`);
      else bad(`${path} → ${r.status} (expected 200 — over-404ing)`);
    } catch (e) {
      bad(`${path} → fetch failed: ${String(e).slice(0, 60)}`);
    }
  }

  console.log(`\n${failures === 0 ? "\x1b[32mAll status checks passed.\x1b[0m" : `\x1b[31m${failures} status check(s) FAILED.\x1b[0m`}\n`);
  if (failures) process.exit(1);
}

void main();
