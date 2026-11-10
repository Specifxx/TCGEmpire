import { siteForProject } from "@/lib/earnings/sites";
import { scrubSecrets } from "@/lib/earnings/sources";
import { credentials, get, listProjects, pool } from "./vercel";

// BUY CLICKS BY WHO PAYS (2026-11-10, zero-earnings diagnosis, site review X6):
// most small sites earned ~A$0 because their buy clicks went to stores that pay
// nothing. The Monday report now splits each site's week of `buy_click` events into
// the destinations that pay us: TCGplayer, eBay, Amazon and the stores we joined on
// Awin. DECISIONS.md, "Buy clicks by who pays in the Monday report".
//
// Each site family names the destination under a different event property
// (retailer, retailer_key, host, placement, surface, source, link_url), so every key
// is grouped through Vercel's PUBLIC Web Analytics API (by=eventData/<key>, the same
// token as the analytics page) and, per network, the LARGEST count across keys is
// kept, never the sum: one click can name eBay under several keys. Each answer is the
// top 100 values, so a long tail of one-off values can be missed (an under-count,
// never an over-count). Counts only; consent-gated analytics (Rift, OP) under-count.

export const NETWORKS = ["tcgplayer", "ebay", "amazon", "awin"] as const;
export type Network = (typeof NETWORKS)[number];
export type NetworkCounts = Record<Network, number>;

export const NETWORK_KEYS = ["retailer", "retailer_key", "host", "placement", "surface", "source", "link_url"] as const;

/** The Awin stores we have joined, as of 2026-11-10: the fallback when the live list can't be read. */
export const AWIN_FALLBACK = ["cliftoncameras", "hamleys", "opulensi", "perfumeprice", "pacoperfumerias", "ryman", "stylevana"];
export const AWIN_PROGRAMMES_URL = "https://raw.githubusercontent.com/Specifxx/compareempiretake2/HEAD/data/awin/programmes.json";

const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
const zero = (): NetworkCounts => ({ tcgplayer: 0, ebay: 0, amazon: 0, awin: 0 });

/** Match terms for the joined Awin stores, from programmes.json's `joined` (names and domains). Pure. */
export function awinTerms(json: unknown): string[] {
  const joined = (json as { joined?: { name?: string; domains?: string[] }[] } | null)?.joined;
  if (!Array.isArray(joined)) return [];
  const out = new Set<string>();
  for (const p of joined) {
    if (typeof p?.name === "string" && squash(p.name).length >= 5) out.add(squash(p.name));
    for (const d of p?.domains ?? []) {
      // The registrable label: "dev.cliftoncameras.co.uk" → "cliftoncameras".
      const labels = String(d).toLowerCase().replace(/^www\./, "").split(".");
      const stem = labels.filter((l) => !/^(dev|www|shop|store|myshopify|co|com|net|org|uk|au|de|eu|us|ca|nz)$/.test(l)).sort((a, b) => b.length - a.length)[0];
      if (stem && stem.length >= 5) out.add(squash(stem));
    }
  }
  return [...out];
}

/** Which paying network an event value names, or null (a store with no programme, a placement). Pure. */
export function classifyClickValue(value: string, awin: readonly string[]): Network | null {
  const v = value.toLowerCase();
  if (/tcgplayer|tcgp\b|partner\.tcgplayer/.test(v)) return "tcgplayer";
  if (v.includes("ebay")) return "ebay";
  if (/amazon|amzn/.test(v)) return "amazon";
  const s = squash(v);
  if (s.includes("awin")) return "awin";
  if (s && awin.some((t) => s.includes(t))) return "awin";
  return null;
}

/** Sum a `by=eventData/<key>` answer's rows by network. Pure. */
export function networkCountsOf(json: unknown, awin: readonly string[]): NetworkCounts {
  const out = zero();
  const rows = (json as { data?: Record<string, unknown>[] } | null)?.data;
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const value = Object.entries(r).find(([k]) => k.toLowerCase().startsWith("eventdata"))?.[1];
    if (typeof value !== "string") continue;
    const net = classifyClickValue(value, awin);
    if (net) out[net] += Number(r.count) || 0;
  }
  return out;
}

/** Per network, the largest count any one key gave. Pure. */
export function bestPerNetwork(perKey: readonly NetworkCounts[]): NetworkCounts {
  const out = zero();
  for (const c of perKey) for (const n of NETWORKS) out[n] = Math.max(out[n], c[n]);
  return out;
}

/** Fold per-project counts into per-site counts. Pure. */
export function foldNetworks(rows: readonly { project: string; counts: NetworkCounts }[], siteOf: (p: string) => string = siteForProject): Map<string, NetworkCounts> {
  const out = new Map<string, NetworkCounts>();
  for (const r of rows) {
    const key = siteOf(r.project);
    const s = out.get(key) ?? zero();
    for (const n of NETWORKS) s[n] += r.counts[n];
    out.set(key, s);
  }
  return out;
}

export async function loadAwinTerms(): Promise<string[]> {
  try {
    const r = await fetch(AWIN_PROGRAMMES_URL, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!r.ok) return AWIN_FALLBACK;
    const terms = awinTerms(await r.json());
    return terms.length ? terms : AWIN_FALLBACK;
  } catch {
    return AWIN_FALLBACK;
  }
}

export interface NetworkClicks {
  status: "ok" | "not-configured" | "error";
  detail?: string;
  sites: Map<string, NetworkCounts>;
}

const analyticsSite = (project: string) => (/riftboundstocks/i.test(project) ? `project:${project.toLowerCase()}` : siteForProject(project));

/** Each site's buy clicks to TCGplayer, eBay, Amazon and joined Awin stores over [since, until]. */
export async function loadNetworkClicks(since: string, until: string): Promise<NetworkClicks> {
  const cred = credentials();
  if (!cred) return { status: "not-configured", sites: new Map() };
  try {
    const [projects, awin] = await Promise.all([listProjects(cred.token, cred.team), loadAwinTerms()]);
    let answered = 0;
    const rows = await pool(projects, 4, async (p) => {
      const perKey = await Promise.all(
        NETWORK_KEYS.map((key) =>
          get("/v1/query/web-analytics/events/aggregate", { teamId: cred.team, projectId: p.id, since, until, by: `eventData/${key}`, limit: "100", filter: "eventName eq 'buy_click'" }, cred.token).then(
            (j) => {
              answered++;
              return networkCountsOf(j, awin);
            },
            () => zero(), // Web Analytics off, or the key never sent
          ),
        ),
      );
      return { project: p.name, counts: bestPerNetwork(perKey) };
    });
    if (!answered) return { status: "error", detail: "Vercel answered no analytics request.", sites: new Map() };
    return { status: "ok", sites: foldNetworks(rows, analyticsSite) };
  } catch (e) {
    return { status: "error", detail: e instanceof Error ? scrubSecrets(e.message).slice(0, 200) : "Request failed", sites: new Map() };
  }
}
