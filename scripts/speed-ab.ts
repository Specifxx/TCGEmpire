/**
 * scripts/speed-ab.ts: the same page on two or more origins, measured the same way, several times each.
 *
 *   CHROME_PATH=… npx tsx scripts/speed-ab.ts --runs 5 home=https://riftcompare.com browse=https://riftcompare.com/browse
 *
 * WHY THIS EXISTS (2026-11-13, DECISIONS.md "The after-deploy gate was checking Vercel's sign-in page"). The deploy
 * gate's Lighthouse step (scripts/lighthouse-budget.ts) is ONE run per deploy, and one run cannot tell a slower page
 * from a slower minute: it read 9.06s to 9.49s on five deploys and 11.86s on the sixth, and nothing in the log said
 * which element that paint was. This was written to ask the question properly, and its first answer was that both
 * builds' addresses were Vercel's sign-in page. What it does:
 *
 *   - every target is measured `--runs` times, the targets taking turns (A B, B A, A B…), so a slow minute on the
 *     runner or the network lands on all of them;
 *   - a target is a URL (an origin, to which `--page` is added, or a full address with its own path), or
 *     `sha:<commit>`: that commit's own production deployment, whose address is read from the GitHub Deployments API,
 *     as probe-deploy.yml does. A deployment's own address is behind Vercel's sign-in today, so such a target is
 *     reported and then left out (see the first request below); the form stays for the day one can be opened;
 *   - before anything is measured, one plain request per target says what answers there: the status, the title and
 *     any redirect. A target that redirects to another host is a sign-in wall, not the site, and is not measured;
 *   - the settings are the gate's (mobile, 390 by 844 at 2x, Lighthouse's simulated throttling), plus, with
 *     `--methods simulate,devtools`, the same page under REAL throttling (the network and the processor slowed while
 *     the page loads), because the simulated figure is an estimate built from an unthrottled load;
 *   - each run prints what the largest paint WAS (the element), when it was seen in the unthrottled load, and how
 *     much had been downloaded by then. That last figure is what moves the simulated number: Lighthouse counts every
 *     request that finished before the largest paint as standing in its way.
 *   - then each target is opened three times in a plain phone-sized browser, no throttling, and every "largest paint"
 *     the browser itself reports is listed with its time, size and element.
 *
 * Read-only: it loads public pages. Nothing is written but the log. Run by probe-deploy.yml's `speed` input.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { largestPaintElement } from "../src/lib/deploy-gate";

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const RUNS = Math.max(1, Math.min(15, Number(flag("--runs", "5")) || 5));
const PAGE = flag("--page", "/");
const METHODS = flag("--methods", "simulate")
  .split(",")
  .map((m) => m.trim())
  .filter((m) => m === "simulate" || m === "devtools");
const SPECS = argv.filter((a) => /^[a-z0-9_-]+=/i.test(a));

interface Target {
  label: string;
  origin: string;
}

/** The address measured: the target plus `--page`, unless the target was given with a path of its own. */
const urlOf = (t: Target): string => (/^https?:\/\/[^/]+\/.+/.test(t.origin) ? t.origin : `${t.origin}${PAGE}`);

interface Run {
  score: number;
  fcp: number;
  lcp: number;
  tbt: number;
  si: number;
  cls: number;
  observedFcp: number | null;
  observedLcp: number | null;
  /** Requests that had finished when the largest paint was seen in the unthrottled load. */
  before: { count: number; kb: number; scripts: number; scriptKb: number; thirdParty: number } | null;
  element: string;
  phases: string;
  error?: string;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const ms = (n: number | null | undefined): string => (n == null || !Number.isFinite(n) ? "n/a" : `${Math.round(n)}ms`);

/** `sha:<commit>` → that commit's production deployment URL, from the GitHub Deployments API. */
async function resolveSha(prefix: string): Promise<string> {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error("sha: targets need GITHUB_REPOSITORY and GH_TOKEN (run it from probe-deploy.yml)");
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "speed-ab", Accept: "application/vnd.github+json" };
  const list = (await (await fetch(`https://api.github.com/repos/${repo}/deployments?per_page=40`, { headers })).json()) as any[];
  if (!Array.isArray(list)) throw new Error(`Deployments API: ${JSON.stringify(list).slice(0, 200)}`);
  const hits = list.filter((d) => String(d.sha).startsWith(prefix));
  if (!hits.length) throw new Error(`no deployment for ${prefix} among the newest ${list.length}`);
  for (const d of hits) {
    const statuses = (await (await fetch(d.statuses_url, { headers })).json()) as any[];
    const ok = Array.isArray(statuses) ? statuses.find((s) => s.state === "success") : null;
    if (!ok) continue;
    console.log(`  ${prefix}: ${d.environment}, created ${d.created_at}, environment_url=${ok.environment_url || "(none)"}, target_url=${ok.target_url || "(none)"}`);
    const url = ok.environment_url || ok.target_url;
    if (url) return String(url).replace(/\/$/, "");
  }
  throw new Error(`no successful deployment with a URL for ${prefix}`);
}

function lighthouseOnce(url: string, method: string): Run {
  const dir = mkdtempSync(join(tmpdir(), "speed-ab-"));
  const out = join(dir, "report.json");
  try {
    execFileSync(
      "npx",
      [
        "--no-install",
        "lighthouse",
        url,
        "--preset=perf",
        "--form-factor=mobile",
        "--screenEmulation.mobile=true",
        "--screenEmulation.width=390",
        "--screenEmulation.height=844",
        "--screenEmulation.deviceScaleFactor=2",
        `--throttling-method=${method}`,
        "--only-categories=performance",
        "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
        "--quiet",
        "--output=json",
        `--output-path=${out}`,
      ],
      { stdio: ["ignore", "ignore", "pipe"], timeout: 240_000 },
    );
    const lhr = JSON.parse(readFileSync(out, "utf8"));
    const a = lhr.audits ?? {};
    const num = (id: string): number => Number(a[id]?.numericValue ?? NaN);
    const observed = a.metrics?.details?.items?.[0] ?? {};
    const observedLcp: number | null = typeof observed.observedLargestContentfulPaint === "number" ? observed.observedLargestContentfulPaint : null;

    // What had finished downloading when the largest paint was seen. Lighthouse's simulated figure treats all of it
    // as on the way to that paint, so this is the number to read beside it.
    let before: Run["before"] = null;
    const requests: any[] = a["network-requests"]?.details?.items ?? [];
    if (observedLcp != null && requests.length) {
      const host = new URL(url).host;
      const done = requests.filter((r) => typeof r.networkEndTime === "number" && r.networkEndTime <= observedLcp);
      const kb = (rs: any[]) => Math.round(rs.reduce((n, r) => n + (Number(r.transferSize) || 0), 0) / 1024);
      const scripts = done.filter((r) => r.resourceType === "Script");
      const third = done.filter((r) => {
        try {
          return new URL(r.url).host !== host;
        } catch {
          return false;
        }
      });
      before = { count: done.length, kb: kb(done), scripts: scripts.length, scriptKb: kb(scripts), thirdParty: third.length };
    }

    // The element the largest paint was (src/lib/deploy-gate.ts reads it out of whichever audit this version has).
    const painted = largestPaintElement(lhr);
    const element = painted ? `${painted.snippet} | ${painted.text}` : "(not reported)";
    const parts: string[] = [];
    const walk = (o: any): void => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o.items)) {
        for (const it of o.items) {
          const name = it?.subpart ?? it?.phase ?? (typeof it?.label === "string" ? it.label : it?.label?.value);
          const dur = it?.duration ?? it?.timing;
          if (name && typeof dur === "number") parts.push(`${String(name).replace(/\s+/g, "")}=${Math.round(dur)}`);
          walk(it);
        }
      }
    };
    walk(a["lcp-breakdown-insight"]?.details ?? a["largest-contentful-paint-element"]?.details);

    return {
      score: Math.round((lhr.categories?.performance?.score ?? 0) * 100),
      fcp: num("first-contentful-paint"),
      lcp: num("largest-contentful-paint"),
      tbt: num("total-blocking-time"),
      si: num("speed-index"),
      cls: num("cumulative-layout-shift"),
      observedFcp: typeof observed.observedFirstContentfulPaint === "number" ? observed.observedFirstContentfulPaint : null,
      observedLcp,
      before,
      element,
      phases: parts.join(" "),
    };
  } catch (e) {
    const err = e as { message?: string; stderr?: Buffer };
    const detail = `${err.message ?? e}`.split("\n")[0] + (err.stderr ? ` | ${String(err.stderr).trim().split("\n").slice(-2).join(" / ")}` : "");
    return { score: NaN, fcp: NaN, lcp: NaN, tbt: NaN, si: NaN, cls: NaN, observedFcp: null, observedLcp: null, before: null, element: "", phases: "", error: detail.slice(0, 400) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A plain phone-sized browser, no throttling: every largest-paint candidate the browser reports, in order. */
async function observe(targets: Target[]): Promise<void> {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.log("\n(Playwright is not installed: skipping the browser's own list of largest paints.)");
    return;
  }
  // The same Chromium Lighthouse drives (CHROME_PATH), so both halves of the report come from one browser build.
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}).catch((e: Error) => {
    console.log(`\n(The plain browser did not start: ${e.message.split("\n")[0]})`);
    return null;
  });
  if (!browser) return;
  console.log("\n== THE BROWSER'S OWN LARGEST PAINTS (phone 390x844 at 2x, no throttling, three loads each) ==");
  for (const t of targets) {
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const w = window as unknown as { __lcp: unknown[]; __fcp: number | null };
        w.__lcp = [];
        w.__fcp = null;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const e = entry as PerformanceEntry & { size?: number; element?: Element | null; url?: string };
            const el = e.element ?? null;
            w.__lcp.push({
              t: Math.round(e.startTime),
              size: e.size ?? 0,
              tag: el ? el.tagName : null,
              cls: el ? String((el as HTMLElement).className).slice(0, 70) : null,
              text: el ? (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60) : null,
              url: (e.url ?? "").slice(0, 110),
            });
          }
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (e.name === "first-contentful-paint") w.__fcp = Math.round(e.startTime);
        }).observe({ type: "paint", buffered: true });
      });
      try {
        const started = Date.now();
        await page.goto(urlOf(t), { waitUntil: "load", timeout: 60_000 });
        const loadMs = Date.now() - started;
        await page.waitForTimeout(5000);
        const seen = await page.evaluate(() => {
          const w = window as unknown as { __lcp: unknown[]; __fcp: number | null };
          const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
          return { fcp: w.__fcp, lcp: w.__lcp, ttfb: nav ? Math.round(nav.responseStart) : null, dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null };
        });
        console.log(`  ${t.label} #${i + 1}: first byte ${ms(seen.ttfb)}, first paint ${ms(seen.fcp)}, DOM ready ${ms(seen.dcl)}, load ${ms(loadMs)}`);
        for (const c of seen.lcp) console.log(`      ${JSON.stringify(c)}`);
        if (i === 0) {
          // Which build is this? The page's own headings say it better than a byte count does.
          const outline = await page.evaluate(() => ({
            title: document.title,
            links: document.querySelectorAll("a[href]").length,
            height: document.documentElement.scrollHeight,
            headings: Array.from(document.querySelectorAll("h1, h2")).map((h) => `${h.tagName.toLowerCase()} ${(h.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80)}`),
          }));
          console.log(`      title "${outline.title}", ${outline.links} links, ${outline.height}px tall`);
          for (const h of outline.headings.slice(0, 40)) console.log(`      ${h}`);
        }
      } catch (e) {
        console.log(`  ${t.label} #${i + 1}: failed: ${String((e as Error).message).split("\n")[0]}`);
      }
      await context.close();
    }
  }
  await browser.close();
}

async function main() {
  if (!SPECS.length) {
    console.error("Usage: speed-ab.ts [--runs 5] [--page /] [--methods simulate,devtools] label=url|sha:<commit> …");
    process.exit(2);
  }
  console.log(`Speed A/B of ${PAGE}: ${RUNS} runs per target, methods ${METHODS.join(", ") || "simulate"}`);
  const targets: Target[] = [];
  for (const spec of SPECS) {
    const at = spec.indexOf("=");
    const label = spec.slice(0, at);
    const value = spec.slice(at + 1);
    try {
      const origin = value.startsWith("sha:") ? await resolveSha(value.slice(4)) : value.replace(/\/$/, "");
      targets.push({ label, origin });
      console.log(`  ${label} = ${origin}`);
    } catch (e) {
      console.log(`  ${label}: SKIPPED, ${(e as Error).message}`);
    }
  }
  if (!targets.length) process.exit(1);

  // One plain request each first: is the address open to the public, and which build answers. An address that
  // redirects to another host is a sign-in wall: measuring it would time the login page and call it ours.
  const open: Target[] = [];
  for (const t of targets) {
    try {
      const url = urlOf(t);
      const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 speed-ab" } });
      const body = res.status === 200 ? await res.text() : "";
      const title = /<title>([^<]*)<\/title>/.exec(body)?.[1] ?? "";
      const redirect = res.status >= 300 && res.status < 400 ? (res.headers.get("location") ?? "") : "";
      console.log(`  ${t.label}: HTTP ${res.status}, ${body.length} bytes, x-vercel-cache=${res.headers.get("x-vercel-cache") ?? "n/a"}, title="${title.slice(0, 70)}"${redirect ? `, location=${redirect}` : ""}`);
      const elsewhere = redirect ? new URL(redirect, url).host : "";
      if (elsewhere && elsewhere !== new URL(url).host) {
        console.log(`  ${t.label}: NOT MEASURED. It redirects to ${elsewhere}, so what would load there is that host's page, not this site.`);
        continue;
      }
    } catch (e) {
      console.log(`  ${t.label}: request failed: ${(e as Error).message}`);
    }
    open.push(t);
  }
  if (!open.length) {
    console.error("No target is open to the public: nothing was measured.");
    process.exit(1);
  }

  for (const method of METHODS.length ? METHODS : ["simulate"]) {
    console.log(`\n== LIGHTHOUSE, ${method === "simulate" ? "simulated throttling (the deploy gate's settings)" : "real throttling (network and processor slowed during the load)"} ==`);
    const results = new Map<string, Run[]>(open.map((t) => [t.label, []]));
    for (let i = 0; i < RUNS; i++) {
      const order = i % 2 ? [...open].reverse() : open;
      for (const t of order) {
        const r = lighthouseOnce(urlOf(t), method);
        results.get(t.label)!.push(r);
        if (r.error) {
          console.log(`  ${t.label} #${i + 1}: FAILED ${r.error}`);
          continue;
        }
        const b = r.before;
        console.log(
          `  ${t.label} #${i + 1}: score ${r.score}, first paint ${ms(r.fcp)}, largest paint ${ms(r.lcp)}, blocking ${ms(r.tbt)}, speed index ${ms(r.si)}, shift ${r.cls.toFixed(3)}` +
            ` | seen unthrottled: first paint ${ms(r.observedFcp)}, largest paint ${ms(r.observedLcp)}` +
            (b ? ` | finished before it: ${b.count} requests, ${b.kb} kB (${b.scripts} scripts, ${b.scriptKb} kB; ${b.thirdParty} from other hosts)` : "") +
            ` | ${r.element}${r.phases ? ` | ${r.phases}` : ""}`,
        );
      }
    }
    console.log(`\n  MEDIANS (${method}):`);
    for (const t of open) {
      const ok = results.get(t.label)!.filter((r) => !r.error);
      if (!ok.length) {
        console.log(`  ${t.label}: no successful run`);
        continue;
      }
      const m = (pick: (r: Run) => number | null) => median(ok.map(pick).filter((n): n is number => n != null && Number.isFinite(n)));
      console.log(
        `  ${t.label.padEnd(6)} n=${ok.length}: score ${m((r) => r.score)}, first paint ${ms(m((r) => r.fcp))}, largest paint ${ms(m((r) => r.lcp))}` +
          ` (lowest ${ms(Math.min(...ok.map((r) => r.lcp)))}, highest ${ms(Math.max(...ok.map((r) => r.lcp)))}), blocking ${ms(m((r) => r.tbt))}, speed index ${ms(m((r) => r.si))}` +
          ` | unthrottled largest paint ${ms(m((r) => r.observedLcp))}, requests before it ${m((r) => r.before?.count ?? null)}, ${m((r) => r.before?.kb ?? null)} kB`,
      );
    }
  }

  await observe(open);
}

main().catch((e) => {
  console.error("speed-ab crashed:", e);
  process.exit(1);
});
