import { addDays, mergeDays, tagGroup, TAG_NAMES, toDisplay, type DayAmount, type SourceResult } from "./core";

// COST AND EARNINGS PER SITE (2026-10-30, owner: "an easy centralized way of
// looking at the costs that each website costs to run on Vercel, and the
// earnings this brings"). DECISIONS.md, "Vercel cost per site from the billing API".
//
// Earnings per site come from the tags every affiliate link already carries
// (eBay customid, TCGplayer sharedid: rc-, oc-, dex-, ky- …, see tagGroup);
// Stripe, AdSense and Mediavine are RiftCompare's alone. Vercel cost per site
// comes from Vercel's FOCUS billing export (GET /v1/billing/charges), which tags
// every usage charge with the project it belongs to. A charge with no project
// (the Pro plan itself, seats, tax) and every other cost line is "Shared".
//
// PURE: costs.ts fetches the charges; this parses and adds them up.

/** One day's Vercel charge for one project, as the billing API reports it. */
export interface ProjectCharge {
  day: string;
  project: string; // Vercel project name, or "" for team-wide charges
  currency: string;
  cents: number;
}

/**
 * Parse the billing API's JSONL into per-project, per-day charges. Domain
 * purchases and renewals are skipped: those are entered by hand on the
 * dashboard (docs/earnings-dashboard-setup.md, Part 5), and counting them here
 * too would add them twice.
 */
export function vercelCharges(jsonl: string): ProjectCharge[] {
  const m = new Map<string, ProjectCharge>();
  for (const line of jsonl.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    let r: Record<string, unknown>;
    try {
      r = JSON.parse(s) as Record<string, unknown>;
    } catch {
      continue;
    }
    const service = `${r.ServiceName ?? ""} ${r.SkuId ?? ""}`;
    if (/domain/i.test(service)) continue;
    const day = String(r.ChargePeriodStart ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const cents = Math.round(Number(r.BilledCost ?? 0) * 100);
    if (!Number.isFinite(cents) || !cents) continue;
    const tags = (r.Tags && typeof r.Tags === "object" ? r.Tags : {}) as Record<string, unknown>;
    const project = String(tags.ProjectName ?? tags.ProjectId ?? "").trim();
    const currency = String(r.BillingCurrency ?? "USD").toUpperCase();
    const k = `${day}|${project}|${currency}`;
    const p = m.get(k);
    if (p) p.cents += cents;
    else m.set(k, { day, project, currency, cents });
  }
  return [...m.values()].sort((a, b) => a.day.localeCompare(b.day) || a.project.localeCompare(b.project));
}

export const projectDays = (rows: readonly ProjectCharge[]): DayAmount[] => mergeDays(rows.map(({ day, currency, cents }) => ({ day, currency, cents })));

/** Every site, keyed by its affiliate-tag prefix, with how its Vercel project may be named. */
export const SITES: { key: string; label: string; project: RegExp }[] = [
  { key: "rc", label: "RiftCompare", project: /rift|tcgempire/ },
  { key: "oc", label: "OP Compare", project: /^op|onepiece|one-piece/ },
  { key: "dex", label: "DexCompare", project: /dex|pokemon/ },
  { key: "mtg", label: "MTG Compare", project: /mtg|magic/ },
  { key: "gundam", label: "Gundam Compare", project: /gundam/ },
  { key: "lorcana", label: "Lorcana Compare", project: /lorcana/ },
  { key: "ygo", label: "YGO Compare", project: /ygo|yugioh/ },
  { key: "wgc", label: "WargameCompare", project: /wargame/ },
  { key: "figure", label: "FigureCompare", project: /figure/ },
  { key: "ky", label: "K Young", project: /kaeyoung|kyoung|k-young/ },
  { key: "cc", label: "CamCompare", project: /cam/ },
  { key: "ce", label: "Compare Empire", project: /compareempire|compare-empire/ },
];
export const SHARED = "shared";

/** Which site a Vercel project belongs to; an unknown project keeps its own name, a team-wide charge is shared. */
export function siteForProject(project: string): string {
  const p = project.trim().toLowerCase();
  if (!p) return SHARED;
  return SITES.find((s) => s.project.test(p))?.key ?? `project:${p}`;
}

// Earnings that carry no tag but belong to one site: RiftCompare's Pro plan and Stores (Stripe), its ads.
const SOURCE_SITE: Partial<Record<SourceResult["key"], string>> = { stripe: "rc", adsense: "rc", mediavine: "rc" };

export interface SiteRow {
  key: string;
  label: string;
  earned: number; // display cents
  vercel: number; // this site's Vercel project(s)
  other: number; // shared row only: Anthropic and the costs entered by hand
  net: number;
}

function siteLabel(key: string): string {
  if (key === SHARED) return "Shared (Vercel plan, AI, other costs)";
  if (key === "") return "No tag (mostly eBay app sales)";
  if (key.startsWith("project:")) return `Vercel project ${key.slice(8)}`;
  return SITES.find((s) => s.key === key)?.label ?? TAG_NAMES[key] ?? key.toUpperCase();
}

/**
 * Earned, Vercel cost and net per site for the days from..to (inclusive), in
 * `display`. `otherCosts` (Anthropic, entries made by hand) go to the shared
 * row, so the rows add up to the dashboard's own profit. Every site is listed,
 * even at zero, so a site that costs money and earns nothing is visible.
 */
export function siteLedger(
  sources: readonly SourceResult[],
  vercel: readonly ProjectCharge[],
  otherCosts: readonly DayAmount[],
  from: string,
  to: string,
  display: string,
): SiteRow[] {
  const rows = new Map<string, SiteRow>();
  const row = (key: string) => {
    const r = rows.get(key) ?? { key, label: siteLabel(key), earned: 0, vercel: 0, other: 0, net: 0 };
    rows.set(key, r);
    return r;
  };
  for (const s of SITES) row(s.key);
  const inRange = (day: string) => day >= from && day <= to;
  const cents = (d: { cents: number; currency: string }) => toDisplay(d.cents, d.currency, display);
  for (const s of sources) {
    if (s.tags && (s.key === "ebay" || s.key === "tcgplayer")) {
      // The tags split the source by site; whatever its total has beyond them goes to "No tag".
      let tagged = 0;
      for (const t of s.tags) {
        if (!inRange(t.day)) continue;
        row(tagGroup(t.tag).key).earned += cents(t);
        tagged += cents(t);
      }
      const rest = s.days.filter((d) => inRange(d.day)).reduce((n, d) => n + cents(d), 0) - tagged;
      if (rest > 0) row("").earned += rest;
      continue;
    }
    for (const d of s.days) if (inRange(d.day)) row(SOURCE_SITE[s.key] ?? SHARED).earned += cents(d);
  }
  for (const c of vercel) if (inRange(c.day)) row(siteForProject(c.project)).vercel += cents(c);
  for (const d of otherCosts) if (inRange(d.day)) row(SHARED).other += cents(d);
  const out = [...rows.values()].map((r) => ({ ...r, net: r.earned - r.vercel - r.other }));
  const last = (k: string) => (k === SHARED ? 2 : k === "" ? 1 : 0);
  return out.sort((a, b) => last(a.key) - last(b.key) || b.net - a.net || a.label.localeCompare(b.label));
}

/** The first and last day of the `days` days ending `end`. */
export const span = (end: string, days: number): [string, string] => [addDays(end, -(days - 1)), end];
