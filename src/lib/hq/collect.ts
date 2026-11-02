// EMPIRE HQ's collector. Run by RiftCompare's ops monitor (GitHub Actions, every
// three hours), never by a page: it reads every sister's public status file and,
// for a site without a monitor, its home page and its import workflows' latest
// runs. GitHub's API is read with the Actions token (public repositories only).
// Every read is guarded: a source that cannot be read is "unknown", never an
// alert and never a false ok. DECISIONS.md, "Empire HQ and the one Monday report".
import { HQ_SITES, OWNER_REPO, statusUrl, type HqSite } from "./sites";
import { healthFromProbe, healthFromStatus, type RunLite, type SiteHealth } from "./status";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface CollectDeps {
  fetch: Fetch;
  now: Date;
  githubToken?: string;
}

async function text(deps: CollectDeps, url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string } | null> {
  try {
    const res = await deps.fetch(url, { headers: { "User-Agent": "riftcompare-empire-hq", ...headers }, signal: AbortSignal.timeout(20_000), redirect: "follow" });
    return { status: res.status, body: res.ok ? await res.text() : "" };
  } catch {
    return null;
  }
}

async function runsOf(deps: CollectDeps, site: HqSite, file: string): Promise<RunLite[] | null> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (deps.githubToken) headers.Authorization = `Bearer ${deps.githubToken}`;
  const r = await text(deps, `https://api.github.com/repos/${OWNER_REPO}/${site.repo}/actions/workflows/${file}/runs?status=completed&per_page=5`, headers);
  if (!r || r.status !== 200) return null;
  try {
    const j = JSON.parse(r.body) as { workflow_runs?: { conclusion: string | null; created_at: string }[] };
    return (j.workflow_runs ?? []).map((w) => ({ conclusion: w.conclusion, createdAt: w.created_at }));
  } catch {
    return null;
  }
}

async function one(deps: CollectDeps, site: HqSite): Promise<SiteHealth> {
  if (site.monitor) {
    const r = await text(deps, `${statusUrl(site)}?t=${deps.now.getTime()}`);
    return healthFromStatus(site, r && r.status === 200 ? r.body : null, deps.now);
  }
  const live = await text(deps, site.url);
  const runs: Record<string, RunLite[] | null> = {};
  for (const j of site.jobs ?? []) runs[j.file] = await runsOf(deps, site, j.file);
  return healthFromProbe(site, live ? live.status : null, runs, deps.now);
}

/** Every site but RiftCompare (whose row comes from its own report). */
export async function collectSisters(deps: CollectDeps): Promise<SiteHealth[]> {
  return Promise.all(HQ_SITES.filter((s) => !s.rift).map((s) => one(deps, s)));
}
