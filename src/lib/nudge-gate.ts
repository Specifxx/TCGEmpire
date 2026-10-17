// WHEN A CORNER NUDGE MAY APPEAR AT ALL. Pure, so tests/nudge-gate.test.ts
// pins every branch. DECISIONS.md, "Nudges: value first", 2026-09-29.
//
// Since 2026-10-17 there is one corner Premium card, the Akali slider, for
// every visitor who is not Premium, signed in or out ("The Akali slider
// returns", DECISIONS.md). It has no page-view or account-age gate, only the
// pages it stays off (premiumSliderEligible, at the bottom). The signed-in
// card's 3rd-page / 48-hour gate and the signed-out sign-up card's 2nd-page
// gate went with it. The monthly subscriber's annual offer keeps its own gate.
//
// lib/nudge-timing.ts holds the delays, dismissal caps and snoozes; this file
// holds the ELIGIBILITY rules those sit on top of. lib/nudge-runtime.ts is the
// browser half (timers, watchers).

/** Whole-word path prefixes: "/tools" matches /tools and /tools/x, not /toolsmith. */
export function pathSkipped(pathname: string | null | undefined, skips: readonly string[]): boolean {
  if (!pathname) return false;
  return skips.some((p) => pathname === p || pathname.startsWith(p + "/"));
}


/** Milliseconds since `createdAt` (an ISO string or Date), or null when it is missing or unreadable. */
export function accountAgeMs(createdAt: string | Date | null | undefined, now: number = Date.now()): number | null {
  if (!createdAt) return null;
  const t = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  return Number.isFinite(t) ? Math.max(0, now - t) : null;
}


// ── The monthly subscriber's annual offer ───────────────────────────────────

/** From the 2nd page view of a session. */
export const ANNUAL_MIN_VIEWS = 2;

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

// ── The Akali slider (2026-10-17) ───────────────────────────────────────────
// One card for every visitor who is not Premium, signed in or out (owner: "even
// for signed-out accounts, it should just be there … after a couple seconds").
// No page-view or account-age gate any more; it stays off the pages where it
// would interrupt the thing someone came to do: signing in or paying, the
// ad-free arcade, embedded widgets, admin and the separate Pokémon section.
export const PREMIUM_SLIDER_SKIP_PATHS = ["/login", "/verify", "/premium", "/games", "/riftle", "/embed", "/admin", "/pokemon"] as const;

export function premiumSliderEligible({ pathname }: { pathname: string | null | undefined }): boolean {
  return !pathSkipped(pathname, PREMIUM_SLIDER_SKIP_PATHS);
}
