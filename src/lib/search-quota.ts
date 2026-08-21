// The daily search-meter's actual logic — split out of api/search/route.ts so
// it's a plain importable function, testable without going through a route
// handler (Next.js route.ts files only recognize a fixed set of exports —
// GET/POST/dynamic/etc. — so anything else worth unit-testing has to live
// outside one).
import { SEARCH_BURST_MS } from "./search-limits";

// The current UTC day as a cookie-safe key — the quota window. UTC (not the
// visitor's timezone) so the reset moment is consistent no matter where the
// request is served from.
export function utcDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

// Read + advance the daily search meter. Returns what the caller should know
// (blocked or not, searches left) plus the cookie value to write back. The
// count only advances when this request starts a NEW search burst — see
// SEARCH_BURST_MS in lib/search-limits.ts.
export function tickQuota(
  raw: string | undefined,
  limit: number,
  now: number
): { blocked: boolean; remaining: number; cookieValue: string } {
  const day = utcDayKey(now);
  let count = 0;
  let lastMs = 0;
  const parts = (raw ?? "").split(".");
  if (parts[0] === day) {
    count = Math.max(0, Math.floor(Number(parts[1]))) || 0;
    lastMs = Math.max(0, Math.floor(Number(parts[2]))) || 0;
  }
  if (count >= limit) {
    // Refresh lastMs even when blocked so a blocked visitor typing away can't
    // sneak a burst boundary through, then keep the count where it is.
    return { blocked: true, remaining: 0, cookieValue: `${day}.${count}.${now}` };
  }
  const newBurst = now - lastMs > SEARCH_BURST_MS;
  const next = newBurst ? count + 1 : count;
  return { blocked: false, remaining: Math.max(0, limit - next), cookieValue: `${day}.${next}.${now}` };
}
