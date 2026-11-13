import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { largestPaintElement, lighthouseLanding, sitemapProblem } from "../src/lib/deploy-gate";
import { JOBS } from "../src/lib/ops/checks";
import { SITE_URL } from "../src/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// The after-deploy gate checks the site, not Vercel's sign-in page (2026-11-13;
// DECISIONS.md "The after-deploy gate was checking Vercel's sign-in page").
//
// seo-preview-gate.yml used to check a Production deployment at the deployment's
// own address. That address is behind Vercel's sign-in, so the template SEO check
// read a login page as a sitemap with no URLs, skipped every template and passed,
// and the Lighthouse step timed the login page: 9 to 12 seconds to its largest
// paint on six deploys, read as the home page getting slower. Nothing failed, so
// nothing said so. This file pins the three things that changed:
//   1. production is checked at the public address, and a manual run checks it too;
//   2. "the address showed us nothing" is a failure in both scripts, never a pass;
//   3. the crawl of every page stays off production, and a failed gate reaches
//      the ops monitor.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const WORKFLOW = ".github/workflows/seo-preview-gate.yml";
const wf = read(WORKFLOW);
/** One step of the workflow, from its name to the next step. */
const step = (name: string): string => {
  const at = wf.indexOf(`      - name: ${name}\n`);
  assert.ok(at >= 0, `the workflow has a step named "${name}"`);
  const next = wf.indexOf("\n      - name: ", at + 1);
  return wf.slice(at, next < 0 ? undefined : next);
};

/** What Vercel answers on a deployment's own address once the redirect to vercel.com is followed. */
const LOGIN_PAGE =
  '<!DOCTYPE html><html lang="en"><head><title>Login – Vercel</title></head><body><h1 class="text-heading-32">Log in to Vercel</h1></body></html>';
const DEPLOYMENT = "https://riftcompare-abc123xyz-some-team.vercel.app";
const SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${SITE_URL}/sitemaps/core.xml</loc></sitemap></sitemapindex>`;

test("a sign-in page is not a sitemap: every way an address can show the gate nothing has its own words", () => {
  assert.equal(sitemapProblem({ base: SITE_URL, finalUrl: `${SITE_URL}/sitemap.xml`, status: 200, body: SITEMAP_INDEX }), null, "the site's own sitemap index is fine");

  // The case that was live: the deployment's address redirects to vercel.com, which answers 200 with its login page.
  const walled = sitemapProblem({ base: DEPLOYMENT, finalUrl: "https://vercel.com/login?next=%2Fsso-api%3Furl%3D", status: 200, body: LOGIN_PAGE });
  assert.match(walled ?? "", /sent the request to vercel\.com/);
  assert.match(walled ?? "", /sign-in wall/);

  // The same page served on the host that was asked (a wall that does not redirect) is still not a sitemap.
  const html = sitemapProblem({ base: SITE_URL, finalUrl: `${SITE_URL}/sitemap.xml`, status: 200, body: LOGIN_PAGE });
  assert.match(html ?? "", /lists no pages/);
  assert.match(html ?? "", /Login – Vercel/, "and the message quotes what it was given");

  assert.match(sitemapProblem({ base: SITE_URL, finalUrl: `${SITE_URL}/sitemap.xml`, status: 401, body: "" }) ?? "", /answered HTTP 401/);
  assert.match(sitemapProblem({ base: SITE_URL, finalUrl: `${SITE_URL}/sitemap.xml`, status: 200, body: "<urlset></urlset>" }) ?? "", /lists no pages/);
  assert.match(sitemapProblem({ base: SITE_URL, finalUrl: `${SITE_URL}/sitemap.xml`, status: 200, body: "<urlset><url><loc> </loc></url></urlset>" }) ?? "", /lists no pages/, "an empty <loc> is not a page");
});

test("a Lighthouse run that ended on another host measured that host, and no address is not a pass", () => {
  assert.deepEqual(lighthouseLanding(`${SITE_URL}/`, { finalDisplayedUrl: `${SITE_URL}/` }), { url: `${SITE_URL}/`, sameHost: true });
  assert.equal(lighthouseLanding("http://localhost:3000/", { finalUrl: "http://localhost:3000/" }).sameHost, true, "an older Lighthouse names it finalUrl");
  assert.equal(lighthouseLanding(`${SITE_URL}/card/x`, { mainDocumentUrl: `${SITE_URL}/card/x` }).sameHost, true);

  const walled = lighthouseLanding(`${DEPLOYMENT}/`, { finalDisplayedUrl: "https://vercel.com/login?next=%2Fsso-api" });
  assert.equal(walled.sameHost, false);
  assert.equal(walled.url, "https://vercel.com/login?next=%2Fsso-api", "the log can say where it ended");

  assert.equal(lighthouseLanding(`${SITE_URL}/`, {}).sameHost, false);
  assert.equal(lighthouseLanding("not an address", { finalDisplayedUrl: "also not one" }).sameHost, false);
  assert.equal(lighthouseLanding("http://localhost:3000/", { finalDisplayedUrl: "http://localhost:3111/" }).sameHost, false, "another port is another server");
});

test("the largest paint's element is read from whichever audit this Lighthouse has", () => {
  // Lighthouse 13: a node beside the breakdown table, inside the "LCP breakdown" insight.
  const v13 = {
    audits: {
      "lcp-breakdown-insight": {
        details: {
          type: "list",
          items: [
            { type: "table", items: [{ subpart: "timeToFirstByte", duration: 90 }] },
            { type: "node", selector: "h1 > span.rb-flame-text", snippet: '<span class="rb-flame-text rb-flame-live">', nodeLabel: "Riftbound" },
          ],
        },
      },
    },
  };
  assert.deepEqual(largestPaintElement(v13), { snippet: '<span class="rb-flame-text rb-flame-live">', text: "Riftbound" });

  // Before the insights: an audit of its own, the node inside a table row. This is the login page as the gate saw it.
  const older = {
    audits: {
      "largest-contentful-paint-element": {
        details: { type: "list", items: [{ type: "table", items: [{ node: { type: "node", snippet: '<h1 class="text-heading-32">', nodeLabel: "Log in to   Vercel" } }] }] },
      },
    },
  };
  assert.deepEqual(largestPaintElement(older), { snippet: '<h1 class="text-heading-32">', text: "Log in to Vercel" });

  assert.equal(largestPaintElement({}), null);
  assert.equal(largestPaintElement({ audits: { "lcp-breakdown-insight": { details: { type: "list", items: [] } } } }), null);
});

test("a production deploy is checked at the public address, never at the deployment's own", () => {
  const address = wf.match(/^  PRODUCTION_URL: (\S+)$/m);
  assert.ok(address, "the workflow names the public site once, in its env");
  assert.equal(address[1], SITE_URL, "and it is the site's canonical origin (src/lib/site.ts)");

  const resolve = step("Resolve the address to check");
  assert.match(resolve, /\[ "\$ENVIRONMENT" = "Production" \]; then\n\s+URL="\$PRODUCTION_URL"\n\s+else\n\s+URL="\$\{ENVIRONMENT_URL:-\$TARGET_URL\}"/, "production takes the public address; only another environment takes the deployment's");
  assert.match(resolve, /\[ "\$EVENT" = "workflow_dispatch" \] \|\|/, "and a manual run checks production too");
  assert.match(wf, /^  workflow_dispatch:$/m);
  assert.match(wf, /github\.event_name == 'workflow_dispatch' \|\|/);

  // The deployment's address is read in ONE place, as an environment value of that step: no script has it pasted in.
  const jobs = wf.slice(wf.indexOf("\njobs:"));
  const uses = jobs.split("\n").filter((l) => !l.trim().startsWith("#") && /deployment_status\.(environment_url|target_url)/.test(l));
  assert.deepEqual(
    uses.map((l) => l.trim()),
    ["ENVIRONMENT_URL: ${{ github.event.deployment_status.environment_url }}", "TARGET_URL: ${{ github.event.deployment_status.target_url }}"],
  );

  for (const name of ["Template SEO check", "Lighthouse performance budget"]) {
    const s = step(name);
    assert.match(s, /URL: \$\{\{ steps\.target\.outputs\.url \}\}/, `${name} is given the resolved address`);
    assert.match(s, /--url "\$URL"/, name);
  }
});

test("the crawl of every page never runs against production; the Lighthouse browser cannot fail the gate", () => {
  // content-quality.ts loads every sitemap URL and then every link on them. Minutes after a release emptied the page
  // cache, that is a prewarm of the whole site, which the cost rules forbid (CLAUDE.md, "Deploys are gated").
  assert.match(step("Content quality report"), /^\s+if: github\.event\.deployment\.environment == 'Preview'$/m);
  assert.match(step("Upload content-quality-report.csv"), /^\s+if: always\(\) && github\.event\.deployment\.environment == 'Preview'$/m);
  assert.match(read("scripts/content-quality.ts"), /const MAX_PAGES = Number\(argOf\("--max", "5000"\)\)/, "the crawl is still the whole sitemap: if this becomes a small sample, re-argue the rule above");

  // 2026-11-11: apt could not resolve its mirror while installing Chromium and turned the gate red. The browser only
  // serves the report-only Lighthouse step, so it is report-only too.
  assert.match(step("Install Chromium for Lighthouse"), /^\s+continue-on-error: true$/m);
  // The template check is the gate: nothing may make it report-only or conditional.
  const gate = step("Template SEO check");
  assert.doesNotMatch(gate, /continue-on-error|^\s+if:/m);
});

test("both scripts refuse an address that showed them nothing, before they report anything", () => {
  const seo = codeOnly(read("scripts/template-seo-check.ts"));
  const guardAt = seo.indexOf("sitemapProblem(");
  assert.ok(guardAt > 0 && guardAt < seo.indexOf("const children"), "the sitemap answer is judged before a single page is sampled");
  const refuse = seo.slice(seo.indexOf("function nothingChecked"), seo.indexOf("async function main"));
  assert.match(refuse, /process\.exit\(1\)/, "nothing checked exits 1");
  assert.equal((seo.match(/nothingChecked\(/g) ?? []).length, 4, "its definition and three callers: no sitemap, no page listed, no template sampled");

  const lh = codeOnly(read("scripts/lighthouse-budget.ts"));
  const landingAt = lh.indexOf("lighthouseLanding(");
  const refusedAt = lh.indexOf("if (!landing.sameHost)");
  const baselineAt = lh.indexOf("if (writeBaseline)");
  assert.ok(landingAt > 0 && refusedAt > landingAt && baselineAt > refusedAt, "another host's page is refused before it can be compared with the budget or written as the baseline");
  assert.match(lh.slice(refusedAt, baselineAt), /process\.exit\(1\)/);
  assert.match(lh, /largestPaintElement\(/, "and the log names the element the largest paint was");
});

test("a failed gate is heard: the ops monitor lists the workflow", () => {
  // A deployment_status run belongs to Vercel's bot, so GitHub emails nobody when it fails.
  const job = JOBS.find((j) => j.file === "seo-preview-gate.yml");
  assert.ok(job, "seo-preview-gate.yml is in the ops monitor's JOBS");
  assert.ok(job.staleH >= 48, "it follows the release, and a release the 12-hour build gate skips leaves a two-day gap");
});

// ── The script itself, against a server that answers like a sign-in wall, then like a site ──

const serve = async (handler: (req: IncomingMessage, res: ServerResponse) => void) => {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
};

/** `scripts/template-seo-check.ts --url <origin>` as the workflow runs it. Async, so this process can serve it. */
const templateCheck = (origin: string) =>
  new Promise<{ code: number; out: string }>((resolve) => {
    execFile(
      process.execPath,
      ["--import", "tsx", "scripts/template-seo-check.ts", "--url", origin, "--samples", "1"],
      { cwd: ROOT, timeout: 60_000, env: { ...process.env, NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost" } },
      (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === "number" ? err.code : -1) : 0, out: `${stdout}\n${stderr}`.replace(/\x1b\[[0-9;]*m/g, "") }),
    );
  });

test("template-seo-check.ts fails on a login page: 'Nothing was checked', exit 1 (it used to pass)", async () => {
  const wall = await serve((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(LOGIN_PAGE);
  });
  try {
    const run = await templateCheck(wall.origin);
    assert.equal(run.code, 1, run.out);
    assert.match(run.out, /Nothing was checked:/);
    assert.match(run.out, /lists no pages/);
    assert.doesNotMatch(run.out, /All templates emit/, "it must not also print the pass line");
  } finally {
    await wall.close();
  }
});

test("template-seo-check.ts still passes a site that serves its sitemap and a sound page", async () => {
  const page = `<!DOCTYPE html><html><head><title>Accelerate</title>
<link rel="canonical" href="${SITE_URL}/keywords/accelerate"/>
<meta property="og:title" content="Accelerate"/><meta property="og:description" content="What Accelerate does."/>
<meta property="og:url" content="${SITE_URL}/keywords/accelerate"/><meta property="og:type" content="article"/>
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "BreadcrumbList" }, { "@type": "DefinedTerm", name: "Accelerate" }] })}</script>
</head><body><h1>Accelerate</h1></body></html>`;
  const site = await serve((req, res) => {
    const xml = (body: string) => {
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(body);
    };
    if (req.url === "/sitemap.xml") return xml(SITEMAP_INDEX);
    if (req.url === "/sitemaps/core.xml") return xml(`<urlset><url><loc>${SITE_URL}/keywords/accelerate</loc></url></urlset>`);
    if (req.url === "/keywords/accelerate") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(page);
    }
    res.writeHead(404);
    res.end("not found");
  });
  try {
    const run = await templateCheck(site.origin);
    assert.equal(run.code, 0, run.out);
    assert.match(run.out, /keyword\s+✓ canonical\s+✓ og\s+✓ schema/);
    assert.match(run.out, /All templates emit/);
  } finally {
    await site.close();
  }
});

// ── What the repaired gate found on its first honest run ─────────────────────
// Accessibility 1.00 → 0.97 on the home page (Lighthouse "target-size"). The text
// link into the set gallery was a 17px line, and since the minimal redesign the
// countdown card sits straight under it: 4px of safe space where 24 is asked.
// The old home page scored 1.00 with the same link, because nothing tappable was
// that close to it.
test("the home page's gallery link is a 44px row, not a line of text beside the countdown's links", () => {
  const home = read("src/components/home/HomeSections.tsx");
  const cls = home.match(/const GALLERY_LINK = "([^"]+)"/)?.[1] ?? "";
  for (const c of ["inline-flex", "min-h-11", "items-center"]) {
    assert.ok(cls.split(" ").includes(c), `GALLERY_LINK carries ${c}: a real box (min-height does nothing on an inline link), 44px tall`);
  }
  const links = [...codeOnly(home).matchAll(/href=\{`\/sets\/\$\{\w+\.slug\}\/gallery`\}\s+className=\{(\w+)\}/g)].map((m) => m[1]);
  assert.deepEqual(links, ["GALLERY_LINK", "GALLERY_LINK"], "both spellings of the link (the set in preview, the newest set) use it");
  // On touch the site's own rule lifts every .min-h-11 to 48px (globals.css), which is what Lighthouse's phone asks.
  assert.match(read("src/app/globals.css"), /@media \(pointer: coarse\) \{[^}]*\.min-h-11,[^}]*min-height: 48px;/);
});
