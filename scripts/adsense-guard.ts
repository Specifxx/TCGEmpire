/**
 * scripts/adsense-guard.ts — the regression fence around the AdSense integration.
 *
 *   npm run adsense:guard          # static checks only (no network, no DB)
 *   npm run adsense:guard -- --url https://riftcompare.com   # + live HTTP checks
 *
 * Every check here exists because its absence cost a real AdSense review:
 *
 *   1. PUBLISHER-ID HYGIENE — no `ca-pub-` literal anywhere in the source tree.
 *      The site shipped a hardcoded ca-pub-6262011577596407 in the root layout
 *      while a completely different account was under review. One literal, two
 *      rejections. The env var is the only place an id may live.
 *   2. LOADER INTEGRITY — the loader is rendered from the env var, ungated, in
 *      <head> on every page; the review-mode flag never touches it.
 *   3. CSP COMPLETENESS — every Google ad/consent origin is still allow-listed.
 *   4. ROBOTS SAFETY — Mediapartners-Google and AdsBot-Google are never
 *      disallowed, and no `Disallow: /` can reach them.
 *   5. ADS.TXT — served as plain text, derived from the same env var.
 *   6. CONTENT ASSERTIONS (Phase 16) — thin/empty/duplicate/soft-404 budgets
 *      from the audit, so the content remediation can't silently regress.
 *
 * Exit code 1 on any failure, so it can gate CI and `npm run build`.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { execSync } from "node:child_process";
import { STATIC_PAGE_DATES } from "../src/lib/static-page-dates";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const urlArg = args.indexOf("--url");
const BASE_URL = urlArg >= 0 ? args[urlArg + 1]?.replace(/\/$/, "") : null;

let failures = 0;
let checks = 0;

function ok(msg: string) {
  checks++;
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}
function fail(msg: string, detail?: string) {
  checks++;
  failures++;
  console.log(`  \x1b[31m✗ ${msg}\x1b[0m`);
  if (detail) console.log(detail.split("\n").map((l) => `      ${l}`).join("\n"));
}
function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}
/** Informational only — never counts as a check and never fails the build. */
function note(msg: string) {
  console.log(`    \x1b[33m·\x1b[0m ${msg}`);
}

// ── file walking ─────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "out", "build", "dist", ".vercel",
  "android", "ios", "Pods",
]);
const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".css",
  ".html", ".yml", ".yaml", ".txt", ".sh", ".xml",
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (TEXT_EXT.has(extname(name)) || name.startsWith(".env")) out.push(full);
  }
  return out;
}

const ALL_FILES = walk(ROOT);
const read = (p: string) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};
const rel = (p: string) => relative(ROOT, p);

// ─────────────────────────────────────────────────────────────────────────────
// 1. PUBLISHER-ID HYGIENE
// ─────────────────────────────────────────────────────────────────────────────
section("1. Publisher-ID hygiene");

// A ca-pub- literal is legitimate ONLY in env definitions (where the single
// source of truth is declared) and in prose that documents the incident.
const ID_LITERAL_ALLOWED = (p: string) => {
  const r = rel(p);
  return (
    r.startsWith(".env") ||
    r.startsWith("docs/") ||
    // The verification and audit tools compare the SERVED id against an
    // expected one, so they necessarily name it. Same category as this file.
    r === "scripts/adsense-guard.ts" ||
    r === "scripts/adsense-verify.ts" ||
    r === "README.md"
  );
};

// Matches an actual id — the "ca-pub-" prefix followed by real digits — so
// prose describing the FORMAT ("ca-pub- plus 16 digits") and the validating
// regex itself (/^ca-pub-\d{16}$/, where \d is not a digit character) stay
// legal. `ca-app-pub-` is AdMob: the native app's ad UNIT ids, a different
// product in a different id namespace, excluded by the negative lookbehind.
const CA_PUB = /(?<!ca-app-)ca-pub-\d{6,}/g;

const offenders: string[] = [];
for (const file of ALL_FILES) {
  if (ID_LITERAL_ALLOWED(file)) continue;
  const body = read(file);
  const hits = body.match(CA_PUB);
  if (!hits) continue;
  body.split("\n").forEach((line, i) => {
    if (CA_PUB.test(line)) offenders.push(`${rel(file)}:${i + 1}  ${line.trim().slice(0, 120)}`);
    CA_PUB.lastIndex = 0;
  });
}
if (offenders.length) {
  fail(
    `${offenders.length} hardcoded ca-pub- literal(s) outside the env files`,
    offenders.join("\n") +
      "\n\nUse ADSENSE_CLIENT_ID from src/lib/adsense.ts. The id belongs in\n" +
      "NEXT_PUBLIC_ADSENSE_CLIENT_ID and nowhere else.",
  );
} else {
  ok("no ca-pub- literal in the source tree (env files excepted)");
}

// The wrong id must never come back, in ANY form — including in docs prose,
// where it is quoted deliberately, so this check is scoped to code + env.
const WRONG_ID = "6262011577596407";
const wrongIdHits = ALL_FILES.filter(
  (p) => !rel(p).startsWith("docs/") && !["scripts/adsense-guard.ts", "scripts/adsense-verify.ts"].includes(rel(p)),
)
  .filter((p) => read(p).includes(WRONG_ID))
  .map(rel);
if (wrongIdHits.length) {
  fail(`the wrong publisher id ${WRONG_ID} is still referenced`, wrongIdHits.join("\n"));
} else {
  ok(`the previously-shipped wrong id (…${WRONG_ID.slice(-6)}) appears nowhere in code`);
}

// The env var itself must be declared and well-formed.
const envExample = read(join(ROOT, ".env.example"));
const declared = /NEXT_PUBLIC_ADSENSE_CLIENT_ID="?(ca-pub-\d{16})"?/.exec(envExample);
if (declared) ok(`.env.example declares NEXT_PUBLIC_ADSENSE_CLIENT_ID=${declared[1]}`);
else fail(".env.example does not declare a well-formed NEXT_PUBLIC_ADSENSE_CLIENT_ID");

// ─────────────────────────────────────────────────────────────────────────────
// 1b. DEPENDENCY RESOLVABILITY
// ─────────────────────────────────────────────────────────────────────────────
// A type-level import of a package that isn't in package.json fails the
// PRODUCTION BUILD, not just the local run: `next build` typechecks the whole
// project (tsconfig includes **/*.ts), so one script referencing a
// developer-machine-only package takes the whole deploy down with
// "Cannot find module 'x' or its corresponding type declarations".
//
// That happened once, on scripts/mobile-check.ts and playwright-core, and cost a
// deploy. Optional tooling must be imported through a non-literal specifier (see
// that file's header); anything imported by name has to be declared.
section("1b. Dependency resolvability");

const pkg = JSON.parse(read(join(ROOT, "package.json")) || "{}") as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const declaredDeps = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);

// Bare specifiers only: skip node: builtins, the @/ path alias, and relative paths.
const IMPORT_RE = /(?:^|\n)\s*import\s+(?:type\s+)?[^;'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\(["']([^"']+)["']\)\.[A-Za-z]/g;
const NODE_BUILTINS = new Set([
  "fs", "path", "url", "crypto", "http", "https", "os", "util", "stream", "zlib",
  "child_process", "assert", "events", "buffer", "querystring", "readline", "timers",
]);
const packageOf = (spec: string) =>
  spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];

const undeclared = new Set<string>();
const undeclaredWhere: string[] = [];
for (const file of ALL_FILES) {
  const r = rel(file);
  if (!/^(src|scripts|prisma|tests)\//.test(r) || !/\.(ts|tsx)$/.test(r)) continue;
  const body = read(file);
  for (const m of body.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec) continue;
    if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("node:")) continue;
    const name = packageOf(spec);
    if (NODE_BUILTINS.has(name) || declaredDeps.has(name)) continue;
    // An optional import suppressed with @ts-expect-error / @ts-ignore is the
    // OTHER legitimate way to do this — the compiler is told not to resolve it,
    // so it can't break the build. scripts/fetch-official-images.ts does this
    // with playwright. Only an UNSUPPRESSED bare import is a deploy risk.
    const preceding = body.slice(Math.max(0, m.index - 200), m.index);
    if (/@ts-(expect-error|ignore)/.test(preceding)) continue;
    if (!undeclared.has(name)) {
      undeclared.add(name);
      undeclaredWhere.push(`${name}  (${r})`);
    }
  }
}
if (undeclared.size) {
  fail(
    `${undeclared.size} package(s) imported by name but not in package.json`,
    undeclaredWhere.join("\n") +
      "\n\nEither add it to dependencies/devDependencies, or — for optional\n" +
      "developer-machine tooling — import it through a non-literal specifier and\n" +
      "type it structurally, as scripts/mobile-check.ts does with playwright-core.",
  );
} else {
  ok("every named import resolves to a declared dependency (a deploy-breaking class of error)");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1c. SOFT-404 FENCE
// ─────────────────────────────────────────────────────────────────────────────
// A loading.tsx wraps its whole segment subtree in a Suspense boundary, which
// makes Next STREAM the response: the shell flushes with a committed HTTP 200
// before the page component runs. A notFound() thrown after that can only swap
// the UI, never the status.
//
// With one at the app root, EVERY unknown /card/…, /sets/…, /decks/… URL
// returned "200 OK" with the 404 page rendered inside it — an unlimited supply
// of crawlable soft-404s, which Google treats as a site-quality problem.
// Measured, not assumed: moving notFound() into generateMetadata does NOT help
// while such a boundary exists above it.
//
// So: no loading.tsx at the app root, and none in a segment that has a
// notFound()-calling descendant. Scoped boundaries on leaf routes are fine and
// are what the site uses.
section("1c. Soft-404 fence");

const APP_DIR = join(ROOT, "src/app");
const loadingFiles = ALL_FILES.filter((p) => /src\/app\/(.*\/)?loading\.tsx$/.test(rel(p)));

if (loadingFiles.some((p) => rel(p) === "src/app/loading.tsx")) {
  fail(
    "src/app/loading.tsx exists — it turns every notFound() into a soft 404",
    "Move it into the leaf segments that need it (see src/app/sealed/loading.tsx).",
  );
} else {
  ok("no root loading.tsx (notFound() can set a real 404 status)");
}

// A loading.tsx in a segment with a notFound()-calling descendant is the same
// bug, one level down.
const notFoundPages = ALL_FILES.filter(
  (p) => /src\/app\/.*\/page\.tsx$/.test(rel(p)) && read(p).includes("notFound()"),
).map((p) => rel(p).replace(/^src\/app\//, "").replace(/\/page\.tsx$/, ""));

const unsafeBoundaries: string[] = [];
for (const lf of loadingFiles) {
  const seg = rel(lf).replace(/^src\/app\//, "").replace(/\/?loading\.tsx$/, "");
  const covered = notFoundPages.filter((np) => seg === "" || np === seg || np.startsWith(`${seg}/`));
  if (covered.length) unsafeBoundaries.push(`${rel(lf)} covers ${covered.slice(0, 3).join(", ")}`);
}
if (unsafeBoundaries.length) {
  fail("a loading.tsx sits above a notFound()-calling route", unsafeBoundaries.join("\n"));
} else {
  ok(`${loadingFiles.length} scoped loading.tsx boundaries, none above a notFound() route`);
}

// ── The SAME boundary, the OTHER failure: an empty server render ─────────────
// A loading.tsx above a page that reads searchParams is a second, quieter bug,
// and it is the one an AdSense reviewer actually sees. The boundary lets the
// shell flush immediately; a searchParams-reading page can't be prerendered per
// URL variant, so the FIRST request for any query string the cache hasn't seen
// returns the spinner as the COMPLETE, FINAL response — no JS execution needed
// to reproduce it, just `curl`. /browse served a one-word "Loading…" body to
// every raw fetch; /market and /sealed did the same on any cold ?param.
//
// Measured, not theorised: scripts/crawl-check.ts reported these as
// emptyServerRender, and the same crawl reported 0 after the boundaries were
// removed. The routes that keep a loading.tsx (/singles, /movers, /portfolio)
// don't read searchParams, so they have no per-URL variant to miss.
const searchParamPages = ALL_FILES.filter(
  (p) => /src\/app\/.*\/page\.tsx$/.test(rel(p)) && /\bsearchParams\b/.test(read(p)),
).map((p) => rel(p).replace(/^src\/app\//, "").replace(/\/page\.tsx$/, ""));

const emptyRenderRisk: string[] = [];
for (const lf of loadingFiles) {
  const seg = rel(lf).replace(/^src\/app\//, "").replace(/\/?loading\.tsx$/, "");
  const covered = searchParamPages.filter((sp) => seg === "" || sp === seg || sp.startsWith(`${seg}/`));
  if (covered.length) emptyRenderRisk.push(`${rel(lf)} covers ${covered.slice(0, 3).join(", ")}`);
}
if (emptyRenderRisk.length) {
  fail(
    "a loading.tsx sits above a searchParams-reading route — its server HTML can be an empty spinner",
    emptyRenderRisk.join("\n") +
      "\n\nDelete that loading.tsx (and set `export const dynamic = \"force-dynamic\"` on the page,\n" +
      "which such a route already is per-request). Verify with:\n" +
      "  npx tsx scripts/crawl-check.ts --url http://localhost:3111   → emptyServerRender must be 0",
  );
} else {
  ok("no loading.tsx above a searchParams-reading route (no empty-spinner server HTML)");
}

// ── 1d. Policy "last updated" drift ─────────────────────────────────────────
// /terms gained a whole moderation section while still telling readers it had
// not changed since 12 June — seven weeks stale, on a page whose own "Changes to
// this policy" clause promises that date reflects material changes. /privacy did
// the same after the Meta Pixel disclosure landed. Nothing catches that by
// reading the diff, so the build checks it: edit a policy page, bump its date in
// lib/static-page-dates.ts, or the build tells you which one you forgot.
section("1d. Policy date drift");

// Diff size, since the declared date, above which a policy edit is treated as
// material. The real case was +195/-8; plumbing a date through an import is ~4.
const MATERIAL_CHURN_LINES = 25;

const POLICY_PAGES: [route: string, file: string][] = [
  ["/privacy", "src/app/privacy/page.tsx"],
  ["/terms", "src/app/terms/page.tsx"],
  ["/marketplace/terms", "src/app/marketplace/terms/page.tsx"],
  ["/editorial-policy", "src/app/editorial-policy/page.tsx"],
  ["/returns", "src/app/returns/page.tsx"],
];

// Every page must read its date from the shared table — a reintroduced
// `const UPDATED = "…"` is the drift, not just a symptom of it.
const hardcoded = POLICY_PAGES.filter(([, f]) => /const UPDATED\s*=\s*"/.test(read(join(ROOT, f))));
if (hardcoded.length) {
  fail(
    "a policy page hardcodes its own 'last updated' date",
    `${hardcoded.map(([, f]) => f).join(", ")}\nUse staticPageDateLabel("<route>") so the visible line and the sitemap lastmod stay one value.`,
  );
} else {
  ok(`${POLICY_PAGES.length} policy pages read their date from lib/static-page-dates.ts`);
}

// Now the real check: was the page committed after the date it claims?
//
// ── Why this is SKIPPED on a shallow clone ──────────────────────────────────
// It is not safe there, and finding that out cost a deploy. In a shallow clone
// the oldest fetched commit is a graft that appears to introduce the entire
// tree, so `git log -1 -- <file>` returns THAT commit for any file not touched
// within the fetched depth — with the whole file counted as its diff.
//
// Concretely: /returns has exactly one commit in real history (2026-07-29) and
// declares 2026-07-29, which is correct. On Vercel it was reported as "changed
// 272 lines since (last 2026-08-01)" — the graft's date and the file's entire
// length — and failed the build.
//
// A first attempt excluded HEAD, on the theory that --depth=1 was the only
// ambiguous case. The graft is not necessarily HEAD, so that missed it.
// Excluding the boundary commits instead would work, but the check would then
// be silently partial on exactly the runs that matter least (a deploy does not
// need to police a date; a human's commit does). So: full history or nothing.
// Locally and in any CI with real history this is strict; on Vercel it says so
// and moves on. It can never break a deploy again.
function git(args: string): string | null {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

const shallowRepo = git("rev-parse --is-shallow-repository") === "true";
if (git("rev-parse --git-dir") == null || shallowRepo) {
  note(
    shallowRepo
      ? "policy dates vs git history: skipped (shallow clone — a graft commit would look like it rewrote every file). Enforced locally and in CI, where history is complete."
      : "policy dates vs git history: skipped (not a git checkout)",
  );
} else {
  const stale: string[] = [];
  let compared = 0;

  for (const [route, file] of POLICY_PAGES) {
    const declared = STATIC_PAGE_DATES[route];
    if (!declared) {
      stale.push(`${route} has no entry in static-page-dates.ts`);
      continue;
    }
    const committed = git(`log -1 --format=%as -- ${file}`);
    if (!committed) continue;
    compared++;
    if (committed <= declared) continue;

    // The page changed after the date it claims — but "changed" is not the same
    // as "materially changed", and this check has to tell them apart or it fires
    // on every refactor and gets switched off. The proxy is size: summing the
    // diff since the declared date, moving where a string is imported from is a
    // handful of lines, while the change that caused this (a whole "User content
    // & moderation" section appearing on /terms) was +195/-8.
    //
    // A heuristic, deliberately. It cannot judge whether a 3-line edit changed a
    // reader's rights, so a small edit is reported and not failed; a large one
    // is a hard stop that someone has to look at.
    // `--since=<day>` is inclusive of that whole day, which would count the very
    // commit that SET the date and make every correctly-dated page look stale
    // (/editorial-policy read as "210 lines changed since 2026-08-01" when those
    // 210 lines WERE the 2026-08-01 edit). Start the window at the end of the
    // declared day so only genuinely later commits count.
    const numstat = git(`log --format= --numstat --since=${declared}T23:59:59 -- ${file}`) ?? "";
    const churn = numstat
      .split("\n")
      .filter(Boolean)
      .reduce((n, line) => {
        const [add, del] = line.split(/\s+/);
        return n + (Number(add) || 0) + (Number(del) || 0);
      }, 0);

    if (churn > MATERIAL_CHURN_LINES) {
      stale.push(`${route} says ${declared} but ${file} changed ${churn} lines since (last ${committed})`);
    } else {
      note(`${route}: ${churn} lines changed since ${declared} — bump it if that was material`);
    }
  }

  if (stale.length) {
    fail(
      "a policy page changed after the date it tells readers it last changed",
      `${stale.join("\n")}\nBump the route in lib/static-page-dates.ts in the same commit as the edit.`,
    );
  } else {
    ok(`${compared}/${POLICY_PAGES.length} policy dates verified at or after their last commit`);
  }
}
void APP_DIR;

// ─────────────────────────────────────────────────────────────────────────────
// 2. LOADER INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────
section("2. Loader integrity");

const layout = read(join(ROOT, "src/app/layout.tsx"));
const loader = read(join(ROOT, "src/components/AdSenseLoader.tsx"));
const adsenseLib = read(join(ROOT, "src/lib/adsense.ts"));

if (layout.includes("<AdSenseLoader />")) ok("root layout renders <AdSenseLoader /> (every page)");
else fail("root layout does not render <AdSenseLoader /> — no page would carry the loader");

if (/<AdSenseLoader\s*\/>/.test(layout) && !/\{[^}]*REVIEW_MODE[^}]*&&\s*<AdSenseLoader/.test(layout)) {
  ok("the loader is not gated behind review mode or any ads-enabled flag");
} else {
  fail("the loader appears to be conditionally rendered — it must be unconditional");
}

if (loader.includes("pagead2.googlesyndication.com") || adsenseLib.includes("pagead2.googlesyndication.com")) {
  ok("loader points at pagead2.googlesyndication.com");
} else {
  fail("loader src is not the pagead2 adsbygoogle.js endpoint");
}

if (/crossOrigin=["']anonymous["']/.test(loader)) ok('loader carries crossorigin="anonymous"');
else fail('loader is missing crossorigin="anonymous"');

if (layout.includes('name="google-adsense-account"') && layout.includes("ADSENSE_CLIENT_ID")) {
  ok("ownership meta tag renders from the env var");
} else {
  fail("ownership meta tag missing, or not sourced from ADSENSE_CLIENT_ID");
}

if (/ADSENSE_PUB_ID\s*=\s*ADSENSE_CLIENT_ID\.replace/.test(adsenseLib)) {
  ok("ads.txt seller id is derived from the client id (cannot drift)");
} else {
  fail("ADSENSE_PUB_ID is not derived from ADSENSE_CLIENT_ID");
}

if (/if \(IS_PRODUCTION\) throw new Error\(MISCONFIGURED\)/.test(adsenseLib)) {
  ok("production builds assert the client id matches /^ca-pub-\\d{16}$/");
} else {
  fail("the production startup assertion on the client id is missing");
}

// Auto ads and manual units must be mutually exclusive.
if (/AD_UNITS_ENABLED\s*=[\s\S]{0,200}AD_STRATEGY === "manual"/.test(adsenseLib)) {
  ok("manual ad units are impossible under AD_STRATEGY=auto (no double density)");
} else {
  fail("AD_UNITS_ENABLED does not exclude the auto strategy");
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CSP COMPLETENESS
// ─────────────────────────────────────────────────────────────────────────────
section("3. CSP / connectivity");

const nextConfig = read(join(ROOT, "next.config.js"));
const REQUIRED_ORIGINS = [
  "https://pagead2.googlesyndication.com",
  "https://googleads.g.doubleclick.net",
  "https://tpc.googlesyndication.com",
  "https://ep1.adtrafficquality.google",
  "https://ep2.adtrafficquality.google",
  "https://fundingchoicesmessages.google.com",
];
const missingOrigins = REQUIRED_ORIGINS.filter((o) => !nextConfig.includes(o));
if (missingOrigins.length) {
  fail("next.config.js CSP is missing Google ad/consent origins", missingOrigins.join("\n"));
} else {
  ok(`all ${REQUIRED_ORIGINS.length} Google ad/consent origins are allow-listed in the CSP`);
}

// A wrong ENFORCING policy is the failure mode that silently kills ads. If one
// is ever introduced, it must carry the origins above — which the check already
// covers — but flag the transition so it's a conscious decision.
if (/key:\s*"Content-Security-Policy"/.test(nextConfig.replace(/\/embed[\s\S]*?\],/, ""))) {
  console.log("    \x1b[33m·\x1b[0m note: an enforcing CSP now exists outside /embed — re-verify ad delivery");
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ROBOTS SAFETY
// ─────────────────────────────────────────────────────────────────────────────
section("4. Crawler access");

const robots = read(join(ROOT, "src/app/robots.ts"));
const AD_CRAWLERS = ["Mediapartners-Google", "AdsBot-Google"];
const blockedCrawler = AD_CRAWLERS.filter((c) => {
  const i = robots.indexOf(c);
  if (i < 0) return false; // not mentioned at all ⇒ covered by the permissive `*`
  // Mentioned: make sure it isn't inside a disallow-everything rule.
  return /disallow:\s*"\/"/i.test(robots.slice(Math.max(0, i - 400), i + 400));
});
if (blockedCrawler.length) {
  fail("an AdSense crawler is disallowed in robots.ts", blockedCrawler.join(", "));
} else {
  ok("Mediapartners-Google and AdsBot-Google are not disallowed");
}

if (/userAgent:\s*"\*"/.test(robots) && /allow:\s*\[\s*"\/"/.test(robots)) {
  ok("robots.ts keeps a permissive default rule for all user agents");
} else {
  fail("robots.ts no longer has a permissive default `*` rule");
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ADS.TXT
// ─────────────────────────────────────────────────────────────────────────────
section("5. ads.txt");

const adsTxtRoute = join(ROOT, "src/app/ads.txt/route.ts");
if (existsSync(adsTxtRoute)) {
  const body = read(adsTxtRoute);
  if (body.includes("text/plain; charset=utf-8")) ok("ads.txt route sets text/plain; charset=utf-8");
  else fail("ads.txt route does not set a text/plain content type");
  if (body.includes("ADSENSE_PUB_ID")) ok("ads.txt seller id comes from the shared env-derived constant");
  else fail("ads.txt does not derive its seller id from ADSENSE_PUB_ID");
  if (body.includes("f08c47fec0942fa0")) ok("ads.txt carries Google's certification-authority id");
  else fail("ads.txt is missing Google's certification-authority id");
} else {
  fail("src/app/ads.txt/route.ts does not exist — /ads.txt would serve the HTML shell");
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. CONTENT ASSERTIONS (populated by scripts/adsense-audit.ts)
// ─────────────────────────────────────────────────────────────────────────────
section("6. Content budgets");

const auditPath = join(ROOT, "docs/adsense-audit.json");
if (!existsSync(auditPath)) {
  console.log("    \x1b[33m·\x1b[0m docs/adsense-audit.json not present — run `npm run adsense:audit` (needs DB access). Skipping.");
} else {
  type Audit = {
    generatedAt?: string;
    totals?: {
      indexableThin?: number;
      indexableEmptyCards?: number;
      duplicateClusters?: number;
      softFourOhFours?: number;
      emptyServerRender?: number;
      brokenInternalLinks?: number;
      paywalledIndexable?: number;
      affiliateWithoutEditorial?: number;
    };
  };
  let audit: Audit = {};
  try {
    audit = JSON.parse(read(auditPath)) as Audit;
  } catch {
    fail("docs/adsense-audit.json is not valid JSON");
  }
  const t = audit.totals ?? {};

  // ── Is this snapshot still evidence? ────────────────────────────────────────
  // Everything below is read from a COMMITTED artefact. Regenerating it needs a
  // running server and DB access (`npm run adsense:audit`), so the build cannot
  // do it — which meant the guard would happily print "0 soft-404s", "0 thin
  // affiliate templates", "37/37 passed" from a file measured nine days and
  // twelve thousand changed lines ago. Those ticks describe whatever the site
  // looked like when someone last ran the audit, and nothing said so.
  //
  // Deliberately NOT a fail(). A failing build here could not be fixed by the
  // person who hit it — the fix needs a deployment to crawl — and the last time
  // a date check hard-stopped this build it took a Vercel deploy down with it
  // (see 1d). Staleness instead DEMOTES the budgets: they print as observations
  // rather than passes, so the guard stops vouching for numbers it cannot stand
  // behind. Green becomes something you have to earn by re-running the audit.
  //
  // Age is measured against the wall clock, not git, on purpose: Vercel builds a
  // SHALLOW clone where the graft makes every file look like it landed at the
  // same commit, so `git log -1 -- <artefact>` is meaningless exactly where this
  // most needs to work. A timestamp inside the file works everywhere.
  const STALE_AFTER_DAYS = 14;
  const generatedAt = audit.generatedAt ? Date.parse(audit.generatedAt) : NaN;
  const ageDays = Number.isNaN(generatedAt) ? null : (Date.now() - generatedAt) / 86_400_000;
  const stale = ageDays == null || ageDays > STALE_AFTER_DAYS;
  if (ageDays == null) {
    note(
      "content budgets: snapshot has no generatedAt — cannot tell how old it is, so the totals below " +
        "are reported, not asserted. Re-run `npm run adsense:audit` (and `npm run crawl:check`) to restore them as checks.",
    );
  } else if (stale) {
    note(
      `content budgets: snapshot is ${Math.floor(ageDays)} days old (>${STALE_AFTER_DAYS}) — the totals below are ` +
        "reported, not asserted. Re-run `npm run adsense:audit` and `npm run crawl:check` against a deployment.",
    );
  }

  // Report a budget WITHOUT claiming it passed. A stale 0 is not evidence of 0.
  const observe = (label: string, value: number) =>
    console.log(`    \x1b[33m·\x1b[0m ${value} ${label} \x1b[2m(from a stale snapshot — not verified)\x1b[0m`);

  // Navigation health comes from the crawl report (scripts/crawl-check.ts).
  const crawlPath = join(ROOT, "docs/crawl-report.json");
  if (existsSync(crawlPath)) {
    try {
      const crawl = JSON.parse(read(crawlPath)) as { totals?: Record<string, number> };
      const ct = crawl.totals ?? {};
      const merged: Record<string, number | undefined> = t as Record<string, number | undefined>;
      merged.brokenInternalLinks ??= ct.broken;
      merged.softFourOhFours ??= ct.softFourOhFours;
      for (const [label, key, policy] of [
        ["redirect chains longer than one hop", "redirectChains", "Site navigation"],
        ["pages more than 4 clicks from the homepage", "tooDeep", "Site navigation"],
        ["sitemap URLs with no inbound internal link", "sitemapOrphans", "Site navigation"],
        ["indexable pages with a duplicate title", "duplicateTitles", "Duplicate content"],
        ["indexable pages with a duplicate description", "duplicateDescriptions", "Duplicate content"],
        ["indexable pages without exactly one h1", "wrongH1Count", "Site quality"],
        ["indexable pages without a self-referencing canonical", "missingCanonical", "Duplicate content"],
        ["indexable pages without BreadcrumbList markup", "missingBreadcrumbs", "Site navigation"],
      ] as const) {
        const v = ct[key];
        if (v == null) continue;
        if (v > 0) fail(`${v} ${label}  [${policy}]`);
        else if (stale) observe(label, v);
        else ok(`0 ${label}`);
      }
    } catch {
      fail("docs/crawl-report.json is not valid JSON");
    }
  } else {
    console.log("    \x1b[33m·\x1b[0m docs/crawl-report.json not present — run `npm run crawl:check`. Skipping.");
  }

  // BUILT AFTER the crawl-report merge above, not before it. These tuples capture
  // t.<field> BY VALUE, so while this array was declared first, the two
  // `merged.<field> ??= ct.<field>` lines mutated `t` too late to be seen — and
  // "broken internal links" reported "not measured in this audit run" even with
  // docs/crawl-report.json sitting there carrying the number.
  const budgets: [string, number | undefined, string][] = [
    ["indexable pages under 150 unique editorial words", t.indexableThin, "Thin content"],
    ["indexable card pages with no price data", t.indexableEmptyCards, "Low-value content"],
    ["near-duplicate clusters above 90% similarity", t.duplicateClusters, "Scaled content abuse"],
    ["pages whose server HTML contains no content at all", t.emptyServerRender, "No content / low value content"],
    ["soft-404s", t.softFourOhFours, "Site navigation / broken pages"],
    ["broken internal links", t.brokenInternalLinks, "Site navigation"],
    ["indexable pages behind a paywall or blur", t.paywalledIndexable, "Behind a login / no content"],
    ["templates with affiliate links but <150 editorial words", t.affiliateWithoutEditorial, "Thin affiliate"],
  ];

  for (const [label, value, policy] of budgets) {
    if (value == null) {
      console.log(`    \x1b[33m·\x1b[0m ${label}: not measured in this audit run`);
      continue;
    }
    // A non-zero total is a real finding whatever its age — a page that was thin
    // when it was measured does not become fine because the measurement aged.
    if (value > 0) fail(`${value} ${label}  [${policy}]`);
    else if (stale) observe(label, value);
    else ok(`0 ${label}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. LIVE HTTP CHECKS (opt-in, --url)
// ─────────────────────────────────────────────────────────────────────────────
async function liveChecks(base: string) {
  section(`7. Live HTTP checks against ${base}`);

  const expectedClient = declared?.[1] ?? "";
  const expectedPub = expectedClient.replace(/^ca-/, "");

  // ads.txt
  try {
    const res = await fetch(`${base}/ads.txt`, { redirect: "manual" });
    const text = await res.text();
    if (res.status === 200) ok("/ads.txt returns 200 with no redirect");
    else fail(`/ads.txt returned ${res.status} (expected 200, no redirect)`);
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/plain")) ok(`/ads.txt content-type is ${ct}`);
    else fail(`/ads.txt content-type is "${ct}" (expected text/plain)`);
    const expectedBody = `google.com, ${expectedPub}, DIRECT, f08c47fec0942fa0\n`;
    if (text === expectedBody) ok("/ads.txt body matches byte-for-byte");
    else fail("/ads.txt body mismatch", `expected: ${JSON.stringify(expectedBody)}\ngot:      ${JSON.stringify(text.slice(0, 200))}`);
  } catch (e) {
    fail("/ads.txt fetch failed", String(e));
  }

  // robots.txt
  try {
    const res = await fetch(`${base}/robots.txt`);
    const text = await res.text();
    if (res.status === 200) ok("/robots.txt returns 200");
    else fail(`/robots.txt returned ${res.status}`);
    const bad = AD_CRAWLERS.filter((c) => new RegExp(`User-agent:\\s*${c}[\\s\\S]{0,200}?Disallow:\\s*/\\s*$`, "im").test(text));
    if (bad.length) fail("robots.txt disallows an AdSense crawler", bad.join(", "));
    else ok("robots.txt does not disallow Mediapartners-Google or AdsBot-Google");
  } catch (e) {
    fail("/robots.txt fetch failed", String(e));
  }

  // Representative URLs across every template.
  const paths = (process.env.ADSENSE_GUARD_PATHS ?? "/").split(",").map((p) => p.trim()).filter(Boolean);
  for (const p of paths) {
    try {
      const res = await fetch(`${base}${p}`, { headers: { "user-agent": "Mozilla/5.0 (compatible; adsense-guard)" } });
      const html = await res.text();
      const hasLoader = html.includes(`pagead/js/adsbygoogle.js?client=${expectedClient}`);
      const hasMeta = html.includes(`name="google-adsense-account" content="${expectedClient}"`);
      const hasWrongId = html.includes(WRONG_ID);
      if (res.status !== 200) fail(`${p} returned ${res.status}`);
      else if (!hasLoader) fail(`${p}: loader script absent from server-rendered HTML`);
      else if (!hasMeta) fail(`${p}: google-adsense-account meta tag absent or wrong`);
      else if (hasWrongId) fail(`${p}: serves the WRONG publisher id`);
      else ok(`${p}: loader + meta present, correct id, no stale id`);
    } catch (e) {
      fail(`${p} fetch failed`, String(e));
    }
  }
}

async function main() {
  if (BASE_URL) await liveChecks(BASE_URL);

  console.log(
    `\n${failures === 0 ? "\x1b[32m" : "\x1b[31m"}${checks - failures}/${checks} checks passed\x1b[0m`,
  );
  if (failures) {
    console.log("\x1b[31mAdSense guard FAILED — see above.\x1b[0m\n");
    process.exit(1);
  }
  console.log("AdSense guard passed.\n");
}

void main();
