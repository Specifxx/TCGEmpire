// A small client for Neon's control-plane API, used only to READ how much of a
// project's monthly transfer allowance is spent. It never touches a database, so the
// monitor can watch a project that has already run out of transfer.
//
//   GET /projects                       the projects the key can see (ids and names)
//   GET /projects/{id}/endpoints        each project's compute endpoints (the "ep-…" ids)
//   GET /projects/{id}                  data_transfer_bytes, consumption_period_start/end,
//                                       settings.quota.data_transfer_bytes
//
// A database's connection string carries its endpoint id as the first label of the host
// ("ep-young-surf-ayw7zkrh-pooler.c-5.us-east-2.aws.neon.tech"), which is how a URL is
// matched to a project without anyone copying a project id around.
const BASE = "https://console.neon.tech/api/v2";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** "ep-young-surf-ayw7zkrh" from a Neon connection string, or null if it is not one. */
export function endpointIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    if (!host.endsWith("neon.tech")) return null;
    const first = host.split(".")[0] ?? "";
    const id = first.replace(/-pooler$/, "");
    return /^ep-[a-z0-9-]+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export class NeonApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "NeonApiError";
  }
}

async function get<T>(apiKey: string, path: string, f: FetchLike): Promise<T> {
  const res = await f(`${BASE}${path}`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    throw new NeonApiError(res.status, `Neon API ${res.status} on ${path.split("?")[0]}${body ? `: ${body}` : ""}`);
  }
  return (await res.json()) as T;
}

export interface NeonProjectUsage {
  projectId: string;
  name: string | null;
  usedBytes: number;
  /** The plan's own quota when the API states one, else null (the caller falls back to the free-tier figure). */
  quotaBytes: number | null;
  periodStart: Date | null;
  periodEnd: Date | null;
}

interface ProjectDetail {
  project?: {
    id?: string;
    name?: string;
    data_transfer_bytes?: number;
    consumption_period_start?: string;
    consumption_period_end?: string;
    settings?: { quota?: { data_transfer_bytes?: number } };
  };
}

export async function projectUsage(apiKey: string, projectId: string, f: FetchLike): Promise<NeonProjectUsage> {
  const d = await get<ProjectDetail>(apiKey, `/projects/${encodeURIComponent(projectId)}`, f);
  const p = d.project ?? {};
  const q = p.settings?.quota?.data_transfer_bytes;
  const date = (s?: string) => (s ? new Date(s) : null);
  return {
    projectId,
    name: p.name ?? null,
    usedBytes: Number(p.data_transfer_bytes ?? 0),
    quotaBytes: typeof q === "number" && q > 0 ? q : null,
    periodStart: date(p.consumption_period_start),
    periodEnd: date(p.consumption_period_end),
  };
}

/**
 * Find the project that owns a compute endpoint. Walks the visible projects once, asking
 * each for its endpoints; the caller caches the answer (endpoint id → project id), so this
 * is a one-off per database, not a per-run cost.
 */
export async function findProjectForEndpoint(
  apiKey: string,
  endpointId: string,
  f: FetchLike,
  orgId?: string,
): Promise<string | null> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ limit: "100" });
    if (cursor) q.set("cursor", cursor);
    if (orgId) q.set("org_id", orgId);
    const d = await get<{ projects?: { id: string }[]; pagination?: { next?: string; cursor?: string } }>(apiKey, `/projects?${q}`, f);
    for (const p of d.projects ?? []) ids.push(p.id);
    cursor = d.pagination?.next ?? d.pagination?.cursor;
    if (!cursor || !(d.projects ?? []).length) break;
  }
  for (const id of ids) {
    try {
      const d = await get<{ endpoints?: { id?: string }[] }>(apiKey, `/projects/${encodeURIComponent(id)}/endpoints`, f);
      if ((d.endpoints ?? []).some((e) => e.id === endpointId)) return id;
    } catch {
      /* a project we cannot read cannot be ours */
    }
  }
  return null;
}
