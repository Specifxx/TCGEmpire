/**
 * WHICH CARD PAGES HAS GOOGLE ACTUALLY INDEXED?
 *
 * READ-ONLY. Talks to Search Console and to the public sitemap. Never touches
 * either database, never writes anything but a report.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `gsc-coverage.yml` reports pages that earned IMPRESSIONS, and that is the
 * number everything has been reasoned from. Measured 2026-09-17: 994 of the
 * 1,425 card URLs in cards.xml earned an impression in 28 days. The other ~431
 * carry no noindex (`audit-indexability.ts` says 99.0% of the catalogue is
 * indexable) and sit in the sitemap, so "no impressions" could mean any of four
 * completely different things:
 *
 *   URL is unknown to Google          → never discovered      → links, sitemap
 *   Discovered – currently not indexed → known, never fetched  → links, crawl budget
 *   Crawled – currently not indexed    → fetched, judged thin  → on-page differentiation
 *   Submitted and indexed, 0 impressions → indexed, unsearched → nothing. It is fine.
 *
 * The remedies are mutually exclusive and three of the four are expensive. Only
 * URL Inspection distinguishes them, so this runs BEFORE any work aimed at the
 * backlog rather than after it. If the answer is mostly the fourth row, the
 * honest conclusion is that those pages are healthy and nobody searches for
 * "Production Surge", and the session's effort belongs on the 994 pages that DO
 * earn impressions at a 0.41% click-through rate.
 *
 * ── QUOTA, WHICH IS THE REASON THIS IS NOT ON A DAILY SCHEDULE ──────────────
 * URL Inspection is 2,000 queries per DAY and 600 per MINUTE, PER SITE
 * (developers.google.com/webmaster-tools/limits). There is no batch endpoint and
 * no pagination: one HTTP request per URL. 1,425 card URLs is 71% of the daily
 * allowance, and the allowance is shared with a human opening the URL Inspection
 * tool in the Search Console UI. Burning it at 09:00 leaves the property
 * uninspectable, by anyone, until the quota resets.
 *
 * ── THE ENDPOINT IS NOT THE ONE NEXT DOOR ───────────────────────────────────
 * URL Inspection lives on the v1 path, NOT the v3 one:
 *     POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
 * while `gsc-coverage.yml`'s searchAnalytics helper hardcodes
 * `/webmasters/v3/sites/${site}/...`. Copying that shape here returns 404, which
 * is the single most likely way to get this wrong. tests/gsc-url-inspect.test.ts
 * pins the constant for that reason.
 *
 * A 403 here does NOT mean the key is broken: URL Inspection requires the
 * service account to be an owner or a FULL user on the property, while
 * searchAnalytics is happy with Restricted. If searchAnalytics works and this
 * 403s, the account was downgraded — that is what the error message says.
 *
 * Usage:
 *   npx tsx scripts/gsc-url-inspect.ts [--limit N] [--section cards]
 *
 * Run in CI via .github/workflows/maintenance.yml (task: index-coverage), which
 * runs audit-indexability.ts FIRST — if the cross-database join is broken that
 * day, cards.xml is built from the wrong set of URLs and every number here is
 * measuring the wrong thing.
 */

const INSPECT_ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

/** Per-site ceilings, straight from Google's published limits. */
const QUOTA_PER_DAY = 2000;
const QUOTA_PER_MINUTE = 600;
/** Leave headroom under both: the quota is per SITE, and a person opening the
 *  Search Console UI draws on the same bucket. */
const PER_MINUTE = 550;
const MAX_INSPECTIONS = 1400;
const CONCURRENCY = 5;

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const b64 = (b: string | Buffer) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/**
 * A signed JWT, re-minted before it expires.
 *
 * Google's tokens last an hour. A 1,425-URL run at 550/minute is under three
 * minutes in the happy case, but a run that backs off through several 429s can
 * outlive one token, and the failure would look like a sudden wall of 401s
 * two-thirds of the way through. Cheaper to re-mint than to diagnose.
 */
function tokenSource(sa: ServiceAccount) {
  let cached: { value: string; expiresAt: number } | null = null;
  return async function token(): Promise<string> {
    const crypto = await import("node:crypto");
    if (cached && Date.now() < cached.expiresAt - 60_000) return cached.value;
    const now = Math.floor(Date.now() / 1000);
    const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64(
      JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_ENDPOINT, iat: now, exp: now + 3600 })
    );
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    const jwt = `${header}.${claims}.${b64(signer.sign(sa.private_key))}`;
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    });
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new Error(`auth failed: ${JSON.stringify(json)}`);
    cached = { value: json.access_token, expiresAt: Date.now() + 3600_000 };
    return cached.value;
  };
}

/** A token bucket, so the per-minute ceiling is respected rather than hoped for. */
function rateLimiter(perMinute: number) {
  const gapMs = 60_000 / perMinute;
  let next = 0;
  return async function wait(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + gapMs;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  };
}

export interface InspectionRow {
  url: string;
  verdict: string;
  coverageState: string;
  robotsTxtState: string;
  indexingState: string;
  pageFetchState: string;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  referringUrls: number;
  inSitemaps: number;
}

async function fetchSitemapUrls(origin: string, section: string): Promise<string[]> {
  const res = await fetch(`${origin}/sitemaps/${section}.xml`);
  if (!res.ok) throw new Error(`sitemap ${section}.xml: HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function inspectOne(
  token: () => Promise<string>,
  siteUrl: string,
  inspectionUrl: string
): Promise<InspectionRow> {
  const blank: InspectionRow = {
    url: inspectionUrl,
    verdict: "(inspection failed)",
    coverageState: "(inspection failed)",
    robotsTxtState: "",
    indexingState: "",
    pageFetchState: "",
    lastCrawlTime: null,
    googleCanonical: null,
    userCanonical: null,
    referringUrls: 0,
    inSitemaps: 0,
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const at = await token();
    const res = await fetch(INSPECT_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionUrl, siteUrl, languageCode: "en-US" }),
    });
    if (res.status === 429) {
      // Back off, but never more than twice. Retrying into a per-DAY ceiling is
      // how a property becomes uninspectable for everyone until midnight.
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    if (res.status === 403) {
      throw new Error(
        "403 from URL Inspection. This is almost certainly a PERMISSION level, not a bad key: " +
          "URL Inspection needs the service account to be an owner or a Full user on the property, " +
          "while searchAnalytics (gsc-coverage.yml) works with Restricted. Check the property's Users " +
          "and permissions page before regenerating anything."
      );
    }
    if (!res.ok) return blank;
    const json = (await res.json()) as {
      inspectionResult?: {
        indexStatusResult?: Record<string, unknown>;
      };
    };
    const r = json.inspectionResult?.indexStatusResult ?? {};
    return {
      url: inspectionUrl,
      verdict: String(r.verdict ?? ""),
      coverageState: String(r.coverageState ?? ""),
      robotsTxtState: String(r.robotsTxtState ?? ""),
      indexingState: String(r.indexingState ?? ""),
      pageFetchState: String(r.pageFetchState ?? ""),
      lastCrawlTime: (r.lastCrawlTime as string) ?? null,
      googleCanonical: (r.googleCanonical as string) ?? null,
      userCanonical: (r.userCanonical as string) ?? null,
      referringUrls: Array.isArray(r.referringUrls) ? r.referringUrls.length : 0,
      inSitemaps: Array.isArray(r.sitemap) ? r.sitemap.length : 0,
    };
  }
  return { ...blank, verdict: "(quota exhausted)", coverageState: "(quota exhausted)" };
}

function histogram(rows: InspectionRow[], key: keyof InspectionRow): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = String(r[key] ?? "") || "(empty)";
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

async function main() {
  const key = process.env.GSC_SA_KEY;
  const property = process.env.GSC_PROPERTY || "https://riftcompare.com/";
  if (!key) {
    console.log("No GSC_SA_KEY set — nothing to inspect. Skipping.");
    return;
  }
  const sa = JSON.parse(key) as ServiceAccount;
  const token = tokenSource(sa);
  const section = arg("section") ?? "cards";
  const limit = Math.min(parseInt(arg("limit") ?? String(MAX_INSPECTIONS), 10) || MAX_INSPECTIONS, MAX_INSPECTIONS);

  // The inspectionUrl must sit UNDER siteUrl, so the sitemap's own origin is the
  // only safe one to read from — a www/apex mismatch here is a silent 400.
  const origin = property.replace(/\/+$/, "");
  const all = await fetchSitemapUrls(origin, section);
  const urls = all.slice(0, limit);

  const out: string[] = [];
  const line = (s = "") => {
    out.push(s);
    console.log(s);
  };

  line(`### URL Inspection — ${section}.xml (${property})`);
  line("");
  line(`- ${all.length.toLocaleString()} URLs in the sitemap; inspecting ${urls.length.toLocaleString()}.`);
  line(`- Quota: ${QUOTA_PER_DAY}/day and ${QUOTA_PER_MINUTE}/min per site; this run is capped at ${PER_MINUTE}/min.`);
  if (urls.length < all.length) line(`- **Truncated** by --limit. Re-run tomorrow for the rest; do not raise the cap.`);

  const wait = rateLimiter(PER_MINUTE);
  const rows: InspectionRow[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= urls.length) return;
        await wait();
        rows.push(await inspectOne(token, property, urls[i]));
      }
    })
  );

  const table = (title: string, pairs: [string, number][]) => {
    line("");
    line(`**${title}**`);
    line("");
    line("| value | pages |");
    line("|---|---:|");
    for (const [k, n] of pairs) line(`| ${k} | ${n.toLocaleString()} |`);
  };

  table("coverageState — the table that decides what to do next", histogram(rows, "coverageState"));
  table("verdict", histogram(rows, "verdict"));

  // EXPECTED ZERO. cards.xml already excludes both noindex populations
  // (getEmptyCardIds + getDuplicateCardIds in lib/sitemap-sections.ts), so a
  // non-zero here is the sitemap contradicting the pages — a bug in this repo,
  // not a finding about Google.
  const blocked = rows.filter((r) => r.indexingState && r.indexingState !== "INDEXING_ALLOWED");
  line("");
  line(`**Submitted but blocked from indexing: ${blocked.length}** (expected 0 — a non-zero is our bug, not Google's)`);
  for (const r of blocked.slice(0, 10)) line(`- ${r.url} — ${r.indexingState}`);

  // Google choosing a different canonical is the near-duplicate failure mode,
  // measured rather than assumed. Four printings of one card share a name.
  const reCanonical = rows.filter(
    (r) => r.googleCanonical && r.userCanonical && r.googleCanonical !== r.userCanonical
  );
  line("");
  line(`**Google picked a different canonical: ${reCanonical.length}**`);
  for (const r of reCanonical.slice(0, 15)) line(`- ${r.url}\n  → ${r.googleCanonical}`);

  // Google's own answer to "does this page have an inbound internal link".
  const orphans = rows.filter((r) => r.referringUrls === 0);
  line("");
  line(`**No referring URLs known to Google: ${orphans.length}**`);
  for (const r of orphans.slice(0, 15)) line(`- ${r.url}`);

  const never = rows.filter((r) => !r.lastCrawlTime);
  line("");
  line(`**Never crawled: ${never.length}**`);
  for (const r of never.slice(0, 15)) line(`- ${r.url}`);

  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    "docs/index-coverage.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), property, section, total: all.length, rows }, null, 2)
  );
  line("");
  line("Wrote docs/index-coverage.json");

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out.join("\n")}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
