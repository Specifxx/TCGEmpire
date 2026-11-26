/**
 * QA guard → GitHub issues (DECISIONS.md, 2026-11-26).
 *
 *   npx tsx scripts/qa-guard/issues.ts qa-report.json
 *
 * One open issue per broken site, in THIS repository (the Actions token can write only here), labelled
 * `qa-guard` and `qa:<site>`. The issue's body is rewritten every run with what is broken now; a comment
 * is added only when the set of failures changes, so nobody is pinged by a repeat. When every journey
 * of a site passes again, its issue is closed with a comment. Warnings never open an issue.
 *
 * The daily fix session (a scheduled Claude session, see docs/qa-guard.md) works the open `qa-guard`
 * issues: it fixes them in the site's own repository and, only when no agent can (a secret, a sign-in,
 * a store that blocks us), labels the issue `qa:owner` and adds one step to data/hq/owner-steps.json.
 * The issues are on a PUBLIC repository: they say which page and journey broke, never anything private.
 */
import { readFileSync } from "node:fs";
import { SITES } from "./sites";
import type { Check } from "./journeys";

const REPO = process.env.GITHUB_REPOSITORY ?? "Specifxx/TCGEmpire";
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
const API = `https://api.github.com/repos/${REPO}`;

async function gh(path: string, init: RequestInit = {}) {
  const r = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

/** What a failure is, without the counts and ids that change from run to run (decides "changed"). */
export function signature(c: Check): string {
  return `${c.viewport}|${c.journey.replace(/"[^"]*"/g, "")}`;
}

export function issueBody(siteName: string, repo: string, fails: Check[], runUrl: string): string {
  const rows = fails.map((c) => `| ${c.viewport} | ${c.journey} | ${c.detail.replace(/\|/g, "/")} | ${c.url ? `[open](${c.url})` : ""} |`);
  return [
    `The daily QA guard found a journey a visitor cannot finish on **${siteName}**.`,
    "",
    `Fix it in \`${repo}\`. Each failure was seen twice in a row (the guard retries on a fresh page first).`,
    "",
    "| Width | Journey | What happened | Page |",
    "|---|---|---|---|",
    ...rows,
    "",
    `Last run: ${runUrl}`,
    "",
    "This issue is rewritten by every run and closed automatically when every journey passes again.",
    "Re-run one site: Actions → *QA guard* → Run workflow, sites = the site's key.",
    "",
    `<!-- qa-guard:signature ${Buffer.from(fails.map(signature).sort().join("\n")).toString("base64")} -->`,
  ].join("\n");
}

async function main() {
  const file = process.argv[2] ?? "qa-report.json";
  const report = JSON.parse(readFileSync(file, "utf8")) as { sites: string[]; checks: Check[] };
  const runUrl = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "(local run)";
  if (!TOKEN) {
    console.log("No GITHUB_TOKEN: printing what would be filed.");
  }
  const open: { number: number; title: string; body: string; labels: { name: string }[] }[] = TOKEN
    ? await gh(`/issues?state=open&labels=qa-guard&per_page=100`)
    : [];

  for (const key of report.sites) {
    const site = SITES.find((s) => s.key === key);
    if (!site) continue;
    const fails = report.checks.filter((c) => c.site === key && c.level === "fail");
    const label = `qa:${key}`;
    const existing = open.find((i) => i.labels.some((l) => l.name === label));
    if (!fails.length) {
      if (existing && TOKEN) {
        await gh(`/issues/${existing.number}/comments`, { method: "POST", body: JSON.stringify({ body: `Every journey passes again (${runUrl}). Closing.` }) });
        await gh(`/issues/${existing.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) });
        console.log(`${key}: closed #${existing.number}`);
      }
      continue;
    }
    const body = issueBody(site.name, site.repo, fails, runUrl);
    const sig = body.match(/qa-guard:signature (\S+)/)?.[1];
    const title = `QA guard: ${site.name}: ${fails.length} broken journey${fails.length > 1 ? "s" : ""}`;
    if (!TOKEN) {
      console.log(`--- ${title}\n${body}\n`);
      continue;
    }
    if (existing) {
      const oldSig = existing.body?.match(/qa-guard:signature (\S+)/)?.[1];
      await gh(`/issues/${existing.number}`, { method: "PATCH", body: JSON.stringify({ title, body }) });
      if (oldSig !== sig) {
        await gh(`/issues/${existing.number}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: `The failures changed (${runUrl}):\n\n${fails.map((c) => `- ${c.viewport} · ${c.journey}: ${c.detail}`).join("\n")}` }),
        });
      }
      console.log(`${key}: updated #${existing.number}`);
    } else {
      const made = await gh(`/issues`, { method: "POST", body: JSON.stringify({ title, body, labels: ["qa-guard", label] }) });
      console.log(`${key}: opened #${made.number}`);
    }
  }
}

// Run only as a script, so tests can import the helpers.
if (/qa-guard[\\/]issues\.ts$/.test(process.argv[1] ?? ""))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
