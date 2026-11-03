// Daily Search Console demand for sister sites, so their eBay passes spend calls on what people search for.
//
// For each site below: page-level clicks and impressions for the last DAYS days (default 56), from the
// same GSC_SA_KEY service account the other Search Console jobs use, written as ONE file,
// `gsc-pages.json`, on the `demand` branch of the site's own repo (created on first run, never deployed:
// the site's vercel.json turns deployments off for it). The site's eBay script reads that file; nothing
// on any page reads it. Aggregate numbers only (path -> clicks, impressions, position), never a query.
//
//   node scripts/sister-demand-export.mjs            (GSC_SA_KEY, REPORTS_GITHUB_TOKEN)
//   DRY_RUN=1 node scripts/sister-demand-export.mjs  (prints the top pages, writes nothing)
//
// REPORTS_GITHUB_TOKEN is the fine-grained token with Contents read/write on the twelve site repos
// (the visitor-reports writer); it only ever touches the `demand` branch here. No dependencies.
import { createSign } from "node:crypto";
import { appendFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SITES = [{ site: "compareempire", property: "sc-domain:compareempire.com", repo: "Specifxx/compareempiretake2" }];
const BRANCH = "demand";
const FILE = "gsc-pages.json";
const DAYS = Math.max(14, Math.min(90, Number(process.env.DAYS || 56)));
const DRY = Boolean(process.env.DRY_RUN);
const TOKEN = process.env.REPORTS_GITHUB_TOKEN || "";

const b64u = (b) => Buffer.from(b).toString("base64url");
async function gscToken() {
  const sa = JSON.parse(process.env.GSC_SA_KEY || "");
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const c = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const s = createSign("RSA-SHA256");
  s.update(`${h}.${c}`);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${c}.${b64u(s.sign(sa.private_key))}` }),
  });
  const t = (await r.json()).access_token;
  if (!t) throw new Error(`Search Console token request failed (${r.status})`);
  return t;
}

const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** Page rows -> { "/path": [clicks, impressions, position] }, fragments and query strings folded into the path. */
/** @param {{ keys: string[]; clicks?: number; impressions?: number; position?: number }[]} rows */
export function aggregate(rows) {
  /** @type {Record<string, number[]>} */
  const out = {};
  for (const r of rows) {
    let p;
    try { p = new URL(r.keys[0]).pathname.replace(/\/$/, "") || "/"; } catch { continue; }
    const e = out[p] || [0, 0, 0];
    const impr = e[1] + (r.impressions || 0);
    // Impression-weighted average position.
    e[2] = impr ? (e[2] * e[1] + (r.position || 0) * (r.impressions || 0)) / impr : 0;
    e[0] += r.clicks || 0;
    e[1] = impr;
    out[p] = e;
  }
  for (const k of Object.keys(out)) out[k][2] = Math.round(out[k][2] * 10) / 10;
  return out;
}

async function pages(tok, property) {
  const rows = [];
  for (let start = 0; start < 100_000; start += 25_000) {
    const r = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: day(DAYS + 2), endDate: day(2), dimensions: ["page"], rowLimit: 25_000, startRow: start }),
    });
    if (!r.ok) throw new Error(`searchAnalytics ${property}: ${r.status}`);
    const got = (await r.json()).rows || [];
    rows.push(...got);
    if (got.length < 25_000) break;
  }
  return rows;
}

async function gh(repo, path, init = {}) {
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(init.body ? { "content-type": "application/json" } : {}) },
  });
  return r;
}

/** Writes FILE on BRANCH, creating the branch as an orphan (no history from main) the first time. */
async function publish(repo, json) {
  const ref = await gh(repo, `/git/ref/heads/${BRANCH}`);
  if (ref.status === 404) {
    const tree = await gh(repo, "/git/trees", { method: "POST", body: JSON.stringify({ tree: [
      { path: FILE, mode: "100644", type: "blob", content: json },
      { path: "vercel.json", mode: "100644", type: "blob", content: JSON.stringify({ git: { deploymentEnabled: false } }) + "\n" },
    ] }) });
    if (!tree.ok) throw new Error(`${repo}: create tree ${tree.status}`);
    const commit = await gh(repo, "/git/commits", { method: "POST", body: JSON.stringify({ message: "Search Console demand for the eBay pass", tree: (await tree.json()).sha, parents: [] }) });
    if (!commit.ok) throw new Error(`${repo}: create commit ${commit.status}`);
    const made = await gh(repo, "/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: (await commit.json()).sha }) });
    if (!made.ok) throw new Error(`${repo}: create branch ${made.status}`);
    return "created";
  }
  if (!ref.ok) throw new Error(`${repo}: read branch ${ref.status}`);
  const cur = await gh(repo, `/contents/${FILE}?ref=${BRANCH}`);
  const sha = cur.ok ? (await cur.json()).sha : undefined;
  const put = await gh(repo, `/contents/${FILE}`, { method: "PUT", body: JSON.stringify({ message: `Search Console demand ${day(0)}`, branch: BRANCH, content: Buffer.from(json).toString("base64"), sha }) });
  if (!put.ok) throw new Error(`${repo}: write ${FILE} ${put.status}`);
  return "updated";
}

async function main() {
  if (!process.env.GSC_SA_KEY) throw new Error("GSC_SA_KEY is not set");
  if (!DRY && !TOKEN) throw new Error("REPORTS_GITHUB_TOKEN is not set");
  const tok = await gscToken();
  const lines = [];
  let failed = 0;
  for (const s of SITES) {
    try {
      const agg = aggregate(await pages(tok, s.property));
      const n = Object.keys(agg).length;
      const json = JSON.stringify({ updatedAt: new Date().toISOString(), property: s.property, days: DAYS, pages: agg }) + "\n";
      const top = Object.entries(agg).sort((a, b) => b[1][1] - a[1][1]).slice(0, 5).map(([p, e]) => `${p} (${e[1]})`).join(", ");
      const how = DRY ? "dry run" : await publish(s.repo, json);
      lines.push(`- ${s.site}: ${n} pages with impressions in ${DAYS} days, ${how}. Top: ${top}`);
    } catch (e) {
      failed++;
      lines.push(`- ${s.site}: FAILED ${e.message}`);
    }
  }
  const txt = `### Sister-site search demand\n${lines.join("\n")}\n`;
  console.log(txt);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, txt);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
