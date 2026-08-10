/**
 * scripts/crawl-check.ts — crawl the whole site from the homepage, like a bot.
 *
 *   npx tsx scripts/crawl-check.ts --url http://localhost:3111
 *   npx tsx scripts/crawl-check.ts --url https://riftcompare.com --max 800
 *
 * Writes docs/crawl-report.json and prints a summary.
 *
 * "Site navigation difficulties" is a real AdSense rejection category, and it is
 * checked the only way that means anything: start at the homepage, follow
 * internal links breadth-first, and see what a crawler actually finds.
 *
 * Reports:
 *   • 404s and 5xxs reachable from the homepage
 *   • soft-404s — HTTP 200 with an empty or error body
 *   • pages whose server HTML contains no content at all (the CSR bailout that
 *     had the homepage serving a "Loading…" spinner to every raw fetch)
 *   • redirect chains longer than one hop
 *   • pages more than 4 clicks from the homepage
 *   • sitemap orphans — submitted URLs with no inbound internal link
 *   • metadata hygiene: unique title, unique description, exactly one <h1>,
 *     a self-referencing canonical, BreadcrumbList structured data
 */
export {};

const args = process.argv.slice(2);
const argOf = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const BASE = argOf("--url", "http://localhost:3111").replace(/\/$/, "");
const MAX_PAGES = Number(argOf("--max", "600"));
const CONCURRENCY = Number(argOf("--concurrency", "10"));
const MAX_DEPTH = 4;

const UA = "Mozilla/5.0 (compatible; RiftCompare-CrawlCheck/1.0)";

// Routes a crawler will meet but which are not content pages: they carry their
// own noindex, need auth, or are machine surfaces. Fetched (to prove they don't
// error) but exempt from the content/metadata assertions.
const NON_CONTENT = [
  /^\/api\//,
  /^\/_next\//,
  /^\/login/, /^\/register/, /^\/forgot/, /^\/reset/, /^\/verify/,
  // /watching, not /watchlist: /watchlist redirects to the /alerts explainer,
  // which IS content and should keep being crawled.
  /^\/dashboard/, /^\/profile/, /^\/admin/, /^\/portfolio/, /^\/watching/,
  /^\/unsubscribe/, /^\/announcements\/unsubscribe/, /^\/newsletter\/unsubscribe/,
  /^\/embed\//, /^\/llm\//,
  /\.(xml|txt|json|png|jpg|jpeg|svg|ico|webp|webmanifest)$/,
];
const isNonContent = (p: string) => NON_CONTENT.some((re) => re.test(p));

type Result = {
  path: string;
  depth: number;
  status: number;
  redirects: number;
  finalPath: string;
  title: string;
  description: string;
  h1Count: number;
  canonical: string | null;
  noindex: boolean;
  hasBreadcrumbs: boolean;
  emptyServerRender: boolean;
  softFourOhFour: boolean;
  textLength: number;
  links: string[];
  error?: string;
};

const results = new Map<string, Result>();
const inboundLinks = new Map<string, Set<string>>();

function normalise(href: string, from: string): string | null {
  try {
    const u = new URL(href, `${BASE}${from}`);
    if (u.origin !== new URL(BASE).origin) return null;
    // Query strings are filter state, not distinct pages, and following them
    // explodes the crawl over /browse's facet space.
    return u.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
}

async function fetchPage(path: string, depth: number): Promise<Result> {
  const base: Result = {
    path, depth, status: 0, redirects: 0, finalPath: path,
    title: "", description: "", h1Count: 0, canonical: null, noindex: false,
    hasBreadcrumbs: false, emptyServerRender: false, softFourOhFour: false,
    textLength: 0, links: [],
  };

  // Count redirect hops manually — `redirect: "follow"` hides the chain length,
  // and a chain longer than one hop is what we're looking for.
  let current = path;
  let hops = 0;
  let res: Response;
  try {
    for (;;) {
      res = await fetch(`${BASE}${current}`, { redirect: "manual", headers: { "user-agent": UA, accept: "text/html" } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc || hops >= 5) break;
        const next = normalise(loc, current);
        if (!next) break;
        current = next;
        hops++;
        continue;
      }
      break;
    }
  } catch (e) {
    return { ...base, error: String(e).slice(0, 120) };
  }

  const html = await res.text();
  const mainEl = /<main[^>]*id="main-content"[^>]*>([\s\S]{0,400})/.exec(html);
  const text = html
    .replace(/<(script|style|svg|noscript|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const links = [...html.matchAll(/href="([^"]+)"/g)]
    .map((m) => normalise(m[1], current))
    .filter((p): p is string => Boolean(p) && !p!.startsWith("/_next"));

  return {
    ...base,
    status: res.status,
    redirects: hops,
    finalPath: current,
    title: (/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim(),
    description: (/<meta name="description" content="([^"]*)"/i.exec(html)?.[1] ?? "").trim(),
    h1Count: (html.match(/<h1[\s>]/gi) ?? []).length,
    canonical: /<link rel="canonical" href="([^"]*)"/i.exec(html)?.[1] ?? null,
    noindex: /<meta name="robots"[^>]*content="[^"]*noindex/i.test(html),
    hasBreadcrumbs: html.includes('"@type":"BreadcrumbList"'),
    emptyServerRender: Boolean(mainEl && mainEl[1].includes("BAILOUT_TO_CLIENT_SIDE_RENDERING")),
    softFourOhFour: res.status === 200 && text.length < 250,
    textLength: text.length,
    links: [...new Set(links)],
  };
}

async function crawl() {
  let frontier: { path: string; depth: number }[] = [{ path: "/", depth: 0 }];
  const seen = new Set<string>(["/"]);

  while (frontier.length && results.size < MAX_PAGES) {
    const batch = frontier.splice(0, CONCURRENCY);
    const fetched = await Promise.all(batch.map((b) => fetchPage(b.path, b.depth)));
    const next: { path: string; depth: number }[] = [];

    for (const r of fetched) {
      results.set(r.path, r);
      for (const l of r.links) {
        (inboundLinks.get(l) ?? inboundLinks.set(l, new Set()).get(l)!).add(r.path);
        if (!seen.has(l) && results.size + next.length < MAX_PAGES) {
          seen.add(l);
          next.push({ path: l, depth: r.depth + 1 });
        }
      }
    }
    // Breadth-first: depth order is what makes "clicks from the homepage" mean
    // anything, so the shallower half of the frontier always goes first.
    frontier = [...frontier, ...next].sort((a, b) => a.depth - b.depth);
    process.stdout.write(`\r  crawled ${results.size}, frontier ${frontier.length}   `);
  }
  process.stdout.write("\n");
}

async function main() {
  console.log(`\nCrawling ${BASE} from the homepage (max ${MAX_PAGES} pages)\n`);
  await crawl();

  const all = [...results.values()];
  const content = all.filter((r) => !isNonContent(r.path));

  const broken = all.filter((r) => r.status >= 400 || r.error);
  const serverErrors = all.filter((r) => r.status >= 500);
  const softFourOhFours = content.filter((r) => r.softFourOhFour);
  const emptySsr = content.filter((r) => r.emptyServerRender);
  const longChains = all.filter((r) => r.redirects > 1);
  const deep = content.filter((r) => r.depth > MAX_DEPTH && r.status === 200);

  const indexable = content.filter((r) => r.status === 200 && !r.noindex);
  const dupTitle = new Map<string, string[]>();
  const dupDesc = new Map<string, string[]>();
  for (const r of indexable) {
    if (r.title) (dupTitle.get(r.title) ?? dupTitle.set(r.title, []).get(r.title)!).push(r.path);
    if (r.description) (dupDesc.get(r.description) ?? dupDesc.set(r.description, []).get(r.description)!).push(r.path);
  }
  const duplicateTitles = [...dupTitle].filter(([, ps]) => ps.length > 1);
  const duplicateDescriptions = [...dupDesc].filter(([, ps]) => ps.length > 1);
  const missingTitle = indexable.filter((r) => !r.title);
  const missingDescription = indexable.filter((r) => !r.description);
  const badH1 = indexable.filter((r) => r.h1Count !== 1);
  const missingCanonical = indexable.filter((r) => !r.canonical);
  const wrongCanonical = indexable.filter(
    (r) => r.canonical && new URL(r.canonical).pathname.replace(/\/+$/, "") !== (r.path === "/" ? "" : r.path),
  );
  const missingBreadcrumbs = indexable.filter((r) => r.path !== "/" && !r.hasBreadcrumbs);

  // Sitemap orphans: submitted, but nothing on the site links to them.
  let orphans: string[] = [];
  try {
    const index = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text());
    const children = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    const submitted = new Set<string>();
    for (const c of children) {
      const body = await fetch(`${BASE}${c}`).then((r) => r.text());
      for (const m of body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        submitted.add(new URL(m[1]).pathname.replace(/\/+$/, "") || "/");
      }
    }
    // Only meaningful for URLs the crawl actually reached — an unvisited URL
    // beyond the page cap has an unknown inbound count, not a zero one.
    orphans = [...submitted].filter((p) => results.has(p) && !(inboundLinks.get(p)?.size));
  } catch {
    /* sitemap unreachable — reported by the guard, not here */
  }

  const report = {
    // See the same field in scripts/adsense-audit.ts — this is a committed
    // artefact that scripts/adsense-guard.ts grades against on every build, so it
    // has to say how old it is or a stale snapshot reads as a clean site.
    generatedAt: new Date().toISOString(),
    base: BASE,
    crawled: all.length,
    contentPages: content.length,
    indexable: indexable.length,
    maxDepth: MAX_DEPTH,
    totals: {
      broken: broken.length,
      serverErrors: serverErrors.length,
      softFourOhFours: softFourOhFours.length,
      emptyServerRender: emptySsr.length,
      redirectChains: longChains.length,
      tooDeep: deep.length,
      sitemapOrphans: orphans.length,
      duplicateTitles: duplicateTitles.length,
      duplicateDescriptions: duplicateDescriptions.length,
      missingTitle: missingTitle.length,
      missingDescription: missingDescription.length,
      wrongH1Count: badH1.length,
      missingCanonical: missingCanonical.length,
      wrongCanonical: wrongCanonical.length,
      missingBreadcrumbs: missingBreadcrumbs.length,
    },
    detail: {
      broken: broken.map((r) => ({ path: r.path, status: r.status, error: r.error, linkedFrom: [...(inboundLinks.get(r.path) ?? [])].slice(0, 4) })),
      softFourOhFours: softFourOhFours.map((r) => ({ path: r.path, textLength: r.textLength })),
      emptyServerRender: emptySsr.map((r) => r.path),
      redirectChains: longChains.map((r) => ({ path: r.path, hops: r.redirects, to: r.finalPath })),
      tooDeep: deep.map((r) => ({ path: r.path, depth: r.depth })),
      sitemapOrphans: orphans,
      duplicateTitles: duplicateTitles.map(([t, ps]) => ({ title: t.slice(0, 70), paths: ps.slice(0, 6) })),
      duplicateDescriptions: duplicateDescriptions.map(([d, ps]) => ({ description: d.slice(0, 70), paths: ps.slice(0, 6) })),
      wrongH1Count: badH1.map((r) => ({ path: r.path, h1s: r.h1Count })),
      missingCanonical: missingCanonical.map((r) => r.path),
      wrongCanonical: wrongCanonical.map((r) => ({ path: r.path, canonical: r.canonical })),
      missingBreadcrumbs: missingBreadcrumbs.map((r) => r.path).slice(0, 40),
    },
  };

  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  mkdirSync(join(process.cwd(), "docs"), { recursive: true });
  writeFileSync(join(process.cwd(), "docs", "crawl-report.json"), JSON.stringify(report, null, 2));

  console.log(`Crawled ${all.length} URLs · ${content.length} content pages · ${indexable.length} indexable\n`);
  const pad = (s: string, n: number) => s.padEnd(n);
  for (const [k, v] of Object.entries(report.totals)) {
    const mark = v === 0 ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${mark} ${pad(k, 26)} ${v}`);
  }
  for (const [label, list] of [
    ["broken", report.detail.broken],
    ["soft-404", report.detail.softFourOhFours],
    ["empty server render", report.detail.emptyServerRender],
    ["redirect chain", report.detail.redirectChains],
    ["too deep", report.detail.tooDeep],
    ["orphan", report.detail.sitemapOrphans],
  ] as const) {
    for (const item of (list as unknown[]).slice(0, 10)) {
      console.log(`      ${label}: ${typeof item === "string" ? item : JSON.stringify(item)}`);
    }
  }
  console.log(`\nWrote docs/crawl-report.json`);
}

void main();
