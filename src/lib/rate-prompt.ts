// THE "RATE RIFTCOMPARE" PROMPT (owner, 2026-10-26: "we ask users to rate our
// site … they can't really close it that easily … a very simple rating", and
// the rating shown on the Pro page, as Collectr does). DECISIONS.md, "Pro:
// Collectr's model, $6.99 or $3.99/mo yearly".
//
// Pure, client-safe: when to ask. The component (RateUsPrompt) keeps the state
// in localStorage and calls this on every route change.
//
// WHEN. Only once a visitor has seen RATE_AFTER_PAGES pages and spent
// RATE_AFTER_MS on the site, never on the page they landed on: Google demotes a
// page that greets a visitor from search with an interstitial, and someone who
// has used the site for a few pages has something to rate. Never on sign-in,
// checkout, admin, embeds or the arcade. A rating ends it for good; "Not now"
// waits RATE_SNOOZE_MS and then asks again, at most RATE_MAX_ASKS times.

export const RATE_AFTER_PAGES = 3;
export const RATE_AFTER_MS = 45_000;
export const RATE_SNOOZE_MS = 14 * 86_400_000;
export const RATE_MAX_ASKS = 3;
export const RATE_STORAGE_KEY = "rc_rate";

const NEVER = [/^\/login/, /^\/verify/, /^\/admin/, /^\/embed/, /^\/premium\/(start|welcome|claim)/, /^\/games/, /^\/riftle/, /^\/unsubscribe/];

export interface RateState {
  /** First page view this browser made, epoch ms. */
  firstSeen: number;
  /** Page views counted so far. */
  pages: number;
  /** When "Not now" was last pressed, epoch ms (0 = never). */
  snoozedAt: number;
  /** How many times the prompt has been shown. */
  asks: number;
  /** Set once a rating was sent; the prompt never shows again. */
  rated: boolean;
}

export function freshRateState(now: number): RateState {
  return { firstSeen: now, pages: 0, snoozedAt: 0, asks: 0, rated: false };
}

/** Reads a stored state, or a fresh one when it is missing or malformed. */
export function parseRateState(raw: string | null, now: number): RateState {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object") return freshRateState(now);
    const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
    return { firstSeen: num(v.firstSeen, now), pages: num(v.pages, 0), snoozedAt: num(v.snoozedAt, 0), asks: num(v.asks, 0), rated: v.rated === true };
  } catch {
    return freshRateState(now);
  }
}

/** Should the prompt open on this page view (after `pages` was counted)? */
export function shouldAskRating(s: RateState, now: number, path: string): boolean {
  if (s.rated || s.asks >= RATE_MAX_ASKS) return false;
  if (NEVER.some((r) => r.test(path))) return false;
  if (s.pages < RATE_AFTER_PAGES) return false;
  if (now - s.firstSeen < RATE_AFTER_MS) return false;
  if (s.snoozedAt && now - s.snoozedAt < RATE_SNOOZE_MS) return false;
  return true;
}

/** The follow-up a rating gets: a low one asks what to fix. */
export function ratingFollowUp(stars: number): "fix" | "thanks" {
  return stars <= 3 ? "fix" : "thanks";
}
