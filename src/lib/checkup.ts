// Collection check-up: a two-week concierge test (owner's go, 19 Nov 2026; DECISIONS.md
// "Collection check-up test"). A member with 10+ saved items asks for a free check-up of
// their collection: what is worth grading, what has moved, what to pick up. The team writes
// it by hand from our own prices and emails it; no AI API call is made by any site.
// Rift's binder posts here same-origin; MTG Compare and OP Compare post cross-origin from
// their own exact origins. Requests are private Feedback rows (source "checkup").
// Read on 3 Dec 2026: go if 60+ requests AND 25+ founder-price ticks; stop under 20.
import { SISTER_ALERT_SITES } from "./sister-alerts/sites";

export const CHECKUP_SOURCE = "checkup";
export const CHECKUP_MIN_ITEMS = 10;
export const CHECKUP_CAP = 40;
export const CHECKUP_PRICE = "US$7.99";
export const CHECKUP_FOUNDER_PRICE = "US$5.99";
export const CHECKUP_READ_DATE = "2026-12-03";
export const MAX_ITEMS = 400;
export const MAX_LINE = 160;

/** The sites that may send a check-up, by exact origin. */
export const CHECKUP_SITES: { key: string; url: string }[] = [
  { key: "mtg", url: SISTER_ALERT_SITES.find((s) => s.key === "mtg")!.url },
  { key: "op", url: "https://opcompare.app" },
  { key: "dex", url: SISTER_ALERT_SITES.find((s) => s.key === "dex")!.url },
];

export function checkupSiteFor(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" || u.port) return null;
    const bare = u.hostname.toLowerCase().replace(/^www\./, "");
    return CHECKUP_SITES.find((s) => new URL(s.url).hostname.replace(/^www\./, "") === bare)?.key ?? null;
  } catch {
    return null;
  }
}

export function checkupCors(origin: string | null): Record<string, string> {
  if (!checkupSiteFor(origin) || !origin) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export interface CheckupRequest {
  items: string[];
  goal: string | null;
  founder: boolean;
  market: string | null;
}

/** Cleans a request; null when it carries fewer than CHECKUP_MIN_ITEMS items. */
export function parseCheckup(body: unknown): CheckupRequest | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(b.items) ? b.items : [];
  const items = raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/\s+/g, " ").trim().slice(0, MAX_LINE))
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
  if (items.length < CHECKUP_MIN_ITEMS) return null;
  const goal = typeof b.goal === "string" ? b.goal.trim().slice(0, 600) || null : null;
  const market = typeof b.market === "string" && /^[A-Z]{2}$/.test(b.market) ? b.market : null;
  return { items, goal, founder: b.founder === true, market };
}

export function checkupMessage(site: string, r: CheckupRequest): string {
  return [
    `Site: ${site}`,
    `Market: ${r.market ?? "not given"}`,
    `Founder price: ${r.founder ? "YES" : "no"}`,
    r.goal ? `Wants: ${r.goal}` : null,
    `Items (${r.items.length}):`,
    ...r.items,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export const isFounderTick = (message: string) => /^Founder price: YES$/m.test(message);
