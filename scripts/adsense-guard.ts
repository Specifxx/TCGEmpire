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
    r === "scripts/adsense-guard.ts" ||
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
const wrongIdHits = ALL_FILES.filter((p) => !rel(p).startsWith("docs/") && rel(p) !== "scripts/adsense-guard.ts")
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
    totals?: {
      indexableThin?: number;
      indexableEmptyCards?: number;
      duplicateClusters?: number;
      softFourOhFours?: number;
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
  const budgets: [string, number | undefined, string][] = [
    ["indexable pages under 150 unique editorial words", t.indexableThin, "Thin content"],
    ["indexable card pages with no price data", t.indexableEmptyCards, "Low-value content"],
    ["near-duplicate clusters above 90% similarity", t.duplicateClusters, "Scaled content abuse"],
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
    if (value === 0) ok(`0 ${label}`);
    else fail(`${value} ${label}  [${policy}]`);
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
