// The card scanner for sister sites that have no accounts, database or model key of their own (TCG Singles DB first;
// DECISIONS.md 2026-11-20 "Card scanner for TCG Singles DB"). The sister's /scan page posts the photo here from the
// visitor's browser; Rift makes the ONE model read (lib/scan/read.ts readAnyCard) and returns only what was read. The
// sister matches that reading to its own catalogue (it holds the cards; Rift never does). Pure, for the tests.
//
// - Exact https origins only (SISTER_SCAN_SITES), never a wildcard. No cookie or session is read for a sister request.
// - SISTER_SCAN_FREE_PER_DAY reads a visitor a UTC day (default 5), keyed by a salted hash of the IP, never the raw IP.
// - SISTER_SCAN_DAILY_CAP reads a UTC day per sister (default 500: about US$0.15 at the measured US$0.0003 a read).
// - Off with the main scanner (no ANTHROPIC_API_KEY) or SISTER_SCAN=0. The photo is never stored.
import { createHash } from "node:crypto";

export const SISTER_SCAN_SITES: { key: string; url: string; games: string[] }[] = [
  { key: "sdb", url: "https://tcgsinglesdb.com", games: ["pokemon", "yugioh", "one-piece"] },
];
export const DEFAULT_SISTER_SCAN_DAILY_CAP = 500;
export const DEFAULT_SISTER_SCAN_FREE_PER_DAY = 5;

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d;
}

export function sisterScanConfig(env: Record<string, string | undefined> = process.env) {
  return {
    enabled: !!env.ANTHROPIC_API_KEY && env.SISTER_SCAN !== "0",
    dailyCap: num(env.SISTER_SCAN_DAILY_CAP, DEFAULT_SISTER_SCAN_DAILY_CAP),
    perVisitor: num(env.SISTER_SCAN_FREE_PER_DAY, DEFAULT_SISTER_SCAN_FREE_PER_DAY),
  };
}

export function sisterScanSite(origin: string | null): (typeof SISTER_SCAN_SITES)[number] | null {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" || u.port) return null;
    const bare = u.hostname.toLowerCase().replace(/^www\./, "");
    return SISTER_SCAN_SITES.find((s) => new URL(s.url).hostname === bare) ?? null;
  } catch {
    return null;
  }
}

export function sisterScanCors(origin: string | null): Record<string, string> {
  if (!origin || !sisterScanSite(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** The Counter key for one visitor's day: a salted hash, so no IP is ever stored. */
export function sisterVisitorKey(site: string, ip: string, day: string, salt: string): string {
  const h = createHash("sha256").update(`${salt}|scan|${site}|${ip}|${day}`).digest("hex").slice(0, 20);
  return `scan:sis:${site}:v:${h}:${day}`;
}

export const sisterDayKey = (site: string, day: string) => `scan:sis:${site}:day:${day}`;
