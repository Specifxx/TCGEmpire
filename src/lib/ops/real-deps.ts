// The real implementations of OpsDeps for the monitor (GitHub Actions, with a
// checkout of the repository and a database connection). Imported only by
// scripts/ops-monitor.ts; the website never loads this file.
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db";
import { OPERATIONAL_VARS } from "../db-chains";
import { getInboxCounts } from "./inbox-counts";
import type { OpsDeps, WorkflowRun } from "./deps";
import type { OpsState } from "./state";

const opsDb = (): NonNullable<OpsDeps["db"]> => ({
  ping: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
  // Newest lastSeen per market among in-stock rows: six rows out, however big the table.
  priceFreshness: async () => {
    const rows = await prisma.retailerPrice.groupBy({ by: ["country"], where: { inStock: true }, _max: { lastSeen: true }, _count: { _all: true } });
    return rows.map((r) => ({ country: r.country, newest: r._max.lastSeen, inStock: r._count._all }));
  },
  sealedNewest: async () => (await prisma.sealedListing.aggregate({ _max: { lastSeen: true } }))._max.lastSeen,
  auctions: async () => {
    const a = await prisma.ebayAuctionListing.aggregate({ _max: { updatedAt: true }, _count: { _all: true } });
    return { newestUpdate: a._max.updatedAt, count: a._count._all };
  },
  ebayAdsNewest: async () => (await prisma.ebayAdListing.aggregate({ _max: { updatedAt: true } }))._max.updatedAt,
  storeHealthNewest: async () => (await prisma.storeHealthSnapshot.aggregate({ _max: { day: true } }))._max.day,
  inbox: getInboxCounts,
});

function repoFiles(root: string): NonNullable<OpsDeps["repo"]> {
  return {
    newestHistoryDay: () => {
      try {
        const days = fs.readdirSync(path.join(root, "data/price-history/cards")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
        return days.sort().pop()?.slice(0, 10) ?? null;
      } catch {
        return null;
      }
    },
    publicSnapshotAt: () => {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(root, "data/public/meta.json"), "utf8")) as { generatedAt?: string };
        return meta.generatedAt ? new Date(meta.generatedAt) : null;
      } catch {
        return null;
      }
    },
  };
}

function githubApi(token: string, repo: string): NonNullable<OpsDeps["github"]> {
  const get = async <T>(p: string): Promise<T> => {
    const res = await fetch(`https://api.github.com${p}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "riftcompare-ops-monitor" },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status} on ${p.split("?")[0]}`);
    return (await res.json()) as T;
  };
  return {
    runs: async (file): Promise<WorkflowRun[]> => {
      const j = await get<{ workflow_runs?: { status: string; conclusion: string | null; created_at: string }[] }>(`/repos/${repo}/actions/workflows/${file}/runs?per_page=6`);
      return (j.workflow_runs ?? []).map((r) => ({ status: r.status, conclusion: r.conclusion, createdAt: new Date(r.created_at) }));
    },
    productionDeploy: async () => {
      const deps = await get<{ id: number; created_at: string }[]>(`/repos/${repo}/deployments?environment=Production&per_page=1`);
      const dep = deps[0];
      if (!dep) return null;
      const st = await get<{ state: string; description?: string }[]>(`/repos/${repo}/deployments/${dep.id}/statuses?per_page=1`);
      return { state: st[0]?.state ?? "pending", description: st[0]?.description ?? "", createdAt: new Date(dep.created_at) };
    },
  };
}

export function realDeps(state: OpsState, env: NodeJS.ProcessEnv = process.env, now = new Date()): OpsDeps {
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPOSITORY ?? "Specifxx/TCGEmpire";
  return {
    now,
    env: env as Record<string, string | undefined>,
    fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(25_000) }),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    db: opsDb(),
    repo: repoFiles(process.cwd()),
    github: token ? githubApi(token, repo) : undefined,
    databaseUrls: {
      operational: env[OPERATIONAL_VARS[0]] || env.DATABASE_URL || null,
      history: env.HISTORY_DATABASE_URL_4 || env.HISTORY_DATABASE_URL || null,
    },
    state: { neonProjects: state.neonProjects, samples: state.samples },
  };
}
