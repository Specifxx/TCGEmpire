/**
 * QA guard runner (DECISIONS.md, 2026-11-26 "A daily QA guard walks every live site").
 *
 *   npx tsx scripts/qa-guard/run.ts [--sites rift,op] [--out qa-report.json]
 *
 * Walks every site in `sites.ts` at desktop and phone widths and writes one JSON report plus a
 * Markdown summary (GITHUB_STEP_SUMMARY when set). A failed journey is tried once more on a fresh page
 * before it counts, so one slow response never opens an issue. Exit code 0 always: the issue step
 * (`issues.ts`) decides what is red; the run itself failing means the guard broke.
 */
import { chromium, type Browser } from "playwright";
import { appendFileSync, writeFileSync } from "node:fs";
import { SITES, VIEWPORTS, type Site, type Viewport } from "./sites";
import {
  basketJourney,
  filterJourney,
  go,
  openPage,
  overflow,
  productJourney,
  searchJourney,
  searchPageJourney,
  viewportOptions,
  type Check,
  type Link,
  type Tracked,
} from "./journeys";

type Partial = Omit<Check, "site" | "viewport">;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function withRetry<T extends Partial | Partial[]>(fn: () => Promise<T>, failed: (r: T) => boolean, where: string): Promise<T> {
  let r: T;
  try {
    r = await fn();
  } catch (e) {
    r = { journey: where, ok: false, level: "fail", detail: `crashed: ${(e as Error).message.split("\n")[0].slice(0, 200)}` } as T;
  }
  if (!failed(r)) return r;
  try {
    return await fn();
  } catch (e) {
    return r;
  }
}

const anyFail = (r: Partial | Partial[]) => (Array.isArray(r) ? r : [r]).some((c) => c.level === "fail");

async function runSite(browser: Browser, site: Site, v: Viewport): Promise<Check[]> {
  const ctx = await browser.newContext(viewportOptions(v));
  const out: Check[] = [];
  const add = (c: Partial | Partial[]) => (Array.isArray(c) ? c : [c]).forEach((x) => out.push({ ...x, site: site.key, viewport: v.name }));
  const health = async (t: Tracked, where: string) => {
    const errs = [...new Set(t.errors)];
    if (errs.length) add({ journey: `console errors: ${where}`, ok: false, level: "fail", detail: errs.slice(0, 3).join(" | "), url: t.page.url() });
    const bad = [...new Set(t.badResponses)];
    if (bad.length) add({ journey: `server errors: ${where}`, ok: false, level: "fail", detail: bad.slice(0, 4).join(", "), url: t.page.url() });
    if (v.mobile) {
      const o = await overflow(t.page).catch(() => null);
      if (o) add({ journey: `overflow: ${where}`, ok: false, level: "fail", detail: o, url: t.page.url() });
    }
  };
  // A fresh tab per journey so one page's errors are never blamed on another.
  const fresh = async <T extends Partial | Partial[]>(where: string, fn: (t: Tracked) => Promise<T>) => {
    let last: Tracked | null = null;
    const r = await withRetry(async () => {
      if (last) await last.page.close().catch(() => {});
      last = await openPage(ctx);
      return fn(last);
    }, anyFail, where);
    add(r);
    if (last) {
      await health(last, where);
      await (last as Tracked).page.close().catch(() => {});
    }
  };

  try {
    // 1. Home page.
    await fresh("home", async (t) => {
      const { status } = await go(t, site.url + "/");
      return { journey: "home", ok: status < 400, level: status < 400 ? "ok" : "fail", detail: `HTTP ${status}`, url: site.url } as Partial;
    });

    // 2. Searches, by the header box, then each result's product page.
    const firsts: { kind: string; link: Link }[] = [];
    for (const spec of site.searches) {
      let first: Link | undefined;
      await fresh(`search ${spec.kind}`, async (t) => {
        const r = await searchJourney(t, site, spec);
        first = r.first;
        return r.check;
      });
      if (site.searchPage) await fresh(`search page ${spec.kind}`, (t) => searchPageJourney(t, site, spec));
      if (first) firsts.push({ kind: spec.kind, link: first });
    }
    for (const { kind, link } of firsts) await fresh(`product ${kind}`, (t) => productJourney(t, site, link, kind));

    // 3. Filters and Best Basket.
    if (site.filters) await fresh("filters", (t) => filterJourney(t, site));
    if (site.basket) {
      const pick = firsts.find((f) => f.kind === "sealed") ?? firsts[0];
      await fresh("best basket", (t) => basketJourney(t, site, pick?.link));
    }
  } catch (e) {
    add({ journey: "guard", ok: false, level: "fail", detail: `guard crashed: ${(e as Error).message.slice(0, 200)}` });
  } finally {
    await ctx.close().catch(() => {});
  }
  return out;
}

async function main() {
  const only = arg("sites")?.split(",").filter(Boolean);
  const sites = SITES.filter((s) => !only?.length || only.includes(s.key));
  const browser = await chromium.launch(process.env.QA_CHROMIUM ? { executablePath: process.env.QA_CHROMIUM } : {});
  const started = new Date().toISOString();
  const checks: Check[] = [];
  const queue = sites.flatMap((s) => VIEWPORTS.map((v) => ({ s, v })));
  const workers = Array.from({ length: 4 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const t0 = Date.now();
      const r = await runSite(browser, job.s, job.v);
      checks.push(...r);
      const bad = r.filter((c) => c.level === "fail").length;
      console.log(`${job.s.key.padEnd(10)} ${job.v.name.padEnd(8)} ${bad ? `${bad} FAIL` : "ok"} (${Math.round((Date.now() - t0) / 1000)}s)`);
      for (const c of r) console.log(`   ${c.level === "ok" ? "✓" : c.level === "warn" ? "!" : "✗"} ${c.journey}: ${c.detail}`);
    }
  });
  await Promise.all(workers);
  await browser.close();

  const report = { started, finished: new Date().toISOString(), sites: sites.map((s) => s.key), checks };
  writeFileSync(arg("out") ?? "qa-report.json", JSON.stringify(report, null, 2));

  const lines = ["## QA guard", "", `${sites.length} sites, ${checks.filter((c) => c.level === "fail").length} failures, ${checks.filter((c) => c.level === "warn").length} warnings`, ""];
  for (const s of sites) {
    const mine = checks.filter((c) => c.site === s.key && c.level !== "ok");
    lines.push(`- **${s.name}**: ${mine.length ? "" : "all journeys pass"}`);
    for (const c of mine) lines.push(`  - ${c.level === "fail" ? "❌" : "⚠️"} ${c.viewport} · ${c.journey}: ${c.detail}`);
  }
  const md = lines.join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  console.log("\n" + md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
