// Daily triage of visitor reports (wrong prices, store suggestions) from every
// Compare Empire site. Each site files its reports in its OWN public repo, on a
// `reports` branch that never deploys (src/lib/reports-github.ts, the same file in
// every site repo): inbox/<site>/<day>/*.json, and done/<site>/... once handled.
// This job reads every site's branch through the API, keeps ONE open issue per
// site here (labels "reports" + "site:<site>") listing what is still open with
// what needs a look flagged first, closes a site's issue once its inbox is empty,
// and comments once on the "Reports digest" issue when new reports arrived (one
// notification a day at most). It checks the sites' write token too: a token that
// is about to expire, or does not work, fails the run (GitHub emails the owner).
//
//   node scripts/reports-triage.mjs            (in Actions: GITHUB_TOKEN, GITHUB_REPOSITORY)
//   DRY_RUN=1 node scripts/reports-triage.mjs  (prints the issue bodies, writes nothing)
//
// No dependencies. This repo is public: issue bodies never quote a visitor's note,
// they link to the report's file instead (which was redacted before it was saved).
import { appendFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = process.env.GITHUB_REPOSITORY || "Specifxx/TCGEmpire";
const TOKEN = process.env.GITHUB_TOKEN || "";
const DRY = Boolean(process.env.DRY_RUN);
const BRANCH = "reports";
const NOW = Date.now();
const DAY = 86_400_000;

/** Each site's own repo (SITE_REPOS in src/lib/reports-github.ts). */
export const SITE_REPOS = {
  riftcompare: "Specifxx/TCGEmpire",
  opcompare: "Specifxx/OpCompare",
  mtgcompare: "Specifxx/mtgcompare",
  dexcompare: "Specifxx/CompareEmpire",
  gundamcompare: "Specifxx/GundamCompare",
  lorcanacompare: "Specifxx/lorcanacompare",
  ygocompare: "Specifxx/ygocompare",
  compareempire: "Specifxx/compareempiretake2",
  camcompare: "Specifxx/Camcompare",
  wargamecompare: "Specifxx/wargamecompare",
  figurecompare: "Specifxx/figurecompare",
  kaeyoung: "Specifxx/Kaeyoung",
};

const SITE_NAMES = {
  riftcompare: "RiftCompare",
  opcompare: "OP Compare",
  mtgcompare: "MTG Compare",
  dexcompare: "DexCompare",
  gundamcompare: "Gundam Compare",
  lorcanacompare: "Lorcana Compare",
  ygocompare: "YGO Compare",
  compareempire: "Compare Empire",
  camcompare: "CamCompare",
  wargamecompare: "WargameCompare",
  figurecompare: "FigureCompare",
  kaeyoung: "K Young",
};
const SITE_URLS = {
  riftcompare: "https://riftcompare.com",
  opcompare: "https://opcompare.com",
  mtgcompare: "https://mtgcompare.com",
  dexcompare: "https://dexcompare.app",
  gundamcompare: "https://gundamcompare.com",
  lorcanacompare: "https://lorcanacompare.com",
  ygocompare: "https://ygocompare.com",
  compareempire: "https://compareempire.com",
  camcompare: "https://camcompare.com",
  wargamecompare: "https://wargamecompare.com",
  figurecompare: "https://figurecompare.com",
  kaeyoung: "https://kaeyoung.com",
};

// ---- read every site's reports branch ----------------------------------------

/** One site's open reports, read from its repo's `reports` branch. null = branch missing. */
export async function loadSite(site) {
  const repo = SITE_REPOS[site];
  const t = await gh(`/repos/${repo}/git/trees/${BRANCH}?recursive=1`);
  if (t.status === 404) return null;
  const tree = await t.json();
  const files = (tree.tree ?? []).filter((e) => e.type === "blob" && e.path.startsWith(`inbox/${site}/`) && e.path.endsWith(".json"));
  const out = [];
  for (const e of files) {
    const b = await gh(`/repos/${repo}/git/blobs/${e.sha}`);
    const url = `https://github.com/${repo}/blob/${BRANCH}/${e.path}`;
    try {
      const r = JSON.parse(Buffer.from((await b.json()).content ?? "", "base64").toString("utf8"));
      if (r && typeof r === "object" && r.kind) out.push({ ...r, site, file: e.path, url });
      else throw new Error("not a report");
    } catch {
      out.push({ v: 1, at: null, site, kind: "unreadable", file: e.path, url });
    }
  }
  return out;
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Flags for one site's open reports: what needs a look, most urgent first. */
export function flag(reports, now = NOW) {
  const key = (r) => `${norm(r.product || r.page)}|${norm(r.store)}`;
  const counts = new Map();
  for (const r of reports) if (r.kind === "wrong-price") counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
  const storeCounts = new Map();
  for (const r of reports) if (r.kind === "suggest-store") storeCounts.set(norm(r.storeUrl || r.store), (storeCounts.get(norm(r.storeUrl || r.store)) ?? 0) + 1);
  return reports
    .map((r) => {
      const age = r.at ? (now - Date.parse(r.at)) / DAY : 0;
      const why = [];
      let score = 0;
      if (r.kind === "wrong-price") {
        score += 3;
        const n = counts.get(key(r)) ?? 1;
        if (n > 1) (why.push(`reported ${n} times`), (score += 3));
        if (r.issue === "wrong-product") (why.push("wrong product: check the match"), (score += 2));
      } else if (r.kind === "suggest-store") {
        score += 1;
        const n = storeCounts.get(norm(r.storeUrl || r.store)) ?? 1;
        if (n > 1) (why.push(`suggested ${n} times`), (score += 2));
      } else if (r.kind === "unreadable") {
        (why.push("unreadable file"), (score += 5));
      } else score += 1;
      if (age >= 7) (why.push(`open ${Math.floor(age)} days`), (score += 2));
      if (r.at && age < 1) why.push("new");
      return { ...r, why, score, age, attention: r.kind === "wrong-price" || r.kind === "unreadable" || score >= 3 };
    })
    .sort((a, b) => b.score - a.score || String(b.at).localeCompare(String(a.at)));
}

const esc = (s) => String(s ?? "").replace(/[<>]/g, "").replace(/\|/g, "/").replace(/\r?\n/g, " ");

function line(r, site) {
  const url = SITE_URLS[site] && r.page ? `${SITE_URLS[site]}${r.page}` : null;
  const what =
    r.kind === "suggest-store"
      ? `**Store:** ${esc(r.store) || "?"}${r.storeUrl ? ` (${esc(r.storeUrl)})` : ""}${r.region ? ` · ${esc(r.region)}` : ""}`
      : r.kind === "wrong-price"
        ? `**${esc(r.product) || esc(r.page) || "?"}**${r.store ? ` at ${esc(r.store)}` : ""}${r.region ? ` (${esc(r.region)})` : ""}${r.issue ? ` · ${esc(r.issue)}` : ""}${r.shown ? ` · shown ${esc(r.shown)}` : ""}${r.actual ? ` · says ${esc(r.actual)}` : ""}`
        : `**${esc(r.kind)}**${r.issue ? ` (${esc(r.issue)})` : ""}`;
  const note = r.note ? " · has a note" : "";
  const flags = r.why.length ? ` — _${r.why.join(", ")}_` : "";
  return `- [ ] ${r.attention ? "⚠️ " : ""}${what}${flags}\n  ${r.at ? r.at.slice(0, 16).replace("T", " ") + " UTC" : ""}${url ? ` · [page](${url})` : ""} · [report](${r.url ?? r.file})${note}`;
}

export function issueBody(site, reports) {
  const f = flag(reports);
  const need = f.filter((r) => r.attention);
  const rest = f.filter((r) => !r.attention);
  const price = f.filter((r) => r.kind === "wrong-price").length;
  const stores = f.filter((r) => r.kind === "suggest-store").length;
  return [
    `**${f.length} open** (${price} wrong price${price === 1 ? "" : "s"}, ${stores} store suggestion${stores === 1 ? "" : "s"}${f.length - price - stores ? `, ${f.length - price - stores} other` : ""}), ${need.length} need a look. Updated ${new Date(NOW).toISOString().slice(0, 16).replace("T", " ")} UTC by the daily triage.`,
    "",
    "To deal with them, ask Claude: _\"check the open reports for " + (SITE_NAMES[site] ?? site) + "\"_. A fixed or declined report is moved from `inbox/` to `done/` (same path), and this issue closes itself when the inbox is empty.",
    "",
    need.length ? `### Needs a look\n\n${need.map((r) => line(r, site)).join("\n")}\n` : null,
    rest.length ? `### Also open\n\n${rest.map((r) => line(r, site)).join("\n")}` : null,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

// ---- GitHub ---------------------------------------------------------------

async function gh(path, init = {}, token = TOKEN) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!r.ok && r.status !== 404) throw new Error(`${init.method ?? "GET"} ${path}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}

async function ensureLabel(name, color) {
  if (DRY) return;
  const r = await gh(`/repos/${REPO}/labels/${encodeURIComponent(name)}`);
  if (r.status === 404) await gh(`/repos/${REPO}/labels`, { method: "POST", body: JSON.stringify({ name, color }) });
}

async function issuesWith(label, state = "all") {
  const r = await gh(`/repos/${REPO}/issues?labels=${encodeURIComponent(label)}&state=${state}&per_page=20`);
  return r.status === 404 ? [] : (await r.json()).filter((i) => !i.pull_request);
}

async function upsert(label, title, body, open) {
  if (DRY) return console.log(`\n==== ${title} (${open ? "open" : "close"})\n${body}`);
  await ensureLabel(label, "c5def5");
  await ensureLabel("reports", "d93f0b");
  const [issue] = await issuesWith(label);
  if (!issue && !open) return;
  if (!issue) {
    await gh(`/repos/${REPO}/issues`, { method: "POST", body: JSON.stringify({ title, body, labels: ["reports", label] }) });
    return;
  }
  await gh(`/repos/${REPO}/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ title, body, state: open ? "open" : "closed", ...(open ? {} : { state_reason: "completed" }) }) });
}

async function digest(text) {
  if (DRY) return console.log(`\n==== digest comment\n${text}`);
  await ensureLabel("digest", "fbca04");
  let [issue] = await issuesWith("digest", "open");
  if (!issue) {
    const r = await gh(`/repos/${REPO}/issues`, { method: "POST", body: JSON.stringify({ title: "Reports digest", body: "One comment a day when new visitor reports arrive. Each site has its own issue (label `reports`).", labels: ["digest"] }) });
    issue = await r.json();
  }
  await gh(`/repos/${REPO}/issues/${issue.number}/comments`, { method: "POST", body: JSON.stringify({ body: text }) });
}

/** The sites' write token: does it still work, and when does it expire? */
async function tokenCheck() {
  const t = (process.env.REPORTS_GITHUB_TOKEN || "").trim();
  if (!t) return { ok: true, note: "REPORTS_GITHUB_TOKEN is not an Actions secret here, so its expiry is not checked." };
  const r = await fetch(`https://api.github.com/repos/${SITE_REPOS.riftcompare}`, { headers: { Authorization: `Bearer ${t}`, Accept: "application/vnd.github+json" } });
  if (!r.ok) return { ok: false, note: `The sites' REPORTS_GITHUB_TOKEN no longer works (HTTP ${r.status}): every site's report form is failing. Make a new token and update it in every Vercel project and in this repo's Actions secrets.` };
  const exp = r.headers.get("github-authentication-token-expiration");
  if (!exp) return { ok: true, note: "The sites' token works and does not expire." };
  const days = (Date.parse(exp.replace(" UTC", "Z").replace(" ", "T")) - NOW) / DAY;
  if (days < 14) return { ok: false, note: `The sites' REPORTS_GITHUB_TOKEN expires in ${Math.max(0, Math.floor(days))} days (${exp}). Regenerate it and update it in every Vercel project and here.` };
  return { ok: true, note: `The sites' token works; it expires ${exp}.` };
}

// ---- main -------------------------------------------------------------------

async function main() {
  if (!TOKEN && !DRY) throw new Error("GITHUB_TOKEN is not set");
  const bySite = new Map();
  const missing = [];
  for (const site of Object.keys(SITE_REPOS)) {
    const reports = await loadSite(site);
    if (reports === null) missing.push(SITE_NAMES[site] ?? site);
    bySite.set(site, reports ?? []);
  }
  const summary = [];
  const fresh = [];
  for (const site of Object.keys(SITE_REPOS)) {
    const reports = bySite.get(site) ?? [];
    const name = SITE_NAMES[site] ?? site;
    const title = reports.length ? `${name}: ${reports.length} open report${reports.length === 1 ? "" : "s"}` : `${name}: no open reports`;
    await upsert(`site:${site}`, title, reports.length ? issueBody(site, reports) : "All handled.", reports.length > 0);
    const f = flag(reports);
    const newOnes = f.filter((r) => r.age < 1);
    if (reports.length) summary.push(`| ${name} | ${reports.length} | ${f.filter((r) => r.attention).length} | ${newOnes.length} |`);
    if (newOnes.length) fresh.push(`- **${name}**: ${newOnes.length} new (${newOnes.filter((r) => r.kind === "wrong-price").length} wrong price, ${newOnes.filter((r) => r.kind === "suggest-store").length} store), ${reports.length} open in all`);
  }
  const tok = await tokenCheck();
  const table = summary.length ? ["| Site | Open | Need a look | New today |", "|---|---|---|---|", ...summary].join("\n") : "No open reports on any site.";
  if (fresh.length) await digest([`**New visitor reports since yesterday**`, "", ...fresh, "", "Ask Claude to \"check the open reports\" to review and fix them."].join("\n"));
  const gap = missing.length ? `\n\nNo \`${BRANCH}\` branch yet (their reports cannot be saved): ${missing.join(", ")}.` : "";
  const out = `## Visitor reports\n\n${table}\n\n${tok.note}${gap}\n`;
  console.log(out);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
  if (missing.length && !DRY) throw new Error(`No reports branch in: ${missing.join(", ")}. Their report forms cannot save; tell Claude "the reports branch is missing".`);
  if (!tok.ok) {
    await upsert("token", "Reports token needs renewing", tok.note, true);
    throw new Error(tok.note);
  } else await upsert("token", "Reports token needs renewing", tok.note, false);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
