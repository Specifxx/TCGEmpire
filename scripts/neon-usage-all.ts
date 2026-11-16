// Read-only: every Neon project the API key can see, with its monthly usage
// (transfer, compute) and reset date, labelled with the RM/RH variable that
// points at it. Never connects to a database. Prints names and numbers only.
import { endpointIdFromUrl } from "../src/lib/ops/neon";

const BASE = "https://console.neon.tech/api/v2";
const key = process.env.NEON_API_KEY ?? "";
if (!key) {
  console.log("NEON_API_KEY not set");
  process.exit(0);
}
async function get(path: string): Promise<any> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${path.split("?")[0]}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}
const byEndpoint = new Map<string, string[]>();
for (const [k, v] of Object.entries(process.env)) {
  if (!k.startsWith("P_")) continue;
  const ep = endpointIdFromUrl(v);
  if (!ep) continue;
  byEndpoint.set(ep, [...(byEndpoint.get(ep) ?? []), k.slice(2)]);
}
const gb = (b: number) => (b / 1e9).toFixed(2);
async function main() {
  const orgs: (string | undefined)[] = [undefined];
  try {
    const o = await get("/users/me/organizations");
    for (const x of o.organizations ?? []) orgs.push(x.id);
  } catch (e) {
    console.log(`(could not list organizations: ${(e as Error).message})`);
  }
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const org of orgs) {
    let d: any;
    try {
      d = await get(`/projects?limit=100${org ? `&org_id=${org}` : ""}`);
    } catch (e) {
      console.log(`(org ${org ?? "personal"}: ${(e as Error).message})`);
      continue;
    }
    for (const p of d.projects ?? []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      let names = "-";
      let det: any = {};
      try {
        const eps = await get(`/projects/${p.id}/endpoints`);
        const n = (eps.endpoints ?? []).flatMap((e: any) => byEndpoint.get(e.id) ?? []);
        if (n.length) names = n.join("/");
        det = (await get(`/projects/${p.id}`)).project ?? {};
      } catch (e) {
        names += ` (${(e as Error).message})`;
      }
      const q = det.settings?.quota ?? {};
      rows.push(
        [
          names.padEnd(22),
          String(det.name ?? p.name).padEnd(24),
          `transfer ${gb(Number(det.data_transfer_bytes ?? 0))} GB` + (q.data_transfer_bytes ? ` of ${gb(q.data_transfer_bytes)}` : ""),
          `compute ${(Number(det.compute_time_seconds ?? 0) / 3600).toFixed(1)} h` + (q.compute_time_seconds ? ` of ${(q.compute_time_seconds / 3600).toFixed(0)}` : ""),
          `active ${(Number(det.active_time_seconds ?? 0) / 3600).toFixed(1)} h` + (q.active_time_seconds ? ` of ${(q.active_time_seconds / 3600).toFixed(0)}` : ""),
          `period ${String(det.consumption_period_start ?? "?").slice(0, 10)}..${String(det.consumption_period_end ?? "?").slice(0, 10)}`,
          `org ${org ?? "personal"}`,
          det.owner?.subscription_type ? `plan ${det.owner.subscription_type}` : "",
        ].join(" | "),
      );
    }
  }
  console.log(rows.sort().join("\n"));
}
main().catch((e) => {
  console.log(`failed: ${(e as Error).message}`);
});
