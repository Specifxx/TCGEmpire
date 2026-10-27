// THE "RATE RIFTCOMPARE" PROMPT (owner, 2026-10-26; reworked 2026-10-27 after a
// visitor said there were "too many pop-ups asking for my opinion", owner:
// "for the pop-ups to appear … after they've been on the site for a certain
// amount of time"). DECISIONS.md, "One rating ask, earned by engagement".
//
// Pure, client-safe: when to ask. The component (RateUsPrompt) keeps the state
// in localStorage and calls this on every route change.
//
// It is the ONLY prompt on the site that asks for an opinion unasked. The
// feedback form has no floating button any more: it opens from the footer's
// "Rate & review" link (FeedbackLink) and the /contact page.
//
// WHEN. Never a new visitor (owner, 2026-10-27: "asking new users to rate it,
// it's kind of weird"; "I just don't want to be bombarded with it every time I
// open the site"). Only a returning one who has really used the site:
//   • a return visit (a page view RATE_VISIT_GAP_MS after the last), AND
//   • RATE_AFTER_MS (a day) since their first visit, AND
//   • RATE_AFTER_PAGES pages in all;
//   • never on the first page of a visit, never in a visit where the Pricing
//     callout already showed (one uninvited prompt per visit), never on sign-in,
//     checkout, admin, embeds or the arcade.
// HOW OFTEN. A rating or "Don't ask again" ends it for good; closing it (✕,
// Escape, "Not now") waits RATE_SNOOZE_MS; it gives up after RATE_MAX_ASKS.
// It is a small corner card, not a modal: it never blocks the page.

export const RATE_AFTER_PAGES = 5;
export const RATE_AFTER_MS = 86_400_000;
export const RATE_VISIT_GAP_MS = 30 * 60_000;
export const RATE_SNOOZE_MS = 30 * 86_400_000;
export const RATE_MAX_ASKS = 2;
export const RATE_STORAGE_KEY = "rc_rate";
/** sessionStorage: set when the prompt showed this visit (PricingNudge yields to it). */
export const RATE_SESSION_KEY = "rc_rate_seen";

const NEVER = [/^\/login/, /^\/verify/, /^\/admin/, /^\/embed/, /^\/premium/, /^\/checkout/, /^\/games/, /^\/riftle/, /^\/unsubscribe/, /^\/contact/, /^\/feedback/];

/** May a rating surface (the corner card, the "Rate us" strip) appear on this path? */
export function rateAllowedOn(path: string): boolean {
  return !NEVER.some((r) => r.test(path));
}

export interface RateState {
  /** First page view this browser made, epoch ms. */
  firstSeen: number;
  /** Last page view, epoch ms (a gap over RATE_VISIT_GAP_MS starts a new visit). */
  lastSeen: number;
  /** Page views counted so far. */
  pages: number;
  /** Visits counted so far (the first is 1). */
  visits: number;
  /** When it was last closed without a rating, epoch ms (0 = never). */
  snoozedAt: number;
  /** How many times the prompt has been shown. */
  asks: number;
  /** Set once a rating was sent; the prompt never shows again. */
  rated: boolean;
  /** "Don't ask again": the prompt never shows again. */
  optedOut: boolean;
}

export function freshRateState(now: number): RateState {
  return { firstSeen: now, lastSeen: now, pages: 0, visits: 1, snoozedAt: 0, asks: 0, rated: false, optedOut: false };
}

/** Reads a stored state, or a fresh one when it is missing or malformed. */
export function parseRateState(raw: string | null, now: number): RateState {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object") return freshRateState(now);
    const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
    const firstSeen = num(v.firstSeen, now);
    return {
      firstSeen,
      lastSeen: num(v.lastSeen, firstSeen),
      pages: num(v.pages, 0),
      visits: num(v.visits, 1),
      snoozedAt: num(v.snoozedAt, 0),
      asks: num(v.asks, 0),
      rated: v.rated === true,
      optedOut: v.optedOut === true,
    };
  } catch {
    return freshRateState(now);
  }
}

/** Counts one page view: a long enough gap since the last one is a new visit. */
export function countPageView(s: RateState, now: number): RateState {
  const visits = s.pages > 0 && now - s.lastSeen >= RATE_VISIT_GAP_MS ? s.visits + 1 : s.visits;
  return { ...s, pages: s.pages + 1, visits, lastSeen: now };
}

export interface RateVisit {
  /** Page views in this visit (tab session), this one included. */
  pages: number;
  /** Another uninvited prompt (the Pricing callout) already showed this visit. */
  otherPromptShown: boolean;
}

/** Should the prompt open on this page view (after it was counted)? */
export function shouldAskRating(s: RateState, now: number, path: string, visit: RateVisit): boolean {
  if (s.rated || s.optedOut || s.asks >= RATE_MAX_ASKS) return false;
  if (!rateAllowedOn(path)) return false;
  if (visit.pages < 2 || visit.otherPromptShown) return false;
  if (s.pages < RATE_AFTER_PAGES) return false;
  if (now - s.firstSeen < RATE_AFTER_MS) return false;
  if (s.visits < 2) return false;
  if (s.snoozedAt && now - s.snoozedAt < RATE_SNOOZE_MS) return false;
  return true;
}

/**
 * Remember that this browser has rated (any entry point: the corner card, the
 * footer panel, the "Rate us" strip, /feedback). Ends the corner card and hides
 * the strip for good.
 */
export function markRated(now = Date.now()): void {
  try {
    const s = parseRateState(localStorage.getItem(RATE_STORAGE_KEY), now);
    localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify({ ...s, rated: true }));
  } catch {
    // Private mode: nothing to remember.
  }
  try {
    window.dispatchEvent(new Event("rc:rated")); // RateUsStrip hides at once
  } catch {
    /* not in a browser */
  }
}

/** Has this browser rated? (false when storage is blocked) */
export function hasRated(now = Date.now()): boolean {
  try {
    return parseRateState(localStorage.getItem(RATE_STORAGE_KEY), now).rated;
  } catch {
    return false;
  }
}
