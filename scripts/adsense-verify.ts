/**
 * scripts/adsense-verify.ts — the Phase 5 integration gate, as a results table.
 *
 *   npx tsx scripts/adsense-verify.ts https://riftcompare.com
 *   npx tsx scripts/adsense-verify.ts http://localhost:3111 --md
 *
 * RAW HTTP ONLY. No headless browser, no JS execution — that is the point. If a
 * check here passes, a crawler that reads HTML without rendering it (which is
 * how ownership verification and ads.txt discovery actually work) sees the same
 * thing. Every URL is fetched cold and cookie-less.
 *
 * Pass `--md` to emit a markdown table for docs/adsense-remediation.md.
 */
// This file has no imports, so the marker below is what makes TypeScript treat
// it as a module. Without it every top-level name here would land in the global
// scope and collide with the other scripts (tsconfig includes **/*.ts, and
// `next build` typechecks the whole project).
export {};
const BASE = (process.argv[2] ?? "https://riftcompare.com").replace(/\/$/, "");
const AS_MARKDOWN = process.argv.includes("--md");

const CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? "ca-pub-6842128782879909";
const PUB_ID = CLIENT_ID.replace(/^ca-/, "");
const STALE_ID = "6262011577596407";

// One URL per template, so a fault confined to a single route family can't hide.
// Override with ADSENSE_VERIFY_PATHS="/a,/b,…" when slugs differ per environment.
const DEFAULT_PATHS: [string, string][] = [
  ["/", "home"],
  ["/browse", "browse / index"],
  ["/card/jinx-loose-cannon-ogn-251", "card (priced)"],
  ["/sets", "set index"],
  ["/domains/fury", "domain facet"],
  ["/cards/rarity/rare", "rarity facet"],
  ["/guides", "guides hub"],
  ["/blog", "blog hub"],
  ["/about", "static / policy"],
  ["/market", "tool"],
  ["/marketplace", "marketplace"],
  ["/decks", "decks"],
];
const PATHS: [string, string][] = process.env.ADSENSE_VERIFY_PATHS
  ? process.env.ADSENSE_VERIFY_PATHS.split(",").map((p) => [p.trim(), p.trim()] as [string, string])
  : DEFAULT_PATHS;

type Row = { url: string; template: string; status: string; loader: string; meta: string; stale: string; consentOrder: string };
const rows: Row[] = [];
let failures = 0;

const YES = "✅";
const NO = "❌";

async function checkPage(path: string, template: string) {
  const row: Row = { url: path, template, status: "—", loader: NO, meta: NO, stale: NO, consentOrder: NO };
  try {
    const res = await fetch(`${BASE}${path}`, {
      redirect: "follow",
      headers: {
        // A plain HTML client. Deliberately NOT a browser UA string — we want
        // the same bytes an unrendered crawler fetch would get.
        accept: "text/html",
        "user-agent": "Mozilla/5.0 (compatible; RiftCompare-AdSenseVerify/1.0)",
      },
    });
    const html = await res.text();
    row.status = String(res.status);
    if (res.status !== 200) failures++;

    const loaderTag = `pagead/js/adsbygoogle.js?client=${CLIENT_ID}`;
    const hasLoader = html.includes(loaderTag) && /<script[^>]+pagead2\.googlesyndication\.com/.test(html);
    row.loader = hasLoader ? YES : NO;
    if (!hasLoader) failures++;

    const hasMeta = new RegExp(`<meta name="google-adsense-account" content="${CLIENT_ID}"`).test(html);
    row.meta = hasMeta ? YES : NO;
    if (!hasMeta) failures++;

    const hasStale = html.includes(STALE_ID);
    row.stale = hasStale ? `${NO} PRESENT` : YES;
    if (hasStale) failures++;

    // Consent Mode defaults must be PRESENT on every page. Their byte position
    // relative to the loader is reported but NOT failed on: React hoists every
    // `<script async src>` into the head preamble and there is no supported way
    // to opt out (onError and itemProp are both stripped when the resource is
    // re-emitted — measured, not assumed). The inline defaults still execute
    // tens of milliseconds first, because parsing a few more KB of an
    // already-buffered head beats opening a fresh cross-origin connection.
    // See docs/adsense-remediation.md § Phase 4.
    const consentPos = html.indexOf("ad_personalization");
    const loaderPos = html.indexOf(loaderTag);
    if (consentPos < 0) {
      row.consentOrder = `${NO} ABSENT`;
      failures++;
    } else {
      row.consentOrder = consentPos < loaderPos ? `${YES} before` : `${YES} present (after)`;
    }
  } catch (e) {
    row.status = `ERR ${String(e).slice(0, 40)}`;
    failures++;
  }
  rows.push(row);
}

async function checkAdsTxt() {
  const out: string[] = [];
  try {
    const direct = await fetch(`${BASE}/ads.txt`, { redirect: "manual" });
    out.push(`status ${direct.status}${direct.status === 200 ? " (no redirect)" : " ← EXPECTED 200"}`);
    if (direct.status !== 200) failures++;

    const ct = direct.headers.get("content-type") ?? "(none)";
    out.push(`content-type ${ct}`);
    if (!ct.includes("text/plain")) failures++;

    const cc = direct.headers.get("cache-control") ?? "(none)";
    out.push(`cache-control ${cc}`);

    const body = await direct.text();
    const expected = `google.com, ${PUB_ID}, DIRECT, f08c47fec0942fa0\n`;
    const exact = body === expected;
    out.push(exact ? "body exact match" : `body MISMATCH: ${JSON.stringify(body.slice(0, 120))}`);
    if (!exact) failures++;
    if (/[<>]/.test(body)) {
      out.push("body contains markup — still serving the HTML shell");
      failures++;
    }
  } catch (e) {
    out.push(`fetch failed: ${e}`);
    failures++;
  }
  return out;
}

async function checkRobots() {
  const out: string[] = [];
  try {
    const res = await fetch(`${BASE}/robots.txt`);
    const body = await res.text();
    out.push(`status ${res.status}`);
    if (res.status !== 200) failures++;

    for (const bot of ["Mediapartners-Google", "AdsBot-Google", "AdsBot-Google-Mobile"]) {
      // A bot is blocked only if it has its OWN group ending in Disallow: /
      const group = new RegExp(`User-agent:\\s*${bot}\\b[\\s\\S]*?(?=User-agent:|$)`, "i").exec(body);
      const blocked = group ? /^\s*Disallow:\s*\/\s*$/m.test(group[0]) : false;
      out.push(`${bot}: ${blocked ? `${NO} DISALLOWED` : `${YES} permitted`}`);
      if (blocked) failures++;
    }
    // Next writes "User-Agent:" (capital A); the spec is case-insensitive.
    const wildcard = /User-agent:\s*\*/i.test(body);
    out.push(`wildcard group present: ${wildcard ? YES : NO}`);
    if (!wildcard) failures++;
  } catch (e) {
    out.push(`fetch failed: ${e}`);
    failures++;
  }
  return out;
}

async function checkCsp() {
  const out: string[] = [];
  const REQUIRED = [
    "pagead2.googlesyndication.com",
    "googleads.g.doubleclick.net",
    "tpc.googlesyndication.com",
    "ep1.adtrafficquality.google",
    "ep2.adtrafficquality.google",
    "fundingchoicesmessages.google.com",
  ];
  try {
    const res = await fetch(`${BASE}/`);
    const enforcing = res.headers.get("content-security-policy");
    const reportOnly = res.headers.get("content-security-policy-report-only");
    out.push(`enforcing CSP: ${enforcing ? "present" : "none (nothing can be blocked)"}`);
    out.push(`report-only CSP: ${reportOnly ? "present" : "none"}`);
    const policy = `${enforcing ?? ""} ${reportOnly ?? ""}`;
    for (const origin of REQUIRED) {
      const listed = policy.includes(origin);
      out.push(`${origin}: ${listed ? `${YES} allow-listed` : enforcing ? `${NO} MISSING from enforcing policy` : "— (not listed, but nothing is enforced)"}`);
      if (!listed && enforcing) failures++;
    }
  } catch (e) {
    out.push(`fetch failed: ${e}`);
    failures++;
  }
  return out;
}

async function main() {
  console.log(`\nAdSense integration verification — ${BASE}`);
  console.log(`Expecting client id ${CLIENT_ID} / seller id ${PUB_ID}\n`);

  for (const [path, template] of PATHS) await checkPage(path, template);

  const w = (s: string, n: number) => s.padEnd(n).slice(0, n);
  if (AS_MARKDOWN) {
    console.log("| URL | Template | Status | Loader + correct id | Ownership meta | No stale id | Consent Mode defaults |");
    console.log("| --- | --- | --- | --- | --- | --- | --- |");
    for (const r of rows) {
      console.log(`| \`${r.url}\` | ${r.template} | ${r.status} | ${r.loader} | ${r.meta} | ${r.stale} | ${r.consentOrder} |`);
    }
  } else {
    console.log(`${w("URL", 42)}${w("STATUS", 8)}${w("LOADER", 8)}${w("META", 8)}${w("NO-STALE", 10)}CONSENT DEFAULTS`);
    console.log("─".repeat(96));
    for (const r of rows) {
      console.log(`${w(r.url, 42)}${w(r.status, 8)}${w(r.loader, 8)}${w(r.meta, 8)}${w(r.stale, 10)}${r.consentOrder}`);
    }
  }

  for (const [title, fn] of [["/ads.txt", checkAdsTxt], ["/robots.txt", checkRobots], ["CSP headers", checkCsp]] as const) {
    console.log(`\n${title}`);
    for (const line of await fn()) console.log(`  · ${line}`);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  if (failures) process.exit(1);
}

void main();
