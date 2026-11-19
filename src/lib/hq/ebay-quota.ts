// EMPIRE HQ: the eBay quota board (owner, 2026-11-19: "we cannot go past the eBay quota … we need to monitor it").
//
// Every eBay keyset allows 5,000 Browse calls a day, and most are shared by two or three sites, each held to its own
// daily cap in its own repo. This board reads what each site PUBLISHES about its own spend (a committed usage file,
// or its monitor's status file), adds the sites of each keyset together, and judges:
//   crit  a keyset at or over 5,000 calls, a site over its own cap, or a site that reports eBay's 429 (rate limited);
//   warn  a keyset within WARN_SHARE of the limit (the caps add up to 88-96% by design, so 80% would be red every day);
//   ok    otherwise; unknown when no site of the keyset published a fresh number (never a false ok).
// The ops monitor (scripts/ops-monitor.ts) runs it every three hours from GitHub Actions; RED mails the owner like any
// other check. It never calls eBay: the live allowance of RiftCompare's own keyset is the "ebay:quota" check.
// DECISIONS.md, 2026-11-19, "eBay calls go to sealed first".
import type { CheckResult, Severity } from "../ops/types";
import { OWNER_REPO } from "./sites";

export const KEYSET_LIMIT = 5000;
/** Warn when a keyset's known spend reaches this share of the limit. */
export const WARN_SHARE = 0.97;
/** A site's number older than this many hours is stale (its import did not run or did not publish). */
export const STALE_HOURS = 36;

/** What one site said about one day: calls spent, and whether eBay refused it with a 429. */
export interface SiteSpend {
  day: string; // YYYY-MM-DD (the site's own quota day)
  calls: number;
  rateLimited?: boolean;
  /** Another site's spend this site saw on the shared keyset (OP's status file: 5,000 minus what eBay showed left). */
  othersCalls?: number;
}

type Parser = (raw: string) => SiteSpend | null;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const json = (raw: string): any => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** data/state/ebay-usage.json of the card sites: { day, calls }. */
export const parseUsage: Parser = (raw) => {
  const j = json(raw);
  const calls = num(j?.calls);
  return j && typeof j.day === "string" && calls != null ? { day: j.day, calls } : null;
};

/** data/public/meta.json of the static engine: { ebay: { day, calls, qday?, qcalls? } } (the quota day wins). */
export const parseMeta: Parser = (raw) => {
  const e = json(raw)?.ebay;
  if (!e) return null;
  const calls = num(e.qcalls) ?? num(e.calls);
  const day = typeof e.qday === "string" ? e.qday : e.day;
  return typeof day === "string" && calls != null ? { day, calls } : null;
};

/** WargameCompare's data/ebay.json: { calls: { "YYYY-MM-DD": n } } (the newest day). */
export const parseCallsByDay: Parser = (raw) => {
  const c = json(raw)?.calls;
  if (!c || typeof c !== "object") return null;
  const day = Object.keys(c).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().pop();
  const calls = day ? num(c[day]) : null;
  return day && calls != null ? { day, calls } : null;
};

/** Compare Empire's data/ebay-status.json: { quotaDay, quotaSpent, rateLimited }. */
export const parseCeStatus: Parser = (raw) => {
  const j = json(raw);
  const calls = num(j?.quotaSpent) ?? num(j?.spent);
  const day = typeof j?.quotaDay === "string" ? j.quotaDay : typeof j?.ranAt === "string" ? j.ranAt.slice(0, 10) : null;
  return day && calls != null ? { day, calls, rateLimited: j.rateLimited === true } : null;
};

/**
 * OP Compare's watchdog status file (ops-status branch): the "eBay quota use" check says
 * "Spent T calls so far this quota day and Y the day before (ceiling C; eBay showed R of L left at the start of the last run)".
 * The larger of T and Y is OP's day; L − R is what the other site on the keyset (DexCompare) had spent by then.
 */
export const parseOpStatus = (raw: string, now: Date): SiteSpend | null => {
  const checks: { name?: string; detail?: string }[] = json(raw)?.checks ?? [];
  const d = checks.find((c) => c?.name === "eBay quota use")?.detail ?? "";
  const m = /Spent (\d+) calls so far this quota day and (\d+) the day before/.exec(d);
  if (!m) return null;
  const today = Number(m[1]);
  const before = Number(m[2]);
  const left = /eBay showed (\d+) of (\d+) left/.exec(d);
  const at = typeof json(raw)?.at === "string" ? new Date(json(raw).at) : now;
  const day = (today >= before ? at : new Date(at.getTime() - 86_400_000)).toISOString().slice(0, 10);
  return { day, calls: Math.max(today, before), ...(left ? { othersCalls: Math.max(0, Number(left[2]) - Number(left[1])) } : {}) };
};

export interface QuotaSite {
  key: string;
  label: string;
  /** Its own daily cap, in its own repo. */
  cap: number;
  /** Where it publishes its spend; null = it publishes none yet (the board says so). */
  source: { repo: string; ref: string; path: string; parse: Parser | ((raw: string, now: Date) => SiteSpend | null) } | null;
  /** Its spend is already counted by another site's reading of the keyset (DexCompare inside OP's "eBay showed"). */
  seenBy?: string;
}

export interface Keyset {
  id: string;
  label: string;
  sites: QuotaSite[];
  /** Said instead when no site of the keyset publishes a number. */
  note?: string;
}

const raw = (repo: string, path: string, ref = "HEAD") => ({ repo, ref, path });

/** Which sites share which keyset, and each one's own cap. Keep in step with each repo's cap (memory: ebay-keyset-map). */
export const KEYSETS: Keyset[] = [
  {
    id: "card",
    label: "Card app (YGO, Lorcana, Gundam)",
    sites: [
      { key: "ygo", label: "YGO Compare", cap: 2200, source: { ...raw("ygocompare", "data/state/ebay-usage.json"), parse: parseUsage } },
      { key: "lorcana", label: "Lorcana Compare", cap: 1150, source: { ...raw("lorcanacompare", "data/state/ebay-usage.json"), parse: parseUsage } },
      { key: "gundam", label: "Gundam Compare", cap: 1150, source: { ...raw("GundamCompare", "data/state/ebay-usage.json"), parse: parseUsage } },
    ],
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk app (Motor, Bandai, Cyberpunk)",
    sites: [
      { key: "motor", label: "MotorCompare", cap: 3300, source: { ...raw("motorcompare", "data/public/meta.json"), parse: parseMeta } },
      { key: "bandai", label: "BandaiCompare", cap: 1000, source: { ...raw("bandaicompare", "data/state/ebay-usage.json"), parse: parseUsage } },
      { key: "cyberpunk", label: "Cyberpunk Compare", cap: 600, source: { ...raw("cyberpunkcompare", "data/state/ebay-usage.json"), parse: parseUsage } },
    ],
  },
  {
    id: "rift",
    label: "Rift app (RiftCompare, MTG Compare)",
    note: "RiftCompare's own check \"eBay daily call allowance\" reads this keyset's live count from eBay",
    // RiftCompare has no fixed cap: it spends down to eBay's live remaining minus 600, and its own "ebay:quota" check
    // reads that live count. MTG Compare keeps its count in its database only.
    sites: [
      { key: "rc", label: "RiftCompare", cap: KEYSET_LIMIT - 600 - 1500, source: null },
      { key: "mtg", label: "MTG Compare", cap: 1500, source: null },
    ],
  },
  {
    id: "dex-op",
    label: "Dex app (DexCompare, OP Compare)",
    sites: [
      { key: "oc", label: "OP Compare", cap: 2500, source: { ...raw("OpCompare", "status.json", "ops-status"), parse: parseOpStatus } },
      { key: "dex", label: "DexCompare", cap: 2500, source: null, seenBy: "oc" },
    ],
  },
  {
    id: "ce",
    label: "Compare Empire app (Compare Empire, SportsCardCompare)",
    sites: [
      { key: "ce", label: "Compare Empire", cap: 2900, source: { ...raw("compareempiretake2", "data/ebay-status.json"), parse: parseCeStatus } },
      { key: "wax", label: "SportsCardCompare", cap: 1400, source: null },
    ],
  },
  {
    id: "api4",
    label: "Second account (FigureCompare, WargameCompare)",
    sites: [
      { key: "figure", label: "FigureCompare", cap: 2500, source: { ...raw("figurecompare", "data/public/meta.json"), parse: parseMeta } },
      { key: "wgc", label: "WargameCompare", cap: 2500, source: { ...raw("wargamecompare", "data/ebay.json"), parse: parseCallsByDay } },
    ],
  },
  {
    id: "ky-cam",
    label: "KaeYoung app (KaeYoung, CamCompare)",
    sites: [
      { key: "ky", label: "KaeYoung", cap: 2500, source: { ...raw("kaeyoung", "data/public/meta.json"), parse: parseMeta } },
      { key: "cam", label: "CamCompare", cap: 1104, source: null },
    ],
  },
  {
    id: "scent",
    label: "ScentCompare's own app",
    sites: [{ key: "sc", label: "ScentCompare", cap: 4800, source: { ...raw("scentcompare", "data/public/meta.json"), parse: parseMeta } }],
  },
];

export const rawUrl = (s: NonNullable<QuotaSite["source"]>) => `https://raw.githubusercontent.com/${OWNER_REPO}/${s.repo}/${s.ref}/${s.path}`;

export interface SiteReading {
  key: string;
  spend: SiteSpend | null;
}

const ageHours = (day: string, now: Date) => (now.getTime() - new Date(`${day}T23:59:59Z`).getTime()) / 3_600_000;

/** Judge one keyset from its sites' readings. PURE. */
export function judgeKeyset(ks: Keyset, readings: readonly SiteReading[], now: Date): CheckResult {
  const at = now.toISOString();
  const by = new Map(readings.map((r) => [r.key, r.spend]));
  const parts: string[] = [];
  const over: string[] = [];
  const limited: string[] = [];
  const unpublished: string[] = [];
  let known = 0;
  let fresh = 0;
  for (const s of ks.sites) {
    const sp = by.get(s.key) ?? null;
    if (s.seenBy) {
      const other = by.get(s.seenBy);
      if (other?.othersCalls != null && ageHours(other.day, now) <= STALE_HOURS) {
        known += other.othersCalls;
        parts.push(`${s.label} ${other.othersCalls.toLocaleString("en-US")}/${s.cap.toLocaleString("en-US")}`);
        if (other.othersCalls > s.cap) over.push(s.label);
      } else unpublished.push(s.label);
      continue;
    }
    if (!s.source) {
      unpublished.push(s.label);
      continue;
    }
    if (!sp || ageHours(sp.day, now) > STALE_HOURS) {
      parts.push(`${s.label} no fresh number`);
      continue;
    }
    fresh++;
    known += sp.calls;
    parts.push(`${s.label} ${sp.calls.toLocaleString("en-US")}/${s.cap.toLocaleString("en-US")}`);
    if (sp.calls > s.cap) over.push(`${s.label} (${sp.calls} > ${s.cap})`);
    if (sp.rateLimited) limited.push(s.label);
  }
  let severity: Severity = "ok";
  if (fresh === 0) severity = "unknown";
  else if (known >= KEYSET_LIMIT || over.length || limited.length) severity = "crit";
  else if (known >= KEYSET_LIMIT * WARN_SHARE) severity = "warn";
  const capSum = ks.sites.reduce((a, s) => a + s.cap, 0);
  const summary = fresh === 0 && ks.note
    ? `${ks.note}; not published here: ${unpublished.join(", ")}.`
    :
    `${known.toLocaleString("en-US")} of ${KEYSET_LIMIT.toLocaleString("en-US")} calls on the latest day (${parts.join(", ")})` +
    (unpublished.length ? `; not published: ${unpublished.join(", ")}` : "") +
    `; caps add to ${capSum.toLocaleString("en-US")}.`;
  const action =
    severity === "crit"
      ? over.length
        ? `${over.join(", ")} spent more than its own cap. Tell Claude: "an eBay import went over its cap; find out why and fix it."`
        : limited.length
          ? `eBay refused ${limited.join(", ")} (429): the shared allowance ran out. Tell Claude: "eBay's allowance ran out on ${ks.label}".`
          : `The keyset reached eBay's daily limit. Tell Claude: "eBay's allowance ran out on ${ks.label}".`
      : severity === "warn"
        ? `Within ${Math.round((1 - WARN_SHARE) * 100)}% of the limit. Nothing breaks yet; the next site to grow its cap would tip it over.`
        : undefined;
  return { id: `ebay:keyset:${ks.id}`, area: "ebay", title: `eBay allowance: ${ks.label}`, severity, summary, ...(action ? { action } : {}), metric: { value: known, limit: KEYSET_LIMIT, unit: "calls" }, checkedAt: at };
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Read every site's published spend (guarded: a source that cannot be read is null) and judge each keyset. */
export async function ebayQuotaChecks(fetch: Fetch, now: Date): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const ks of KEYSETS) {
    const readings = await Promise.all(
      ks.sites.map(async (s): Promise<SiteReading> => {
        if (!s.source) return { key: s.key, spend: null };
        try {
          const res = await fetch(`${rawUrl(s.source)}?t=${now.getTime()}`, { headers: { "User-Agent": "riftcompare-empire-hq" }, signal: AbortSignal.timeout(20_000) });
          if (!res.ok) return { key: s.key, spend: null };
          return { key: s.key, spend: s.source.parse(await res.text(), now) };
        } catch {
          return { key: s.key, spend: null };
        }
      }),
    );
    out.push(judgeKeyset(ks, readings, now));
  }
  return out;
}
