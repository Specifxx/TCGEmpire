// WHEN A CORNER NUDGE MAY APPEAR AT ALL. Pure, so tests/nudge-gate.test.ts
// pins every branch. DECISIONS.md, "Nudges: value first", 2026-09-29.
//
// The rule behind every number here: a visitor is shown what the site does
// BEFORE they are asked for anything, and a "no" is respected. So the signed-out
// sign-up card never covers a visit's first page view (unless they have really
// been reading it), and the signed-in Premium card waits until the account has
// had time to get something out of the free tier.
//
// lib/nudge-timing.ts holds the shared settle-in delay (NUDGE_DELAY_MS) and the
// dismissal caps and snoozes; this file holds the ELIGIBILITY rules those sit
// on top of. lib/nudge-runtime.ts is the browser half (timers, watchers).

// ── The sign-up card (signed-out) ───────────────────────────────────────────

/** Eligible from the 2nd page view of a visit. Never the 1st, from any referrer, on any device. */
export const SIGNUP_MIN_VIEWS = 2;

/**
 * ...or after this much ENGAGED time on the first page: the tab visible AND at
 * least one scroll, click or key press. A tab left open in the background, or a
 * page loaded and never touched, is not someone who has seen the site.
 */
export const SIGNUP_ENGAGED_MS = 45_000;

/**
 * Blog posts and /movers are where search and social traffic lands. 7 s was
 * enough there on 2026-09-27 and the card then covered the article they came
 * for; 30 s of real reading is the bar now.
 */
export const SIGNUP_LANDING_ENGAGED_MS = 30_000;

const LANDING_PREFIXES = ["/blog/", "/movers"];

export function isLandingPage(pathname: string | null | undefined): boolean {
  return !!pathname && LANDING_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Engaged time the first page needs before the sign-up card may show. */
export function signupEngagedNeededMs(pathname: string | null | undefined): number {
  return isLandingPage(pathname) ? SIGNUP_LANDING_ENGAGED_MS : SIGNUP_ENGAGED_MS;
}

export interface SignupGateInput {
  /** Distinct page views this visit (tab session), the current one included. */
  views: number;
  /** Engaged time on the current page, ms (engagedMsOf). */
  engagedMs: number;
  /** One of the landing pages (isLandingPage). */
  landing?: boolean;
  /** This tab has already visited /login or clicked a sign-in link. */
  signInStarted?: boolean;
}

// NO referrer, device or width in the input on purpose: whether they came from
// Reddit, Google or a typed URL, on a phone or a desktop, page one is page one.
export function signupPromoEligible({ views, engagedMs, landing, signInStarted }: SignupGateInput): boolean {
  if (signInStarted) return false; // they are already doing the thing the card asks for
  if (views >= SIGNUP_MIN_VIEWS) return true;
  return engagedMs >= (landing ? SIGNUP_LANDING_ENGAGED_MS : SIGNUP_ENGAGED_MS);
}

// The delay itself is NUDGE_DELAY_MS (lib/nudge-timing.ts), counted from the
// moment the card becomes eligible on the page: page load from the 2nd view on,
// the 45 s / 30 s engaged mark on a first page. There is deliberately no second,
// shorter number for either case.

// ── The Premium slide-in (signed in, no paid tier, checkout on) ─────────────

/** Not on the session's first two page views: eligible from the 3rd. */
export const PREMIUM_MIN_VIEWS = 3;

/** A new account's job is setup (WelcomeChecklist), not a purchase: 48 hours from User.createdAt. */
export const PREMIUM_MIN_ACCOUNT_AGE_MS = 48 * 3_600_000;

/** Whole-word path prefixes: "/tools" matches /tools and /tools/x, not /toolsmith. */
export function pathSkipped(pathname: string | null | undefined, skips: readonly string[]): boolean {
  if (!pathname) return false;
  return skips.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** The sign-up card's skipped paths: pages that are, or sell, the thing it asks for. */
export const SIGNUP_SKIP_PATHS = ["/login", "/verify", "/premium"] as const;

/**
 * The Premium card's skipped paths: the sign-in pages, /premium itself, and
 * every page that already carries its OWN inline paid prompt (the tools' blur
 * walls and limit panels, the watchlist/portfolio Plus upsell, the sealed
 * watches). Stacking a corner card on those is asking twice for one thing.
 */
export const PREMIUM_SKIP_PATHS = ["/login", "/verify", "/premium", "/tools", "/portfolio", "/watching", "/sealed"] as const;

/** Milliseconds since `createdAt` (an ISO string or Date), or null when it is missing or unreadable. */
export function accountAgeMs(createdAt: string | Date | null | undefined, now: number = Date.now()): number | null {
  if (!createdAt) return null;
  const t = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  return Number.isFinite(t) ? Math.max(0, now - t) : null;
}

export interface PremiumGateInput {
  /** Signed-in page views this session, the current one included. */
  views: number;
  /** accountAgeMs(); null (unknown) fails CLOSED: no ask without knowing how new they are. */
  accountAgeMs: number | null;
  pathname: string | null | undefined;
}

export function premiumSlideInEligible({ views, accountAgeMs: age, pathname }: PremiumGateInput): boolean {
  if (views < PREMIUM_MIN_VIEWS) return false;
  if (age === null || age < PREMIUM_MIN_ACCOUNT_AGE_MS) return false;
  return !pathSkipped(pathname, PREMIUM_SKIP_PATHS);
}

// ── The monthly subscriber's annual offer ───────────────────────────────────

/** From the 2nd page view of a session, like the sign-up card. */
export const ANNUAL_MIN_VIEWS = 2;

// ── Engaged time ────────────────────────────────────────────────────────────

export interface EngagedClock {
  /** Time this page has been in a visible tab, ms. */
  visibleMs: number;
  /** Scrolls, clicks, key presses and touches on this page so far. */
  interactions: number;
}

export const NEW_CLOCK: EngagedClock = { visibleMs: 0, interactions: 0 };

/** Advance the clock by `dtMs`; a hidden tab adds nothing. */
export function tickEngaged(c: EngagedClock, visible: boolean, dtMs: number): EngagedClock {
  return visible ? { ...c, visibleMs: c.visibleMs + dtMs } : c;
}

export function noteInteraction(c: EngagedClock): EngagedClock {
  return { ...c, interactions: c.interactions + 1 };
}

/** Engaged ms: the visible time, but only once there has been at least one interaction. */
export function engagedMsOf(c: EngagedClock): number {
  return c.interactions > 0 ? c.visibleMs : 0;
}

// ── Never mid-task ──────────────────────────────────────────────────────────

/** After a dialog or drawer closes, leave the visitor alone for this long. */
export const DIALOG_QUIET_MS = 10_000;
/** A scroll this recent means they are moving through the page. */
export const SCROLL_QUIET_MS = 1_000;
/** A key press this recent means they are typing. */
export const TYPING_QUIET_MS = 3_000;
/** How long to wait before looking again while an input has focus. */
export const INPUT_RECHECK_MS = 3_000;

export interface QuietInput {
  dialogOpen: boolean;
  /** A text field (input, textarea, select, contenteditable) has focus. */
  inputFocused: boolean;
  /** ms since the last dialog/drawer closed; Infinity when none has. */
  sinceDialogClosedMs: number;
  /** ms since the last scroll event; Infinity when none has. */
  sinceScrollMs: number;
  /** ms since the last key press; Infinity when none has. */
  sinceKeyMs: number;
}

/**
 * 0 when a nudge may appear right now; otherwise how long to wait before
 * asking again. Checked when the timer FIRES (a visitor can start a task during
 * the wait) as well as when it is armed.
 */
export function quietWaitMs(q: QuietInput): number {
  if (q.dialogOpen) return DIALOG_QUIET_MS;
  const waits = [0];
  if (q.inputFocused) waits.push(INPUT_RECHECK_MS);
  waits.push(DIALOG_QUIET_MS - q.sinceDialogClosedMs);
  waits.push(SCROLL_QUIET_MS - q.sinceScrollMs);
  waits.push(TYPING_QUIET_MS - q.sinceKeyMs);
  return Math.max(...waits.filter((w) => Number.isFinite(w)), 0);
}

const NON_TEXT_INPUT_TYPES = new Set(["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"]);

/** Is this element somewhere a person types (or picks from a list)? */
export function isTextEntry(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !NON_TEXT_INPUT_TYPES.has((el.type ?? "text").toLowerCase());
  return false;
}
